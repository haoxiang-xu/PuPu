/* ══════════════════════════════════════════════════════════════════════
   sky.js — Constellation, refined.

   Every screen below is the same real 600x600 plugins modal; only the
   state differs. The sky field is a fixed 408 x 296 box inside it.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var API = window.PD_MOCK;
  var pluginIcon = API.pluginIcon;
  var name = API.name;
  var shell = API.shell;
  var UI = API.UI;

  var FIELD_W = 408, FIELD_H = 296;

  /* ─────────────────────────────────────────────────────────────
     THE SKY DATA

     `mag` is magnitude, not decoration: 1 = curated headline (featured
     or essential), 2 = ordinary. It drives size so the sky has a
     hierarchy instead of reading as uniform noise.

     Coordinates here are hand-placed, but placed the way the layout
     RULE below would place them — collection members cluster inside
     one sector, loose stars fill the gaps. See the layout note on the
     page for how this generalises past 12 stars.
     ───────────────────────────────────────────────────────────── */
  var STARS = [
    /* Web Research — browser sector, upper left */
    { id: "mcp.browser.chrome-devtools", x: 78, y: 52, mag: 1, on: true, col: "web" },
    { id: "mcp.browser.playwright", x: 146, y: 88, mag: 1, on: true, col: "web" },
    /* Workspace — workspace sector, lower left */
    { id: "mcp.workspace.filesystem", x: 74, y: 176, mag: 1, on: true, col: "ws" },
    { id: "mcp.workspace.markitdown", x: 128, y: 228, mag: 2, on: false, col: "ws" },
    { id: "mcp.workspace.fetch", x: 46, y: 240, mag: 2, on: false, col: "ws" },
    /* Local Knowledge — memory sector, lower right */
    { id: "mcp.memory.memory", x: 306, y: 168, mag: 1, on: true, col: "lk" },
    { id: "mcp.workspace.sqlite", x: 358, y: 220, mag: 2, on: false, col: "lk" },
    /* loose stars — no collection */
    { id: "mcp.dev.github-remote", x: 238, y: 46, mag: 1, on: false, col: null },
    { id: "mcp.devops.sentry-remote", x: 330, y: 82, mag: 2, on: false, col: null },
    { id: "mcp.productivity.slack-remote", x: 372, y: 124, mag: 2, on: false, col: null },
    { id: "mcp.dev.figma-remote", x: 196, y: 132, mag: 2, on: false, col: null },
    { id: "mcp.productivity.notion-remote", x: 226, y: 214, mag: 2, on: false, col: null }
  ];

  var COLS = {
    web: { title: "Web Research", zh: "看、逛、抽取", label: { x: 92, y: 16 } },
    ws: { title: "Workspace", zh: "读文件、转文档、抓网页", label: { x: 150, y: 232 } },
    lk: { title: "Local Knowledge", zh: "记笔记、查本地数据", label: { x: 252, y: 252 } }
  };
  var EDGES = [
    ["web", "mcp.browser.chrome-devtools", "mcp.browser.playwright"],
    ["ws", "mcp.workspace.filesystem", "mcp.workspace.markitdown"],
    ["ws", "mcp.workspace.markitdown", "mcp.workspace.fetch"],
    ["ws", "mcp.workspace.fetch", "mcp.workspace.filesystem"],
    ["lk", "mcp.memory.memory", "mcp.workspace.sqlite"]
  ];

  /* what a search query matches — the real store already searches name +
     description + category, so this mirrors that, not a new index */
  var MATCH = {
    "文件": ["mcp.workspace.filesystem", "mcp.workspace.markitdown", "mcp.workspace.fetch"]
  };

  function starsFor(opts) {
    return STARS.map(function (s) {
      var on = s.on;
      if (opts.cold) on = false;
      if (opts.lighting === s.id) on = true;
      return Object.assign({}, s, { on: on });
    });
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function colState(list, key) {
    var members = list.filter(function (s) { return s.col === key; });
    var lit = members.filter(function (s) { return s.on; }).length;
    return { lit: lit, total: members.length, done: lit === members.length && members.length > 0 };
  }

  /* ─────────────────────────────────────────────────────────────
     BACKGROUND STARS — atmosphere, not data.
     Deterministic LCG so every screenshot is byte-identical; a
     Math.random() field would shimmer between renders and make visual
     diffing useless.
     ───────────────────────────────────────────────────────────── */
  function dust() {
    var seed = 20260821, out = "";
    var rnd = function () {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (var i = 0; i < 54; i++) {
      var x = rnd() * FIELD_W, y = rnd() * FIELD_H;
      var r = 0.5 + rnd() * 1.1;
      var a = 0.16 + rnd() * 0.4;
      out += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(2) +
        '" fill="var(--sky-dust)" opacity="' + a.toFixed(2) + '" />';
    }
    return out;
  }

  /* ─────────────────────────────────────────────────────────────
     THE FIELD
     ───────────────────────────────────────────────────────────── */
  function field(opts) {
    opts = opts || {};
    var list = starsFor(opts);
    var matched = opts.query ? (MATCH[opts.query] || []) : null;

    var dim = function (s) {
      if (matched) return matched.indexOf(s.id) === -1;
      if (opts.hover) {
        var h = byId(list, opts.hover);
        if (!h) return false;
        /* hovering a star keeps its own constellation lit and pushes
           everything else back — the point is to show the grouping */
        return !(s.id === opts.hover || (h.col && s.col === h.col));
      }
      return false;
    };

    /* ── constellation regions: a complete constellation gets a faint
       shaded area, the way a printed star atlas shades its figures ── */
    var regions = Object.keys(COLS).map(function (key) {
      var st = colState(list, key);
      if (!st.done) return "";
      var members = list.filter(function (s) { return s.col === key; });
      /* Only 3+ stars get a shaded figure. A two-star "region" is just a
         fat stroke, and it rendered as a grey smudge across the chart —
         for a pair the solid brighter line plus the label tick is enough. */
      if (members.length < 3) return "";
      return '<polygon points="' + members.map(function (s) { return s.x + "," + s.y; }).join(" ") +
        '" fill="var(--sky-region)" />';
    }).join("");

    var lines = EDGES.map(function (e) {
      var a = byId(list, e[1]), b = byId(list, e[2]);
      if (!a || !b) return "";
      var st = colState(list, e[0]);
      var faded = dim(a) && dim(b);
      var flash = opts.flash === e[0];
      return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" ' +
        'stroke="' + (st.done ? "var(--sky-line-on)" : "var(--sky-line)") + '" ' +
        'stroke-width="' + (flash ? 1.8 : st.done ? 1.25 : 1) + '" ' +
        (st.done ? "" : 'stroke-dasharray="3 3" ') +
        'opacity="' + (faded ? 0.18 : 1) + '" />';
    }).join("");

    /* The floating star tag sits where its own constellation label lives,
       and the two collided on SQLite. The star's group is already legible
       from its un-dimmed peers (and spelled out in the card below), so the
       focused star's own group label steps aside. */
    var focus = opts.hover || opts.selected;
    var focusCol = focus ? (byId(list, focus) || {}).col : null;

    var labels = Object.keys(COLS).map(function (key) {
      var c = COLS[key], st = colState(list, key);
      if (focusCol && key === focusCol) return "";
      var faded = opts.hover ? (byId(list, opts.hover) || {}).col !== key : false;
      if (opts.selected && !opts.hover) faded = true;
      if (matched) faded = matched.indexOf((list.filter(function (s) { return s.col === key; })[0] || {}).id) === -1;
      return '<div style="position:absolute;left:' + c.label.x + "px;top:" + c.label.y + 'px;' +
        "font-size:8.5px;letter-spacing:0.14em;text-transform:uppercase;white-space:nowrap;" +
        "display:flex;align-items:center;gap:5px;pointer-events:none;" +
        "color:var(--sky-label);opacity:" + (faded ? 0.22 : st.done ? 0.85 : 0.5) + '">' +
        c.title +
        (st.done
          ? '<span style="width:9px;height:9px;display:block;color:var(--sky-live)">' + UI.check + "</span>"
          : '<span style="opacity:0.7">' + st.lit + "/" + st.total + "</span>") +
        "</div>";
    }).join("");

    var nodes = list.map(function (s) {
      var faded = dim(s);
      var hovered = opts.hover === s.id;
      var selected = opts.selected === s.id;
      var justLit = opts.lighting === s.id;
      var box = s.on ? (s.mag === 1 ? 34 : 30) : (s.mag === 1 ? 22 : 18);
      var style = "position:absolute;left:" + (s.x - box / 2) + "px;top:" + (s.y - box / 2) + "px;" +
        "width:" + box + "px;height:" + box + "px;" +
        "opacity:" + (faded ? 0.16 : 1) + ";transition:opacity .18s ease;";

      if (s.on) {
        return '<div data-item style="' + style + "border-radius:" + Math.round(box * 0.3) + "px;" +
          "display:flex;align-items:center;justify-content:center;background:var(--sky-plate);" +
          "box-shadow:0 0 0 1.2px var(--sky-live), 0 0 " + (justLit ? 30 : 16) + "px var(--sky-halo);" +
          (selected || hovered ? "outline:1.5px solid var(--sky-live);outline-offset:3px;" : "") +
          '">' + pluginIcon(s.id, box - 8, Math.round(box * 0.22)) +
          (justLit
            ? '<span style="position:absolute;inset:-14px;border-radius:50%;' +
              'border:1.5px solid var(--sky-live);opacity:0.5"></span>' +
              '<span style="position:absolute;inset:-26px;border-radius:50%;' +
              'border:1px solid var(--sky-live);opacity:0.22"></span>'
            : "") +
          "</div>";
      }
      return '<div data-item style="' + style + "border-radius:50%;" +
        "border:1px solid var(--sky-ring);display:flex;align-items:center;justify-content:center;" +
        (selected || hovered ? "outline:1.5px solid var(--sky-live);outline-offset:3px;" : "") +
        (matched && matched.indexOf(s.id) !== -1
          ? "box-shadow:0 0 0 3px var(--sky-halo);" : "") +
        '"><span style="width:' + (s.mag === 1 ? 5 : 4) + "px;height:" + (s.mag === 1 ? 5 : 4) + "px;" +
        'border-radius:50%;background:var(--sky-ring-core)"></span></div>';
    }).join("");

    /* hover / select label rides with the star */
    var tag = "";
    var tagFor = opts.hover || opts.selected;
    if (tagFor) {
      var t = byId(list, tagFor);
      if (t) {
        var below = t.y < FIELD_H - 60;
        tag = '<div style="position:absolute;left:' + Math.min(Math.max(t.x - 60, 4), FIELD_W - 124) + "px;" +
          "top:" + (below ? t.y + 24 : t.y - 42) + "px;width:120px;text-align:center;pointer-events:none\">" +
          '<span style="display:inline-block;font-size:10.5px;font-weight:500;padding:3px 9px;border-radius:7px;' +
          "background:var(--sky-tag-bg);color:var(--sky-tag-ink);white-space:nowrap;" +
          'box-shadow:0 3px 12px rgba(0,0,0,0.28)">' + name(t.id) + "</span></div>";
      }
    }

    return '<div style="position:relative;width:' + FIELD_W + "px;height:" + FIELD_H + "px;" +
      "border-radius:14px;overflow:hidden;background:var(--sky-bg);" +
      'box-shadow:inset 0 0 0 1px var(--sky-edge)">' +
      '<div style="position:absolute;inset:0;background:var(--sky-neb);pointer-events:none"></div>' +
      '<svg width="' + FIELD_W + '" height="' + FIELD_H + '" style="position:absolute;inset:0" aria-hidden="true">' +
        dust() + regions + lines +
      "</svg>" + labels + nodes + tag +
      "</div>";
  }

  /* ─────────────────────────────────────────────────────────────
     PANELS BELOW THE SKY
     ───────────────────────────────────────────────────────────── */
  function searchBar(query, focused) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:9px;' +
      "background:rgba(var(--pupu-text-rgb),0.05);" +
      "border:1px solid " + (focused ? "var(--sky-live)" : "rgba(var(--pupu-text-rgb),0.06)") + ';">' +
      '<span style="width:14px;height:14px;opacity:0.4;flex:0 0 auto">' + UI.search + "</span>" +
      (query
        ? '<span style="font-size:12px;color:rgba(var(--pupu-text-rgb),0.88)">' + query +
          '<span style="display:inline-block;width:1.5px;height:12px;margin-left:1px;vertical-align:-2px;' +
          'background:var(--sky-live)"></span></span>'
        : '<span style="font-size:12px;color:rgba(var(--pupu-text-rgb),0.32);font-weight:300">' +
          "找一颗星，或说你想要什么</span>") +
      "</div>";
  }

  function colRow(list, key, opts) {
    var c = COLS[key], st = colState(list, key);
    var dots = "";
    var members = list.filter(function (s) { return s.col === key; });
    members.forEach(function (m) {
      dots += '<span style="width:7px;height:7px;border-radius:50%;' +
        (m.on ? "background:var(--sky-live);box-shadow:0 0 7px var(--sky-halo);"
              : "border:1px solid var(--sky-ring);") + '"></span>';
    });
    return '<div class="pk-row">' +
      '<span style="display:flex;align-items:center;gap:5px;width:46px;flex:0 0 auto">' + dots + "</span>" +
      '<div class="pk-row-txt"><div class="pk-name">' + c.title +
        (st.done && opts && opts.flash === key
          ? '<span style="font-size:9px;font-weight:400;letter-spacing:0.1em;margin-left:8px;padding:1px 7px;' +
            'border-radius:999px;color:var(--sky-tag-ink);background:var(--sky-tag-bg)">刚刚补完</span>'
          : "") +
        "</div>" +
      '<div class="pk-desc">' + c.zh + " · " + st.lit + "/" + st.total + " 已点亮</div></div>" +
      (st.done
        ? '<span class="pk-pill pk-pill-open">完整</span>'
        : '<span class="pk-pill">补完 ' + (st.total - st.lit) + "</span>") +
      "</div>";
  }

  function starCard(list, id, note) {
    var s = byId(list, id);
    var col = s && s.col ? COLS[s.col] : null;
    var st = s && s.col ? colState(list, s.col) : null;
    return '<div style="border-radius:12px;background:var(--pupu-quiet);padding:12px 13px;' +
      'display:flex;align-items:flex-start;gap:11px">' +
      pluginIcon(id, 34, 10) +
      '<div style="flex:1;min-width:0">' +
        '<div class="pk-name" style="font-size:13px">' + name(id) + "</div>" +
        '<div class="pk-desc" style="white-space:normal;line-height:1.5;margin-top:2px">' + note + "</div>" +
        (col
          ? '<div style="display:flex;align-items:center;gap:6px;margin-top:7px">' +
            '<span style="width:9px;height:9px;border-radius:50%;border:1px solid var(--sky-ring);' +
            'display:block"></span>' +
            '<span style="font-size:9.5px;letter-spacing:0.1em;text-transform:uppercase;' +
            'color:var(--sky-label);opacity:0.7">' + col.title + " · " + st.lit + "/" + st.total + "</span></div>"
          : "") +
      "</div>" +
      '<span class="pk-pill">' + (s && s.on ? "OPEN" : "点亮") + "</span></div>";
  }

  /* ─────────────────────────────────────────────────────────────
     SCREENS
     ───────────────────────────────────────────────────────────── */
  function screen(opts) {
    opts = opts || {};
    var list = starsFor(opts);
    var lit = list.filter(function (s) { return s.on; }).length;

    var head =
      '<div class="pk-title">' + (opts.title || "你的星空") + "</div>" +
      '<div class="pk-sub">' + (opts.sub || (lit + " 颗亮着 · 12 颗在图上 · 全部 18 颗")) + "</div>";

    var below;
    if (opts.panel === "card") {
      below = starCard(list, opts.selected, opts.cardNote);
    } else if (opts.panel === "search") {
      var m = MATCH[opts.query] || [];
      below =
        '<div style="display:flex;align-items:baseline;gap:8px;padding:11px 0 3px">' +
          '<span style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.35">' +
          m.length + " 颗匹配</span>" +
          '<span class="pk-sec-a" style="margin-left:auto">整个 Workspace 星座 ›</span></div>' +
        '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05)">' +
        m.map(function (id) {
          var s = byId(list, id);
          return '<div class="pk-row">' + pluginIcon(id, 26) +
            '<div class="pk-row-txt"><div class="pk-name">' + name(id) + "</div>" +
            '<div class="pk-desc">' + (id.indexOf("filesystem") > -1 ? "在授权目录里读写文件"
              : id.indexOf("markitdown") > -1 ? "把 PDF / Office 转成 Markdown" : "抓取网页内容") + "</div></div>" +
            '<span class="pk-pill' + (s.on ? " pk-pill-open" : "") + '">' + (s.on ? "OPEN" : "点亮") + "</span></div>";
        }).join("") + "</div>";
    } else if (opts.panel === "cold") {
      below =
        '<div style="padding:14px 0 0">' +
          '<div style="font-size:12.5px;color:rgba(var(--pupu-text-rgb),0.72);line-height:1.6">' +
          "一颗都还没亮。<br>先点亮这四颗，三个星座里的两个就有了形状。</div>" +
          '<div style="display:flex;align-items:center;gap:9px;margin-top:14px">' +
          ["mcp.browser.chrome-devtools", "mcp.browser.playwright",
           "mcp.workspace.filesystem", "mcp.memory.memory"].map(function (id) {
            return pluginIcon(id, 32, 9);
          }).join("") +
          '<span class="pk-pill" style="margin-left:auto;padding:6px 16px">一次点亮 4 颗</span>' +
          "</div>" +
        "</div>";
    } else {
      below =
        '<div style="border-top:1px solid rgba(var(--pupu-text-rgb),0.05);margin-top:10px">' +
        Object.keys(COLS).map(function (k) { return colRow(list, k, opts); }).join("") + "</div>";
    }

    var body =
      '<div style="padding-bottom:10px">' + searchBar(opts.query, opts.panel === "search") + "</div>" +
      field(opts) + below;

    /* the sidebar badge has to agree with the sky — a cold-start screen
       that still reads "Installed 9" is the kind of detail that makes a
       mock look untrustworthy */
    var nav = [
      { id: "discover", icon: "discover", label: "Discover" },
      { id: "store", icon: "store", label: "Store" },
      { id: "installed", icon: "installed", label: "Installed", count: opts.cold ? 0 : 9 }
    ];
    return shell("discover", head, body, nav);
  }

  window.PD_SKY = {
    skyDefault: function () { return screen({}); },
    skyHover: function () { return screen({ hover: "mcp.workspace.markitdown" }); },
    skySelected: function () {
      return screen({
        selected: "mcp.workspace.sqlite", panel: "card",
        cardNote: "查询本地 SQLite 数据库。零凭据，装上即用 —— 点亮它，Local Knowledge 就完整了。"
      });
    },
    skySearch: function () { return screen({ query: "文件", panel: "search" }); },
    skyLighting: function () {
      return screen({
        lighting: "mcp.workspace.sqlite", flash: "lk",
        title: "Local Knowledge 完整了",
        sub: "第 5 颗星刚刚亮起 · 三个星座里的第二个"
      });
    },
    skyCold: function () {
      return screen({
        cold: true, panel: "cold",
        title: "你的星空", sub: "0 颗亮着 · 12 颗在图上"
      });
    }
  };
})();
