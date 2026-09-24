/* 中国税法体系知识库 — 前端单页应用 */
(function () {
  "use strict";
  var NOTES = window.NOTES || {};
  var META = window.META || [];
  var STATS = window.STATS || { law_count: 0, card_count: 0, link_count: 0, species: [] };
  var TaxCloud = window.TaxCloud;

  var $ = function (s) { return document.querySelector(s); };
  var content = $("#content");
  var sidebar = $("#sidebar-nav");
  var backEl = $("#backlinks");
  var searchInput = $("#search");
  var resultsEl = $("#search-results");

  function enc(id) { return encodeURIComponent(id); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  /* ---------- 侧栏导航 ---------- */
  function buildNav() {
    var groups = { "法律原文": {}, "概念卡片": {} };
    META.forEach(function (m) {
      var g = m.group, sp = m.species || "其他";
      if (!groups[g]) groups[g] = {};
      if (!groups[g][sp]) groups[g][sp] = [];
      groups[g][sp].push(m);
    });
    var html = "";
    ["法律原文", "概念卡片"].forEach(function (g) {
      var spMap = groups[g] || {};
      var spList = Object.keys(spMap).sort(function (a, b) { return a.localeCompare(b, "zh"); });
      html += '<div class="nav-group"><div class="nav-group-title">' + g + "</div>";
      spList.forEach(function (sp) {
        var items = spMap[sp].slice().sort(function (a, b) { return a.title.localeCompare(b.title, "zh"); });
        html += '<div class="nav-species"><div class="nav-species-title">' + sp + '</div><div class="nav-items">';
        items.forEach(function (it) {
          html += '<a class="nav-item" data-id="' + it.id + '" href="#/note/' + enc(it.id) + '">' +
            '<span class="dot ' + it.type + '"></span>' + it.title + "</a>";
        });
        html += "</div></div>";
      });
      html += "</div>";
    });
    sidebar.innerHTML = html;
  }

  /* ---------- 路由 ---------- */
  function currentKey() {
    var h = location.hash || "";
    if (h.indexOf("#/note/") === 0) return dec(h.slice("#/note/".length));
    return null;
  }

  function setActive(key) {
    var items = sidebar.querySelectorAll(".nav-item");
    items.forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-id") === key);
    });
  }

  function renderBacklinks(n) {
    var bl = n.backlinks || [];
    if (!bl.length) { backEl.innerHTML = '<div class="panel-empty">暂无其他条目引用本页</div>'; return; }
    var html = '<div class="bl-list">';
    bl.forEach(function (b) {
      html += '<a class="bl-item" href="#/note/' + enc(b.id) + '">' +
        '<span class="dot ' + b.type + '"></span>' + b.title + "</a>";
    });
    html += "</div>";
    backEl.innerHTML = html;
  }

  function renderHome() {
    var chips = (STATS.species || []).map(function (s) { return '<span class="chip">' + s + "</span>"; }).join("");
    content.innerHTML =
      '<div class="home">' +
      "<h1>中国税法体系知识库</h1>" +
      '<p class="lead">以「立法条文 + 核心词条」双层结构组织的可漫游税法知识库。每一部税法的原文均标注核心词条并相互链接，点开任一词条即可看到它在各法律中的出处与关联——这正是理解条文之间关系的入口。</p>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + STATS.law_count + "</b><span>法律 / 法规原文</span></div>" +
      '<div class="stat"><b>' + STATS.card_count + "</b><span>核心概念词条</span></div>" +
      '<div class="stat"><b>' + STATS.link_count + "</b><span>双向链接</span></div>" +
      "</div>" +
      '<h2>涵盖税种</h2><div class="chips">' + chips + "</div>" +
      "<h2>如何使用</h2><ul>" +
      "<li>左侧按「税种」浏览法律原文与概念词条；</li>" +
      "<li>正文中的蓝色词条均为可点击链接，点击即跳转；</li>" +
      "<li>右侧「关联引用」列出引用本页的其他条文，呈现知识网络；</li>" +
      "<li>点正文上方「☆ 收藏」可保存本页，「✎ 笔记」可写个人批注（本地保存）；</li>" +
      "<li>顶部搜索框可快速定位任意法律或词条。</li>" +
      "</ul></div>";
    backEl.innerHTML = '<div class="panel-empty">在左侧选择法律或词条开始浏览</div>';
  }

  function renderNotFound(key) {
    content.innerHTML = '<div class="home"><h1>未找到条目</h1>' +
      '<p class="lead">没有找到「' + key + '」。请从左侧目录或搜索中选择。</p></div>';
    backEl.innerHTML = '<div class="panel-empty">—</div>';
  }

  function render() {
    var key = currentKey();
    if (!key) { renderHome(); setActive(null); document.title = "中国税法体系知识库"; collapseNav(); return; }
    var n = NOTES[key];
    if (!n) { renderNotFound(key); setActive(null); collapseNav(); return; }
    content.innerHTML = n.html;
    if (key) { content.insertAdjacentHTML("afterbegin", pageToolsHtml(n)); bindPageTools(n); }
    renderBacklinks(n);
    setActive(key);
    document.title = n.title + " · 中国税法体系知识库";
    var sc = $("#main-scroll"); if (sc) sc.scrollTop = 0;
    collapseNav();
  }

  /* ---------- 云端功能：收藏 / 笔记 / 我的 ---------- */
  function showModal(title, bodyHtml) {
    var root = $("#modal-root");
    root.innerHTML =
      '<div class="modal-backdrop" data-close="1"></div>' +
      '<div class="modal"><div class="modal-head"><span>' + title + '</span>' +
      '<button class="modal-x" type="button" data-close="1" aria-label="关闭">✕</button></div>' +
      '<div class="modal-body">' + bodyHtml + '</div></div>';
    root.classList.add("open");
  }
  function closeModal() {
    var root = $("#modal-root");
    root.classList.remove("open"); root.innerHTML = "";
  }
  function pageToolsHtml(n) {
    return '<div class="page-tools" id="page-tools">' +
      '<button id="bm-btn" class="tool-btn" type="button">☆ 收藏</button>' +
      '<button id="note-btn" class="tool-btn" type="button">✎ 笔记</button>' +
      '<span class="tool-mode">本地保存</span></div>';
  }
  function bindPageTools(n) {
    if (typeof TaxCloud === 'undefined') return; // 纯静态环境，跳过云服务功能
    
    var bm = $("#bm-btn");
    if (bm) {
      TaxCloud.isBookmarked(n.id).then(function (b) {
        bm.classList.toggle("on", b);
        bm.textContent = b ? "★ 已收藏" : "☆ 收藏";
      });
      bm.addEventListener("click", function () {
        TaxCloud.toggleBookmark(n.id, n.title).then(function (r) {
          bm.classList.toggle("on", r.bookmarked);
          bm.textContent = r.bookmarked ? "★ 已收藏" : "☆ 收藏";
        });
      });
    }
}
    var nb = $("#note-btn");
    if (nb) {
      nb.addEventListener("click", function () {
        TaxCloud.getNote(n.id).then(function (nt) { openNoteEditor(n, nt ? nt.content : ""); });
      });
    }
  }
  function openNoteEditor(n, content) {
    var html = '<p class="note-tip">为《' + n.title + '》写个人批注，内容仅保存在本设备本地。</p>' +
      '<textarea id="note-area" class="note-area" placeholder="输入你的理解、疑问或标注…">' + (content || "") + '</textarea>' +
      '<div class="note-foot"><span id="note-save-hint" class="note-save-hint"></span>' +
      '<button id="note-save" class="btn-primary" type="button">保存</button></div>';
    showModal("个人笔记", html);
    var area = $("#note-area"), hint = $("#note-save-hint");
    function doSave() {
      TaxCloud.saveNote(n.id, area.value).then(function () {
        hint.textContent = "已保存 ✓"; setTimeout(function () { if (hint) hint.textContent = ""; }, 1500);
      });
    }
    $("#note-save").addEventListener("click", doSave);
    area.addEventListener("blur", doSave);
  }
  function updateMyBtn() {
    var b = $("#my-btn"); if (!b) return;
    TaxCloud.getProfile().then(function (p) {
      if (p && p.name) { b.textContent = "👤 " + p.name; b.classList.add("signed"); }
      else { b.textContent = "我的"; b.classList.remove("signed"); }
    });
  }
  function openMyPanel() {
    TaxCloud.getProfile().then(function (p) {
      TaxCloud.listBookmarks().then(function (bms) {
        TaxCloud.listNotes().then(function (nts) {
          var bmHtml = bms.length ? bms.map(function (x) {
            return '<a class="my-item" href="#/note/' + enc(x.noteId) + '">☆ ' + x.title + '</a>';
          }).join("") : '<div class="panel-empty">还没有收藏</div>';
          var ntHtml = nts.length ? nts.map(function (x) {
            var t = NOTES[x.noteId];
            return '<a class="my-item" href="#/note/' + enc(x.noteId) + '">✎ ' + (t ? t.title : x.noteId) + '</a>';
          }).join("") : '<div class="panel-empty">还没有笔记</div>';
          var nameRow = (p && p.name) ? '<div class="my-name">当前身份：<b>' + p.name + '</b></div>'
            : '<div class="my-name">未设置本地身份</div>';
          var html = nameRow +
            '<button id="my-setname" class="btn-ghost" type="button">设置本地身份</button>' +
            '<h3 class="my-h">我的收藏</h3><div class="my-list">' + bmHtml + '</div>' +
            '<h3 class="my-h">我的笔记</h3><div class="my-list">' + ntHtml + '</div>';
          showModal("我的资料", html);
          $("#my-setname").addEventListener("click", function () {
            var name = prompt("设置本地身份名称（仅本设备）：", (p && p.name) || "");
            if (name && name.trim()) {
              TaxCloud.setProfile(name.trim()).then(function () { updateMyBtn(); openMyPanel(); });
            }
          });
        });
      });
    });
  }
  function openAiPanel() {
    var html = '<div class="ai-offline">' +
      '<p><b>AI 问答助手</b>需开通云服务（LLM 能力）后启用。</p>' +
      '<p>当前为<strong>本地离线模式</strong>：收藏、笔记、个人身份均可正常使用，但智能问答暂不可用。</p>' +
      '<p class="ai-note">开通云服务、并在 <code>index.html</code> 中填入 <code>publicConfig</code> 后，这里即可基于税法知识库进行智能问答。</p>' +
      '</div>';
    showModal("AI 问答助手", html);
  }
  function initCloud() { updateMyBtn(); }

  /* ---------- 搜索 ---------- */
  function doSearch() {
    var q = (searchInput.value || "").trim().toLowerCase();
    if (!q) { resultsEl.style.display = "none"; resultsEl.innerHTML = ""; return; }
    var matches = META.filter(function (m) {
      return (m.title || "").toLowerCase().indexOf(q) >= 0 ||
        (m.nid || "").toLowerCase().indexOf(q) >= 0 ||
        (m.species || "").toLowerCase().indexOf(q) >= 0;
    }).slice(0, 40);
    if (!matches.length) {
      resultsEl.style.display = "block";
      resultsEl.innerHTML = '<div class="res-empty">未找到匹配项</div>';
      return;
    }
    resultsEl.style.display = "block";
    resultsEl.innerHTML = matches.map(function (m) {
      var t = m.group === "法律原文" ? "法" : "词条";
      return '<a class="res-item" href="#/note/' + enc(m.id) + '">' +
        '<span class="dot ' + m.type + '"></span>' +
        '<span class="res-title">' + m.title + '</span>' +
        '<span class="res-type ' + m.type + '">' + t + "</span></a>";
    }).join("");
  }

  function collapseNav() {
    if (window.innerWidth <= 760) document.body.classList.remove("nav-open");
  }

  /* ---------- 事件 ---------- */
  searchInput.addEventListener("input", doSearch);
  resultsEl.addEventListener("click", function () {
    resultsEl.style.display = "none"; searchInput.value = "";
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".search-wrap")) { resultsEl.style.display = "none"; }
  });
  $("#menu-btn").addEventListener("click", function () {
    document.body.classList.toggle("nav-open");
  });
  $("#my-btn").addEventListener("click", openMyPanel);
  $("#ai-btn").addEventListener("click", openAiPanel);
  $("#modal-root").addEventListener("click", function (e) {
    if (e.target.getAttribute("data-close") || e.target.closest(".my-item")) closeModal();
  });
  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", function () { buildNav(); render(); initCloud(); });
  // 若脚本在 DOMContentLoaded 之后才执行（本页如此），直接初始化
  if (document.readyState !== "loading") { buildNav(); render(); initCloud(); }
})();
