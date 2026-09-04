/* ══════════════════════════════════════════════════════════════════════
   core.js — shared mock chrome + the conservative set (options 1-4).
   Exposes window.PD_MOCK so bold.js can build on the same modal.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var ICONS = window.PD_ICONS || { entries: {}, glyphs: {} };

  function glyph(name, color, size) {
    var raw = ICONS.glyphs[name];
    if (!raw) return "";
    return '<span style="width:' + size + "px;height:" + size + "px;color:" + color +
      ';display:flex;align-items:center;justify-content:center">' +
      raw.replace("<svg", '<svg width="' + size + '" height="' + size + '"') + "</span>";
  }

  /* Renders a plugin icon exactly the way ToolkitIconFrame would:
     a file svg bleeds full-frame on its own artwork; a builtin glyph sits
     on its brand ground; nothing at all falls back to the grey mcp glyph
     on a quiet plate — which is the real state of 7 of 18 entries. */
  function pluginIcon(id, box, radius) {
    var e = ICONS.entries[id] || {};
    var ic = e.icon;
    var r = radius === undefined ? Math.round(box * 0.27) : radius;
    var style = "width:" + box + "px;height:" + box + "px;border-radius:" + r + "px";
    if (ic && ic.kind === "svg") {
      var inner = box * (ic.scale ? ic.scale : 1);
      return '<span class="pk-ic" style="' + style +
        (ic.scale ? ";background:rgba(var(--pupu-text-rgb),0.06)" : "") + '">' +
        '<span style="width:' + inner + "px;height:" + inner + 'px;display:block">' +
        ic.svg.replace("<svg", '<svg width="' + inner + '" height="' + inner + '"') + "</span></span>";
    }
    if (ic && ic.kind === "builtin") {
      return '<span class="pk-ic" style="' + style + ";background:" + ic.bg + '">' +
        glyph(ic.name, ic.color, Math.round(box * 0.55)) + "</span>";
    }
    return '<span class="pk-ic pk-ic-plain" style="' + style + '">' +
      glyph("mcp", "#9aa0a6", Math.round(box * 0.52)) + "</span>";
  }

  function name(id) { return (ICONS.entries[id] || {}).name || id; }

  /* Hand-drawn UI glyphs. These are ours — capability and chrome marks,
     never a stand-in for a publisher's brand. */
  var UI = {
    discover: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="8.4"/><path d="M15.2 8.8 10.6 10.6 8.8 15.2 13.4 13.4Z" fill="currentColor" stroke="none"/></svg>',
    store: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 9.2h16.8v9.4a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6Z"/><path d="M3.6 9.2 5.4 4.6h13.2l1.8 4.6"/><path d="M9.6 13.4h4.8"/></svg>',
    installed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v10"/><path d="M8 10.4 12 14.4l4-4"/><path d="M4.6 17v1.6a1.6 1.6 0 0 0 1.6 1.6h11.6a1.6 1.6 0 0 0 1.6-1.6V17"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6 18 18M18 6 6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.4"/><path d="m15.6 15.6 4 4"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 5.5 7 6.5-7 6.5"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.6 4.6 4.6L19 6.8"/></svg>',
    capBrowse: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.4" y="5" width="21.2" height="17" rx="3"/><path d="M3.4 10h21.2"/><circle cx="7" cy="7.5" r="0.9" fill="currentColor" stroke="none"/><path d="M9 15.4h7.4M9 18.4h4.6"/></svg>',
    capFiles: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.8 8.2a2.4 2.4 0 0 1 2.4-2.4h3.9c.7 0 1.4.3 1.9.9l1.2 1.4h8.6a2.4 2.4 0 0 1 2.4 2.4v9.3a2.4 2.4 0 0 1-2.4 2.4H6.2a2.4 2.4 0 0 1-2.4-2.4Z"/><path d="M3.8 13.4h20.4"/></svg>',
    capMemory: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="14" cy="14" r="3.1"/><circle cx="6.4" cy="8.4" r="2.3"/><circle cx="21.8" cy="10.2" r="2.3"/><circle cx="9.2" cy="21.4" r="2.3"/><path d="m11.4 12.1-3-2.2M17 13.2l2.6-.6M12.4 16.6l-1.6 2.9"/></svg>',
    capCode: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m10 9.6-4.8 4.6 4.8 4.6"/><path d="m18 9.6 4.8 4.6-4.8 4.6"/><path d="m15.4 6.4-2.8 15.2"/></svg>',
    capSkill: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4.6 16.9 10l6 .9-4.35 4.2 1.03 5.95L14 18.25 8.42 21.05l1.03-5.95L5.1 10.9l6-.9Z"/></svg>',
    mcpMark: (ICONS.glyphs.mcp || "").replace("<svg", '<svg width="100%" height="100%"')
  };

  /* ───── shared chrome ───── */
  function sidebar(activeId, navItems) {
    var items = navItems || [
      { id: "discover", icon: "discover", label: "Discover" },
      { id: "store", icon: "store", label: "Store" },
      { id: "installed", icon: "installed", label: "Installed", count: 9 }
    ];
    return '<div class="pk-side"><div class="pk-side-title">Plugins</div>' +
      items.map(function (it) {
        return '<div class="pk-nav' + (it.id === activeId ? " pk-on" : "") + '">' +
          UI[it.icon] + "<span>" + it.label + "</span>" +
          (it.count !== undefined ? '<span class="pk-nav-count">' + it.count + "</span>" : "") +
          "</div>";
      }).join("") + "</div>";
  }

  function shell(activeId, headHtml, bodyHtml, navItems) {
    return sidebar(activeId, navItems) +
      '<div class="pk-main">' +
      '<div class="pk-close">' + UI.close + "</div>" +
      '<div class="pk-head">' + headHtml + "</div>" +
      '<div class="pk-body">' + bodyHtml + '<div class="pk-fold"></div></div>' +
      "</div>";
  }

  function sectionHead(label, action) {
    return '<div class="pk-sec"><span class="pk-sec-l">' + label + "</span>" +
      (action ? '<span class="pk-sec-a">' + action + " ›</span>" : "") + "</div>";
  }

  function row(id, desc, pill, iconBox) {
    var box = iconBox || 26;
    return '<div class="pk-row">' + pluginIcon(id, box) +
      '<div class="pk-row-txt"><div class="pk-name">' + name(id) + "</div>" +
      '<div class="pk-desc">' + desc + "</div></div>" +
      '<span class="pk-pill' + (pill === "OPEN" ? " pk-pill-open" : "") + '">' + pill + "</span></div>";
  }

  function band(id, ground, kicker, title, blurb, pill) {
    return '<div class="pk-band" data-item style="background:' + ground + '">' +
      pluginIcon(id, 40, 11) +
      '<div style="flex:1;min-width:0">' +
      '<div class="pk-band-kick">' + kicker + "</div>" +
      '<div class="pk-band-title">' + title + "</div>" +
      '<div class="pk-band-blurb">' + blurb + "</div></div>" +
      (pill ? '<span class="pk-pill pk-pill-hero">' + pill + "</span>" : "") +
      "</div>";
  }

  function collectionRow(title, blurb, ids) {
    var stack = ids.slice(0, 3).map(function (id, i) {
      return '<span style="margin-left:' + (i === 0 ? 0 : -8) + "px;box-shadow:0 0 0 2px var(--pupu-background);" +
        'border-radius:8px;display:flex">' + pluginIcon(id, 24, 8) + "</span>";
    }).join("");
    return '<div class="pk-row">' +
      '<span style="display:flex;flex:0 0 auto">' + stack + "</span>" +
      '<div class="pk-row-txt"><div class="pk-name">' + title + "</div>" +
      '<div class="pk-desc">' + blurb + " · " + ids.length + " plugins</div></div>" +
      '<span style="width:14px;height:14px;opacity:0.3;flex:0 0 auto">' + UI.chev + "</span></div>";
  }

  function packRow(title, blurb, count) {
    return '<div class="pk-row">' +
      '<span class="pk-ic pk-ic-plain" style="width:26px;height:26px;border-radius:7px;color:rgba(var(--pupu-text-rgb),0.5)">' +
      '<span style="width:15px;height:15px;display:block">' + UI.capSkill + "</span></span>" +
      '<div class="pk-row-txt"><div class="pk-name">' + title + "</div>" +
      '<div class="pk-desc">' + blurb + "</div></div>" +
      '<span class="pk-desc" style="flex:0 0 auto;margin-right:8px">' + count + "</span>" +
      '<span class="pk-pill">GET</span></div>';
  }

  /* ══════════ 1 · Quiet Index ══════════ */
  function option1() {
    var head = '<div class="pk-title">Discover</div>' +
      '<div class="pk-sub">给你的 agent 添一项新本事。</div>';
    var body =
      '<div class="pk-row" style="padding:10px 0 9px">' + pluginIcon("mcp.dev.github-remote", 34, 10) +
        '<div class="pk-row-txt">' +
        '<div class="pk-sec-l" style="font-size:9px;letter-spacing:0.14em;margin-bottom:1px">Editor’s pick</div>' +
        '<div class="pk-name" style="font-size:13.5px">GitHub, in the chat</div>' +
        '<div class="pk-desc">读仓库、看 issue 和 PR，直接在对话里改你的代码</div></div>' +
        '<span class="pk-pill">GET</span></div>' +
      sectionHead("Essentials", "See all") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05);margin-top:4px">' +
      row("mcp.browser.chrome-devtools", "调试网页：控制台、网络、性能追踪", "OPEN") +
      row("mcp.browser.playwright", "自动操作浏览器：打开、点击、抓取", "OPEN") +
      row("mcp.workspace.filesystem", "在授权目录里读写文件", "GET") +
      row("mcp.memory.memory", "把知识记成图谱，跨会话留存", "GET") + "</div>" +
      sectionHead("Collections") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05);margin-top:4px">' +
      collectionRow("Web Research Kit", "看、逛、抽取 —— 完整的调研闭环", ["mcp.browser.playwright", "mcp.browser.chrome-devtools"]) +
      collectionRow("Workspace Kit", "读文件、转文档、抓网页内容", ["mcp.workspace.filesystem", "mcp.workspace.markitdown", "mcp.workspace.fetch"]) +
      collectionRow("Local Knowledge Kit", "无凭据地记笔记、查本地数据", ["mcp.memory.memory", "mcp.workspace.sqlite"]) + "</div>" +
      sectionHead("Skill packs") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05);margin-top:4px">' +
      packRow("Superpowers Essentials", "五条经过实战的软件开发方法论", "5 skills") +
      packRow("Prompt Master", "把粗糙想法打磨成生产级提示词", "1 skill") +
      packRow("Frontend Design", "Anthropic 的反模板 UI 设计方法论", "1 skill") + "</div>";
    return shell("discover", head, body);
  }

  /* ══════════ 2 · Capability-first ══════════ */
  function capCard(icon, title, outcome, meta, accent) {
    return '<div data-item style="display:flex;align-items:center;gap:12px;padding:12px 13px;' +
      'border-radius:12px;background:var(--pupu-quiet)">' +
      '<span style="width:38px;height:38px;border-radius:11px;flex:0 0 auto;display:flex;align-items:center;' +
      "justify-content:center;background:" + accent + "18;color:" + accent + '">' +
      '<span style="width:21px;height:21px;display:block">' + UI[icon] + "</span></span>" +
      '<div style="flex:1;min-width:0">' +
      '<div class="pk-name" style="font-size:12.5px">' + title + "</div>" +
      '<div class="pk-desc" style="font-size:10.5px">' + outcome + "</div></div>" +
      '<div style="flex:0 0 auto;text-align:right"><div class="pk-desc" style="font-size:10px;margin:0">' +
      meta + "</div></div>" +
      '<span style="width:13px;height:13px;opacity:0.28;flex:0 0 auto">' + UI.chev + "</span></div>";
  }

  function option2() {
    var head = '<div class="pk-title">Discover</div>' +
      '<div class="pk-sub">你想让 agent 学会做什么？</div>';
    var body =
      '<div style="margin-top:6px">' +
      band("mcp.dev.github-remote", "#1f2328", "Editor's pick", "GitHub, in the chat",
        "读仓库、看 issue 和 PR，直接在对话里改代码。", "GET") + "</div>" +
      sectionHead("Abilities", "See all") +
      '<div style="display:flex;flex-direction:column;gap:8px;padding-top:4px">' +
      capCard("capBrowse", "看得见网页", "打开页面、点击、把内容读回来", "2 plugins · 已装 1", "#5b9dff") +
      capCard("capFiles", "读写你的文件", "在授权目录里读、写、转换文档", "3 plugins", "#f0a868") +
      capCard("capMemory", "记得住事情", "跨会话留存事实，不用你重讲一遍", "2 plugins", "#a98bfb") +
      capCard("capCode", "连得上你的代码", "仓库、issue、PR —— 需要一次授权", "1 plugin", "#6fd48d") +
      capCard("capSkill", "学会新的做事方法", "调研、调试、写计划的成套方法论", "3 packs", "#ff8fb8") +
      "</div>";
    return shell("discover", head, body);
  }

  /* ══════════ 3 · Shelf ══════════ */
  function shelfCard(id, blurb, pill) {
    return '<div data-item style="flex:0 0 auto;width:172px;border-radius:12px;background:var(--pupu-quiet);' +
      'padding:12px 13px;display:flex;flex-direction:column;gap:9px">' +
      '<div style="display:flex;align-items:center;gap:9px">' + pluginIcon(id, 30, 9) +
      '<div class="pk-name" style="font-size:12px">' + name(id) + "</div></div>" +
      '<div class="pk-desc" style="white-space:normal;line-height:1.45;height:30px;overflow:hidden">' + blurb + "</div>" +
      '<div style="display:flex"><span class="pk-pill' + (pill === "OPEN" ? " pk-pill-open" : "") +
      '" style="margin-left:auto">' + pill + "</span></div></div>";
  }

  function brick(id, blurb, pill) {
    return '<div class="pk-brick"><div style="display:flex;align-items:center;gap:9px">' + pluginIcon(id, 28, 8) +
      '<div class="pk-name" style="font-size:12px">' + name(id) + "</div>" +
      '<span class="pk-pill' + (pill === "OPEN" ? " pk-pill-open" : "") + '" style="margin-left:auto">' +
      pill + "</span></div>" + '<div class="pk-desc">' + blurb + "</div></div>";
  }

  /* Skill packs carry no publisher mark at all — a monogram would be the
     fabricated-brand move the icon doctrine already vetoed, so they get
     the same neutral capability glyph everywhere. */
  function packBrick(title, sub) {
    return '<div class="pk-brick" style="gap:6px"><div style="display:flex;align-items:center;gap:9px">' +
      '<span style="width:28px;height:28px;border-radius:8px;flex:0 0 auto;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(var(--pupu-text-rgb),0.07);color:rgba(var(--pupu-text-rgb),0.5)">' +
      '<span style="width:15px;height:15px;display:block">' + UI.capSkill + "</span></span>" +
      '<div class="pk-name" style="font-size:12px">' + title + "</div>" +
      '<span class="pk-pill" style="margin-left:auto">GET</span></div>' +
      '<div class="pk-desc">' + sub + "</div></div>";
  }

  function option3() {
    var body =
      '<div style="margin-top:4px">' +
      band("mcp.dev.github-remote", "#1f2328", "Editor's pick", "GitHub, in the chat",
        "读仓库、看 issue 和 PR，直接在对话里改代码。", "GET") + "</div>" +
      sectionHead("Editor's picks", "See all") +
      '<div style="display:flex;gap:9px;padding-top:4px;overflow:hidden;position:relative">' +
      shelfCard("mcp.browser.chrome-devtools", "调试网页：控制台、网络、性能追踪", "OPEN") +
      shelfCard("mcp.browser.playwright", "自动操作浏览器：打开、点击、抓取内容", "OPEN") +
      shelfCard("mcp.devops.sentry-remote", "把线上报错拉进对话里排查", "GET") +
      '<div style="position:absolute;right:0;top:0;bottom:0;width:36px;' +
      'background:linear-gradient(to right,transparent,var(--pupu-background))"></div></div>' +
      sectionHead("Essentials") +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;padding-top:4px">' +
      brick("mcp.workspace.filesystem", "在授权目录里读写文件", "GET") +
      brick("mcp.memory.memory", "把知识记成图谱，跨会话留存", "GET") + "</div>" +
      sectionHead("Skill packs") +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;padding-top:4px">' +
      packBrick("Superpowers", "五条实战开发方法论") +
      packBrick("Prompt Master", "打磨生产级提示词") + "</div>";
    return shell("discover", '<div class="pk-title">Discover</div>', body);
  }

  /* ══════════ 4 · One List ══════════ */
  function option4() {
    var head = '<div class="pk-title">Plugins</div>' +
      '<div style="margin-top:12px;display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:9px;' +
      'background:rgba(var(--pupu-text-rgb),0.05);border:1px solid rgba(var(--pupu-text-rgb),0.06)">' +
      '<span style="width:14px;height:14px;opacity:0.4;flex:0 0 auto">' + UI.search + "</span>" +
      '<span style="font-size:12px;color:rgba(var(--pupu-text-rgb),0.34);font-weight:300">Search plugins</span></div>';

    var sticky = function (label) {
      return '<div class="pk-sec" style="position:sticky;top:0;background:var(--pupu-background);z-index:2;' +
        'padding:11px 0 5px"><span class="pk-sec-l">' + label + "</span></div>";
    };

    var body =
      sticky("Editor's pick") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05)">' +
      row("mcp.dev.github-remote", "读仓库、看 issue 和 PR，直接在对话里改代码", "GET") + "</div>" +
      sticky("Essentials") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05)">' +
      row("mcp.browser.chrome-devtools", "调试网页：控制台、网络、性能追踪", "OPEN") +
      row("mcp.browser.playwright", "自动操作浏览器：打开、点击、抓取", "OPEN") +
      row("mcp.workspace.filesystem", "在授权目录里读写文件", "GET") +
      row("mcp.memory.memory", "把知识记成图谱，跨会话留存", "GET") + "</div>" +
      sticky("Collections") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05)">' +
      collectionRow("Web Research Kit", "看、逛、抽取 —— 完整的调研闭环", ["mcp.browser.playwright", "mcp.browser.chrome-devtools"]) +
      collectionRow("Workspace Kit", "读文件、转文档、抓网页内容", ["mcp.workspace.filesystem", "mcp.workspace.markitdown", "mcp.workspace.fetch"]) + "</div>" +
      sticky("Skill packs") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05)">' +
      packRow("Superpowers Essentials", "五条经过实战的软件开发方法论", "5 skills") +
      packRow("Prompt Master", "把粗糙想法打磨成生产级提示词", "1 skill") + "</div>" +
      '<div style="display:flex;align-items:center;gap:8px;padding:13px 0 0;color:var(--pupu-pill);' +
      'font-size:11.5px;font-weight:500">Browse all 18 plugins by category' +
      '<span style="width:12px;height:12px;display:block">' + UI.chev + "</span></div>";

    var nav = [
      { id: "discover", icon: "discover", label: "Discover" },
      { id: "installed", icon: "installed", label: "Installed", count: 9 }
    ];
    return shell("discover", head, body, nav);
  }

  window.PD_MOCK = {
    pluginIcon: pluginIcon, name: name, shell: shell, sectionHead: sectionHead,
    row: row, band: band, UI: UI
  };
  window.PD_BASE = { mock1: option1, mock2: option2, mock3: option3, mock4: option4 };
})();
