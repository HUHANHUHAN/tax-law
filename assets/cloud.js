/* 中国税法体系知识库 — 云端 / 本地 统一数据层
 * 业务代码只调用 window.TaxCloud.*，无需关心底层是云端还是本地。
 *
 * 切换到真实云端（WorkBuddy Cloud）：
 *   在加载本文件之前，于 index.html 中设置：
 *     window.TAX_CLOUD_CONFIG = { endpoint: "...", publishableKey: "..." };
 *   即自动走真实云数据库 + 登录，业务代码一行不用改。
 * 未设置时，默认使用本地实现（localStorage 持久化，离线可用）。
 */
(function () {
  "use strict";
  function boot() {
    var CONFIG = window.TAX_CLOUD_CONFIG || null;
    var MODE = (CONFIG && CONFIG.endpoint && CONFIG.publishableKey) ? "cloud" : "local";

    /* ---------- 本地存储（localStorage） ---------- */
    var LS = { profile: "taxkb_profile", bookmarks: "taxkb_bookmarks", notes: "taxkb_notes" };
    function lsGet(k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    }
    function lsSet(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function P(x) { return Promise.resolve(x); }

    /* ---------- 本地实现 ---------- */
    var local = {
      getProfile: function () { return P(lsGet(LS.profile, null)); },
      setProfile: function (name) { var p = { name: name, createdAt: Date.now() }; lsSet(LS.profile, p); return P(p); },
      isBookmarked: function (noteId) {
        return P(lsGet(LS.bookmarks, []).some(function (x) { return x.noteId === noteId; }));
      },
      toggleBookmark: function (noteId, title) {
        var arr = lsGet(LS.bookmarks, []);
        var i = arr.findIndex(function (x) { return x.noteId === noteId; });
        if (i >= 0) { arr.splice(i, 1); lsSet(LS.bookmarks, arr); return P({ bookmarked: false }); }
        arr.unshift({ id: uid(), noteId: noteId, title: title, createdAt: Date.now() });
        lsSet(LS.bookmarks, arr); return P({ bookmarked: true });
      },
      listBookmarks: function () { return P(lsGet(LS.bookmarks, [])); },
      getNote: function (noteId) { var n = lsGet(LS.notes, {}); return P(n[noteId] || null); },
      saveNote: function (noteId, content) {
        var n = lsGet(LS.notes, {}); n[noteId] = { content: content, updatedAt: Date.now() };
        lsSet(LS.notes, n); return P({ ok: true });
      },
      listNotes: function () {
        var n = lsGet(LS.notes, {});
        return P(Object.keys(n).map(function (k) { return { noteId: k, content: n[k].content, updatedAt: n[k].updatedAt }; }));
      }
    };

    /* ---------- 云端实现（WorkBuddy Cloud SDK） ---------- */
    var cloudClient = null;
    function loadCloud() {
      if (cloudClient) return Promise.resolve(cloudClient);
      return new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js";
        s.onload = function () {
          try {
            cloudClient = WorkBuddyCloud.createWorkBuddyCloud({
              endpoint: CONFIG.endpoint, publishableKey: CONFIG.publishableKey
            });
            resolve(cloudClient);
          } catch (e) { reject(e); }
        };
        s.onerror = function () { reject(new Error("云端 SDK 加载失败")); };
        document.head.appendChild(s);
      });
    }
    function cloudApi() {
      return loadCloud().then(function (cloud) {
        return {
          getProfile: function () {
            return cloud.auth.getSession().then(function (r) {
              return (r.data && r.data.user) ? { name: r.data.user.email || r.data.user.id } : null;
            });
          },
          setProfile: function (name) { return P({ name: name }); },
          isBookmarked: function (noteId) {
            return cloud.database.from("bookmarks").select("id").eq("note_id", noteId)
              .then(function (r) { return !!(r.data && r.data.length); });
          },
          toggleBookmark: function (noteId, title) {
            return cloud.database.from("bookmarks").select("id").eq("note_id", noteId).then(function (r) {
              if (r.data && r.data.length) {
                return cloud.database.from("bookmarks").delete().eq("id", r.data[0].id)
                  .then(function () { return { bookmarked: false }; });
              }
              return cloud.database.from("bookmarks").insert({ note_id: noteId, title: title })
                .then(function () { return { bookmarked: true }; });
            });
          },
          listBookmarks: function () {
            return cloud.database.from("bookmarks").select("note_id,title,created_at")
              .order("created_at", { ascending: false })
              .then(function (r) {
                return (r.data || []).map(function (x) { return { noteId: x.note_id, title: x.title, createdAt: x.created_at }; });
              });
          },
          getNote: function (noteId) {
            return cloud.database.from("notes").select("content,updated_at").eq("note_id", noteId)
              .maybeSingle().then(function (r) { return r.data ? { content: r.data.content, updatedAt: r.data.updated_at } : null; });
          },
          saveNote: function (noteId, content) {
            return cloud.database.from("notes").select("note_id").eq("note_id", noteId).then(function (r) {
              if (r.data && r.data.length) {
                return cloud.database.from("notes").update({ content: content }).eq("note_id", noteId)
                  .then(function () { return { ok: true }; });
              }
              return cloud.database.from("notes").insert({ note_id: noteId, content: content })
                .then(function () { return { ok: true }; });
            });
          },
          listNotes: function () {
            return cloud.database.from("notes").select("note_id,content,updated_at")
              .order("updated_at", { ascending: false })
              .then(function (r) {
                return (r.data || []).map(function (x) { return { noteId: x.note_id, content: x.content, updatedAt: x.updated_at }; });
              });
          }
        };
      });
    }

    /* ---------- 对外统一接口 ---------- */
    function api() { return MODE === "cloud" ? cloudApi() : P(local); }
    function call(method) {
      var args = Array.prototype.slice.call(arguments, 1);
      return api().then(function (a) { return a[method].apply(a, args); });
    }
    window.TaxCloud = {
      mode: MODE,
      getMode: function () { return MODE; },
      getProfile: function () { return call("getProfile"); },
      setProfile: function (n) { return call("setProfile", n); },
      isBookmarked: function (id) { return call("isBookmarked", id); },
      toggleBookmark: function (id, t) { return call("toggleBookmark", id, t); },
      listBookmarks: function () { return call("listBookmarks"); },
      getNote: function (id) { return call("getNote", id); },
      saveNote: function (id, c) { return call("saveNote", id, c); },
      listNotes: function () { return call("listNotes"); },
      auth: {
        available: MODE === "cloud",
        signIn: function (email, password) {
          return loadCloud().then(function (c) { return c.auth.signInWithPassword({ email: email, password: password }); });
        },
        signOut: function () { return loadCloud().then(function (c) { return c.auth.signOut(); }); },
        getSession: function () { return loadCloud().then(function (c) { return c.auth.getSession(); }); },
        onAuthStateChange: function (cb) { return loadCloud().then(function (c) { return c.auth.onAuthStateChange(cb); }); }
      }
    };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
