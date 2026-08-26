/* ══════════════════════════════════════════════════════════════════════
   bold.js — the imaginative set (options 5-9).
   Everything renders inside the same real 600x600 plugins modal that
   options 1-4 use; only the ideas got louder.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var API = window.PD_MOCK;
  var pluginIcon = API.pluginIcon;
  var name = API.name;
  var shell = API.shell;
  var sectionHead = API.sectionHead;
  var UI = API.UI;

  /* ─────────────────────────────────────────────────────────────
     5 · LOADOUT — your agent as something you equip
     ───────────────────────────────────────────────────────────── */
  var SLOTS = [
    { id: "mcp.browser.chrome-devtools", label: "网页", on: true },
    { id: "mcp.browser.playwright", label: "浏览器", on: true },
    { id: "mcp.workspace.filesystem", label: "文件", on: false },
    { id: "mcp.memory.memory", label: "记忆", on: false },
    { id: "mcp.dev.github-remote", label: "代码", on: false },
    { id: "skill", label: "方法论", on: true }
  ];

  function loadout() {
    var CX = 204, CY = 168, R = 124, FIELD_H = 336;

    var connectors = "", chips = "";
    SLOTS.forEach(function (s, i) {
      var a = (-90 + i * 60) * Math.PI / 180;
      var x = CX + R * Math.cos(a);
      var y = CY + R * Math.sin(a);
      /* connector stops short of both the core and the chip so the line
         never tucks under either */
      var x1 = CX + 42 * Math.cos(a), y1 = CY + 42 * Math.sin(a);
      var x2 = CX + (R - 25) * Math.cos(a), y2 = CY + (R - 25) * Math.sin(a);
      connectors +=
        '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" ' +
        'stroke="' + (s.on ? "var(--pk-rig-live)" : "rgba(var(--pupu-text-rgb),0.13)") + '" ' +
        'stroke-width="' + (s.on ? 1.3 : 1) + '"' + (s.on ? "" : ' stroke-dasharray="2 4"') + " />";

      var art = s.id === "skill"
        ? '<span style="width:19px;height:19px;display:block;color:' +
          (s.on ? "var(--pk-rig-live)" : "rgba(var(--pupu-text-rgb),0.3)") + '">' + UI.capSkill + "</span>"
        : pluginIcon(s.id, 30, 9);

      chips +=
        '<div data-item style="position:absolute;left:' + (x - 23) + "px;top:" + (y - 23) + 'px;' +
          'width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;' +
          (s.on
            ? "background:var(--pupu-background);box-shadow:0 0 0 1.25px var(--pk-rig-live), 0 0 20px var(--pk-rig-halo);"
            : "background:transparent;border:1.25px dashed rgba(var(--pupu-text-rgb),0.20);") +
          '">' + (s.on ? art : '<span style="font-size:19px;font-weight:200;line-height:1;color:rgba(var(--pupu-text-rgb),0.32)">+</span>') +
        "</div>" +
        '<div style="position:absolute;left:' + (x - 34) + "px;top:" + (y + 26) + 'px;width:68px;text-align:center;' +
          "font-size:9px;letter-spacing:0.1em;text-transform:uppercase;" +
          "color:rgba(var(--pupu-text-rgb)," + (s.on ? "0.62" : "0.3") + ')">' + s.label + "</div>";
    });

    var body =
      '<div style="position:relative;height:' + FIELD_H + 'px;margin-top:2px">' +
        /* ambient field — the dot_matrix primitive PuPu already ships */
        '<div style="position:absolute;inset:0;opacity:0.5;pointer-events:none;' +
          "background-image:radial-gradient(rgba(var(--pupu-text-rgb),0.16) 0.8px, transparent 0.8px);" +
          'background-size:15px 15px"></div>' +
        '<div style="position:absolute;left:' + (CX - 105) + "px;top:" + (CY - 105) + 'px;width:210px;height:210px;' +
          "border-radius:50%;background:radial-gradient(circle, var(--pk-rig-halo), transparent 68%);" +
          'filter:blur(10px);pointer-events:none"></div>' +

        '<svg width="408" height="' + FIELD_H + '" style="position:absolute;inset:0" aria-hidden="true">' +
          '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" ' +
            'stroke="rgba(var(--pupu-text-rgb),0.07)" stroke-width="1" />' +
          connectors +
        "</svg>" +

        /* the core = your agent */
        '<div style="position:absolute;left:' + (CX - 38) + "px;top:" + (CY - 38) + 'px;width:76px;height:76px;' +
          "border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;" +
          "background:radial-gradient(circle at 34% 28%, var(--pk-rig-core-hi), var(--pk-rig-core-lo));" +
          'box-shadow:0 8px 26px var(--pk-rig-halo), inset 0 1px 0 rgba(255,255,255,0.22)">' +
          '<span style="font-size:12.5px;font-weight:300;letter-spacing:0.24em;text-indent:0.24em;color:#fff">PuPu</span>' +
          '<span style="font-size:8.5px;letter-spacing:0.14em;color:rgba(255,255,255,0.6)">3 / 6</span>' +
        "</div>" +
        chips +
      "</div>" +

      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.06);margin-top:4px">' +
        sectionHead("补上空位") +
        '<div class="pk-row" style="border:0">' + pluginIcon("mcp.workspace.filesystem", 26) +
          '<div class="pk-row-txt"><div class="pk-name">Filesystem <span style="font-weight:300;' +
            'color:rgba(var(--pupu-text-rgb),0.32)">→ 文件</span></div>' +
          '<div class="pk-desc">装上后 agent 能读写你授权的目录</div></div>' +
          '<span class="pk-pill">GET</span></div>' +
        '<div class="pk-row">' + pluginIcon("mcp.memory.memory", 26) +
          '<div class="pk-row-txt"><div class="pk-name">Memory <span style="font-weight:300;' +
            'color:rgba(var(--pupu-text-rgb),0.32)">→ 记忆</span></div>' +
          '<div class="pk-desc">跨会话留存事实，不用你重讲一遍</div></div>' +
          '<span class="pk-pill">GET</span></div>' +
        '<div class="pk-row">' + pluginIcon("mcp.dev.github-remote", 26) +
          '<div class="pk-row-txt"><div class="pk-name">GitHub <span style="font-weight:300;' +
            'color:rgba(var(--pupu-text-rgb),0.32)">→ 代码</span></div>' +
          '<div class="pk-desc">仓库、issue、PR —— 需要一次授权</div></div>' +
          '<span class="pk-pill">GET</span></div>' +
      "</div>";

    return shell("discover",
      '<div class="pk-title">你的 agent</div>' +
      '<div class="pk-sub">已装配 3 项能力，还有 3 个空位。</div>', body);
  }

  /* ─────────────────────────────────────────────────────────────
     6 · VIGNETTE — sell the plugin with the chat it unlocks
     ───────────────────────────────────────────────────────────── */
  function vignette(id, ask, traceLabel, reply) {
    return '<div data-item style="border-radius:14px;background:var(--pupu-quiet);padding:12px 13px 10px;' +
        'display:flex;flex-direction:column;gap:8px">' +

      /* the user bubble, at PuPu's real geometry: radius 16, 10x16 pad */
      '<div style="display:flex;justify-content:flex-end">' +
        '<span style="max-width:78%;border-radius:16px;padding:7px 13px;font-size:11.5px;line-height:1.45;' +
          "background:rgba(var(--pupu-text-rgb),0.075);color:rgba(var(--pupu-text-rgb),0.86)\">" + ask + "</span>" +
      "</div>" +

      /* a compressed trace frame — PuPu's own tool-call vocabulary */
      '<div style="display:flex;align-items:center;gap:7px">' +
        '<span style="display:flex;align-items:center;gap:6px;padding:3px 9px 3px 4px;border-radius:999px;' +
          "background:rgba(var(--pupu-text-rgb),0.05);border:1px solid rgba(var(--pupu-text-rgb),0.055)\">" +
          pluginIcon(id, 15, 5) +
          '<span style="font-size:9.5px;font-family:ui-monospace,Menlo,monospace;' +
            'color:rgba(var(--pupu-text-rgb),0.5)">' + traceLabel + "</span>" +
          '<span style="width:9px;height:9px;display:block;color:var(--pk-vig-ok)">' + UI.check + "</span>" +
        "</span>" +
        '<span style="flex:1;height:1px;background:rgba(var(--pupu-text-rgb),0.05)"></span>' +
      "</div>" +

      '<div style="font-size:11px;line-height:1.5;color:rgba(var(--pupu-text-rgb),0.58)">' + reply + "</div>" +

      '<div style="display:flex;align-items:center;gap:8px;padding-top:8px;margin-top:2px;' +
        'border-top:1px solid rgba(var(--pupu-text-rgb),0.05)">' +
        pluginIcon(id, 20, 6) +
        '<span style="font-size:11px;font-weight:500;color:rgba(var(--pupu-text-rgb),0.82)">' + name(id) + "</span>" +
        '<span class="pk-pill" style="margin-left:auto">GET</span>' +
      "</div></div>";
  }

  function vignettes() {
    var body =
      '<div style="display:flex;flex-direction:column;gap:9px;padding-top:2px">' +
      vignette("mcp.dev.github-remote", "帮我看看 #204 这个 PR 到底改了什么",
               "github · get_pull_request", "改了 3 个文件，核心是把重试逻辑从 client 挪到了 server…") +
      vignette("mcp.browser.playwright", "把这页的价格表抓成表格",
               "playwright · browse", "抓到 4 档套餐，已整理成表格给你。") +
      vignette("mcp.memory.memory", "记住我们团队用 pnpm，不要再建议 npm",
               "memory · store_fact", "记下了。以后涉及安装命令我都用 pnpm。") +
      vignette("mcp.workspace.filesystem", "把 src 下所有超过 500 行的文件列出来",
               "filesystem · list_directory", "找到 6 个，最大的是 use_chat_stream.js…") +
      "</div>";

    return shell("discover",
      '<div class="pk-title">Discover</div>' +
      '<div class="pk-sub">每一个插件，先让你看见它带来的那句对话。</div>', body);
  }

  /* ─────────────────────────────────────────────────────────────
     7 · SPINE — a shelf of book spines. The icon doctrine becomes
     the aesthetic: an official publisher mark earns a coloured
     spine, a community build gets honest plain board.
     ───────────────────────────────────────────────────────────── */
  /* `short` exists because a vertical spine caps out around 11 glyphs at
     10px — "Chrome DevTools" and "Playwright Browser" both overflowed and
     got silently clipped in the first render. */
  var SHELF = [
    { id: "mcp.dev.github-remote", short: "GitHub", ground: "#2b3138", ink: "#ffffff" },
    { id: "mcp.browser.playwright", short: "Playwright", ground: "#2d4a3e", ink: "#ffffff" },
    { id: "mcp.browser.chrome-devtools", short: "DevTools", ground: "#1b3a6b", ink: "#ffffff" },
    { id: "mcp.devops.sentry-remote", short: "Sentry", ground: "#3b2a52", ink: "#ffffff" },
    { id: "mcp.workspace.filesystem", short: "Filesystem", ground: null },
    { id: "mcp.memory.memory", short: "Memory", ground: null, pulled: true },
    { id: "mcp.workspace.sqlite", short: "SQLite", ground: null },
    { id: "mcp.workspace.fetch", short: "Fetch", ground: null }
  ];

  /* Skill packs ship no publisher mark at all, so they are always plain
     board — which is exactly the honest reading. */
  var PACK_SHELF = [
    { short: "Superpowers", pack: true },
    { short: "Prompt Master", pack: true },
    { short: "Frontend", pack: true }
  ];

  function spine(s, tall) {
    var plain = !s.ground;
    var h = s.pulled ? tall + 14 : tall;
    return '<div data-item style="position:relative;flex:0 0 auto;width:46px;height:' + h + "px;" +
        "margin-top:" + (s.pulled ? 0 : 14) + "px;" +
        "border-radius:4px 4px 2px 2px;display:flex;flex-direction:column;align-items:center;" +
        "justify-content:space-between;padding:9px 0 7px;overflow:hidden;" +
        (plain
          ? "background:linear-gradient(100deg, var(--pk-board-hi), var(--pk-board-lo));" +
            "box-shadow:inset -4px 0 8px rgba(0,0,0,0.16), inset 1px 0 0 rgba(255,255,255,0.16);"
          : "background:linear-gradient(100deg, " + s.ground + ", " + s.ground + "d0);" +
            "box-shadow:inset -4px 0 10px rgba(0,0,0,0.42), inset 1px 0 0 rgba(255,255,255,0.16);") +
        (s.pulled ? "outline:1.5px solid var(--pk-shelf-sel);outline-offset:2px;" : "") +
        '">' +
      '<span style="width:100%;height:3px;flex:0 0 auto;background:' +
        (plain ? "rgba(var(--pk-board-ink),0.20)" : "rgba(255,255,255,0.22)") + '"></span>' +
      '<span style="writing-mode:vertical-rl;text-orientation:mixed;font-size:10px;letter-spacing:0.05em;' +
        "font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-height:" +
        (h - 42) + "px;color:" + (plain ? "rgba(var(--pk-board-ink),0.9)" : s.ink) + '">' +
        s.short + "</span>" +
      (s.pack
        ? '<span style="width:13px;height:13px;flex:0 0 auto;opacity:0.5;color:rgba(var(--pk-board-ink),1)">' +
          UI.capSkill + "</span>"
        : plain
          ? '<span style="width:14px;height:14px;flex:0 0 auto;opacity:0.42;color:rgba(var(--pk-board-ink),1)">' +
            UI.mcpMark + "</span>"
          : '<span style="flex:0 0 auto">' + pluginIcon(s.id, 18, 5) + "</span>") +
    "</div>";
  }

  function board() {
    return '<div style="height:6px;border-radius:0 0 3px 3px;margin-top:-1px;' +
      "background:linear-gradient(var(--pk-shelf-hi), var(--pk-shelf-lo));" +
      'box-shadow:0 6px 16px rgba(0,0,0,0.30)"></div>';
  }

  function spines() {
    var body =
      '<div style="position:relative;padding-top:2px">' +
        '<div style="display:flex;gap:5px;align-items:flex-end">' +
          SHELF.map(function (s) { return spine(s, 138); }).join("") +
        "</div>" + board() +
      "</div>" +

      /* the pulled volume, opened */
      '<div style="margin-top:14px;border-radius:12px;padding:13px 14px;' +
        "background:var(--pupu-quiet);border:1px solid var(--pk-shelf-sel);\">" +
        '<div style="display:flex;align-items:center;gap:10px">' +
          pluginIcon("mcp.memory.memory", 32, 9) +
          '<div style="flex:1;min-width:0">' +
            '<div class="pk-name" style="font-size:13px">Memory</div>' +
            '<div class="pk-desc" style="font-size:10px">社区实现 · 无官方标识 · Apache-2.0</div>' +
          "</div>" +
          '<span class="pk-pill">GET</span>' +
        "</div>" +
        '<div style="font-size:11px;line-height:1.55;color:rgba(var(--pupu-text-rgb),0.56);margin-top:9px;">' +
          "把知识记成图谱，跨会话留存。装上后 agent 会记得你说过的事实和偏好。" +
        "</div>" +
      "</div>" +

      sectionHead("Skill packs", "See all") +
      '<div style="position:relative;padding-top:2px">' +
        '<div style="display:flex;gap:5px;align-items:flex-end">' +
          PACK_SHELF.map(function (s) { return spine(s, 116); }).join("") +
          '<div style="flex:1;min-width:0;padding:0 0 16px 15px;align-self:flex-end">' +
            '<div class="pk-desc" style="white-space:normal;line-height:1.55">' +
            "三本方法论，装上就是斜杠命令。<br>全部 SHA-256 校验、已审阅。</div>" +
            '<span class="pk-pill" style="display:inline-block;margin-top:9px">GET · 3</span>' +
          "</div>" +
        "</div>" + board() +
      "</div>";

    return shell("discover",
      '<div class="pk-title">Discover</div>' +
      '<div class="pk-sub">彩色布面 = 官方出品；素色纸板 = 社区实现。</div>', body);
  }

  /* ─────────────────────────────────────────────────────────────
     8 · CONSTELLATION — the store as a sky you light up
     ───────────────────────────────────────────────────────────── */
  var STARS = [
    { id: "mcp.browser.chrome-devtools", x: 76, y: 44, on: true },
    { id: "mcp.browser.playwright", x: 148, y: 76, on: true },
    { id: "mcp.dev.github-remote", x: 238, y: 40, on: false },
    { id: "mcp.devops.sentry-remote", x: 328, y: 70, on: false },
    { id: "mcp.memory.memory", x: 300, y: 146, on: true },
    { id: "mcp.workspace.sqlite", x: 356, y: 196, on: false },
    { id: "mcp.workspace.filesystem", x: 70, y: 152, on: true },
    { id: "mcp.workspace.markitdown", x: 132, y: 200, on: false },
    { id: "mcp.workspace.fetch", x: 48, y: 218, on: false },
    { id: "mcp.productivity.notion-remote", x: 222, y: 206, on: false }
  ];
  /* Labels carry explicit coordinates. Placing them at the edge midpoint
     put "Web Research" straight under the playwright node and clipped it. */
  var EDGES = [[0, 1], [6, 7], [7, 8], [8, 6], [4, 5]];
  var GROUP_LABELS = [
    { text: "Web Research", x: 172, y: 104 },
    { text: "Workspace", x: 42, y: 122 },
    { text: "Local Knowledge", x: 258, y: 218 }
  ];

  function constellation() {
    var byI = function (i) { return STARS[i]; };

    var lines = EDGES.map(function (e) {
      var a = byI(e[0]), b = byI(e[1]);
      return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
        '" stroke="rgba(var(--pupu-text-rgb),0.17)" stroke-width="1" stroke-dasharray="3 3" />';
    }).join("");

    var labels = GROUP_LABELS.map(function (g) {
      return '<div style="position:absolute;left:' + g.x + "px;top:" + g.y + 'px;' +
        "font-size:8.5px;letter-spacing:0.13em;text-transform:uppercase;white-space:nowrap;" +
        'color:rgba(var(--pupu-text-rgb),0.36);pointer-events:none">' + g.text + "</div>";
    }).join("");

    var nodes = STARS.map(function (s, i) {
      if (s.on) {
        return '<div data-item style="position:absolute;left:' + (s.x - 17) + "px;top:" + (s.y - 17) + 'px;' +
          'width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;' +
          "background:var(--pupu-background);box-shadow:0 0 0 1.2px var(--pk-sky-live), 0 0 18px var(--pk-sky-halo)\">" +
          pluginIcon(s.id, 26, 8) + "</div>";
      }
      return '<div data-item style="position:absolute;left:' + (s.x - 9) + "px;top:" + (s.y - 9) + 'px;' +
        "width:18px;height:18px;border-radius:50%;border:1px solid rgba(var(--pupu-text-rgb),0.22);" +
        'display:flex;align-items:center;justify-content:center">' +
        '<span style="width:4px;height:4px;border-radius:50%;background:rgba(var(--pupu-text-rgb),0.3)"></span></div>';
    }).join("");

    var body =
      '<div style="position:relative;height:250px;margin-top:2px;border-radius:14px;overflow:hidden;' +
        'background:radial-gradient(120% 90% at 50% 8%, var(--pk-sky-top), var(--pk-sky-bottom))">' +
        '<div style="position:absolute;inset:0;opacity:0.55;' +
          "background-image:radial-gradient(rgba(var(--pupu-text-rgb),0.14) 0.7px, transparent 0.7px);" +
          'background-size:19px 19px"></div>' +
        '<svg width="408" height="250" style="position:absolute;inset:0" aria-hidden="true">' + lines + "</svg>" +
        labels + nodes +
      "</div>" +

      /* Constellation progress. Dot counts match the sky exactly — an
         unverifiable "9 / 18" headline was the first draft's tell. */
      sectionHead("星座 · 3", "全部 18 颗") +
      '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05);margin-top:3px">' +
      skyRow("Web Research", "看、逛、抽取", 2, 2) +
      skyRow("Workspace", "读文件、转文档、抓网页", 1, 3) +
      skyRow("Local Knowledge", "记笔记、查本地数据", 1, 2) +
      "</div>";

    return shell("discover",
      '<div class="pk-title">Discover</div>' +
      '<div class="pk-sub">装过的星亮着，没装的是空环 —— 连起来就是一个星座。</div>', body);
  }

  function skyRow(title, blurb, lit, total) {
    var dots = "";
    for (var i = 0; i < total; i++) {
      dots += '<span style="width:7px;height:7px;border-radius:50%;' +
        (i < lit
          ? "background:var(--pk-sky-live);box-shadow:0 0 7px var(--pk-sky-halo);"
          : "border:1px solid rgba(var(--pupu-text-rgb),0.26);") +
        '"></span>';
    }
    var done = lit === total;
    return '<div class="pk-row">' +
      '<span style="display:flex;align-items:center;gap:5px;width:44px;flex:0 0 auto">' + dots + "</span>" +
      '<div class="pk-row-txt"><div class="pk-name">' + title + "</div>" +
      '<div class="pk-desc">' + blurb + " · " + lit + "/" + total + " 已点亮</div></div>" +
      (done
        ? '<span class="pk-pill pk-pill-open">完整</span>'
        : '<span class="pk-pill">补完</span>') +
      "</div>";
  }

  /* ─────────────────────────────────────────────────────────────
     9 · WISH — say the outcome, not the package name
     ───────────────────────────────────────────────────────────── */
  function wishHit(id, why, badge, pill) {
    return '<div data-item style="display:flex;align-items:center;gap:11px;border-radius:12px;' +
      'background:var(--pupu-quiet);padding:11px 12px">' +
      pluginIcon(id, 30, 9) +
      '<div style="flex:1;min-width:0">' +
        '<div class="pk-name" style="font-size:12.5px">' + name(id) +
          (badge ? '<span style="font-size:9px;font-weight:400;letter-spacing:0.1em;text-transform:uppercase;' +
            "margin-left:7px;padding:1px 6px;border-radius:999px;color:var(--pk-wish-ink);" +
            'background:var(--pk-wish-tint)">' + badge + "</span>" : "") +
        "</div>" +
        '<div class="pk-desc" style="white-space:normal">' + why + "</div>" +
      '</div><span class="pk-pill' + (pill === "OPEN" ? " pk-pill-open" : "") + '">' +
      (pill || "GET") + "</span></div>";
  }

  function wish() {
    var body =
      '<div style="position:relative;margin-top:4px">' +
        '<div style="position:absolute;left:-14px;right:-14px;top:-10px;height:104px;pointer-events:none;' +
          "background:radial-gradient(58% 78% at 22% 42%, var(--pk-wish-a), transparent 70%)," +
          "radial-gradient(52% 74% at 82% 58%, var(--pk-wish-b), transparent 70%);" +
          'filter:blur(20px);opacity:0.9"></div>' +
        '<div style="position:relative;border-radius:17px;padding:15px 16px;min-height:76px;' +
          "background:var(--pk-wish-field);border:1px solid var(--pk-wish-edge);" +
          'box-shadow:0 6px 26px rgba(0,0,0,0.10)">' +
          '<div style="font-size:10px;letter-spacing:0.16em;text-transform:uppercase;' +
            'color:rgba(var(--pupu-text-rgb),0.38)">我想让 agent 会…</div>' +
          '<div style="font-size:16px;font-weight:400;margin-top:6px;line-height:1.35;' +
            'color:rgba(var(--pupu-text-rgb),0.92)">看懂我发给它的设计稿' +
            '<span style="display:inline-block;width:1.5px;height:16px;margin-left:2px;vertical-align:-2px;' +
              'background:var(--pk-wish-ink)"></span></div>' +
        "</div>" +
      "</div>" +

      '<div style="display:flex;align-items:baseline;gap:8px;padding:16px 0 8px">' +
        '<span style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.35">三种做法</span>' +
        '<span class="pk-sec-a" style="margin-left:auto">为什么是它们 ›</span>' +
      "</div>" +

      '<div style="display:flex;flex-direction:column;gap:8px">' +
      wishHit("mcp.dev.figma-remote", "直接读你的 Figma 文件，拿到图层和标注 —— 要连一次账号", "最准") +
      wishHit("mcp.browser.playwright", "打开设计稿链接截图给模型看 —— 现在就能装", "零凭据") +
      wishHit("mcp.browser.chrome-devtools", "你已经装了。也能截图，但更适合调试而不是读稿", "已装", "OPEN") +
      "</div>" +

      '<div style="padding-top:16px">' +
        '<div style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;' +
          'color:rgba(var(--pupu-text-rgb),0.3);margin-bottom:9px">别人还想让 agent 会…</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
        ["读我的 PDF", "记住我的偏好", "跑我的测试", "查线上报错", "看懂我的 SQL", "帮我盯 CI"].map(function (w) {
          return '<span style="font-size:11px;padding:5px 11px;border-radius:999px;' +
            "background:rgba(var(--pupu-text-rgb),0.05);border:1px solid rgba(var(--pupu-text-rgb),0.06);" +
            'color:rgba(var(--pupu-text-rgb),0.6)">' + w + "</span>";
        }).join("") +
        "</div>" +
      "</div>" +

      /* the escape hatch — a wish box with no "just let me browse" exit is
         a dead end for anyone who already knows what they want */
      '<div style="display:flex;align-items:center;gap:7px;margin-top:20px;padding-top:14px;' +
        "border-top:1px solid rgba(var(--pupu-text-rgb),0.05);font-size:11.5px;font-weight:500;" +
        'color:var(--pupu-pill)">或者，自己逛这 18 个插件' +
        '<span style="width:12px;height:12px;display:block">' + UI.chev + "</span></div>";

    return shell("discover",
      '<div class="pk-title">Discover</div>' +
      '<div class="pk-sub">说你想要的结果，不用先知道包叫什么。</div>', body);
  }

  window.PD_BOLD = {
    mock5: loadout,
    mock6: vignettes,
    mock7: spines,
    mock8: constellation,
    mock9: wish
  };
})();
