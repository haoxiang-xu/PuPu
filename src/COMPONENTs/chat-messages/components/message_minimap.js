// src/COMPONENTs/chat-messages/components/message_minimap.js
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import {
  colorWithAlpha,
  themeHighlightColor,
} from "../../../CONTAINERs/config/theme_highlight";
import {
  TICK_H,
  TRACK_W,
  PADV,
  IN_VIEW_W_BONUS,
  IN_VIEW_H_BONUS,
  FISHEYE_W_BONUS,
  FISHEYE_H_BONUS,
  CRAWL_EDGE_PX,
  CRAWL_STEP_MS,
  buildRailModel,
  widthStats,
  tickWidth,
  winCapacity,
  isWindowed,
  tickCenterY,
  indexAtY,
  recenterWindow,
  hiddenCounts,
  capCount,
  lensRect,
  fisheyeGain,
  clamp01,
  readingPct,
} from "../minimap_rail_geometry";

const EASE = "cubic-bezier(.22,.61,.36,1)";
const TOP_INSET = 38; // 避开窗口顶部可拖拽标题栏(否则 to-top 按钮点不到)
const INSET_BASE = 74; // 轨道上/下内边距:给两颗 pill 让位
const STACK_W = 30;
const SNAP_W = 236;
const SCRUB_THRESHOLD_PX = 6;
const STREAM_PAINT_INTERVAL_MS = 400; // 流式期间兜底重绘(直播膨胀不产生 scroll 事件时透镜仍跟上)

const PALETTE = {
  dark: {
    uOff: "rgba(255,255,255,0.16)", uOn: "rgba(255,255,255,0.62)",
    lensBg: "rgba(255,255,255,0.055)", lensLine: "rgba(255,255,255,0.15)",
    pillBg: "rgba(255,255,255,0.12)", pillFg: "rgba(255,255,255,0.85)",
    count: "rgba(255,255,255,0.40)",
    snapBg: "rgba(34,34,38,0.92)", snapLine: "rgba(255,255,255,0.09)",
    snapFg: "rgba(255,255,255,0.88)", snapMuted: "rgba(255,255,255,0.45)",
    chip: "rgba(255,255,255,0.08)",
  },
  light: {
    uOff: "rgba(0,0,0,0.16)", uOn: "rgba(0,0,0,0.55)",
    lensBg: "rgba(0,0,0,0.05)", lensLine: "rgba(0,0,0,0.13)",
    pillBg: "rgba(0,0,0,0.10)", pillFg: "rgba(0,0,0,0.70)",
    count: "rgba(0,0,0,0.40)",
    snapBg: "rgba(252,251,248,0.92)", snapLine: "rgba(0,0,0,0.11)",
    snapFg: "rgba(0,0,0,0.85)", snapMuted: "rgba(0,0,0,0.45)",
    chip: "rgba(0,0,0,0.06)",
  },
};

// PuPu 内置图标(icon_manifest.js)。fill-based,viewBox 24。
const CH_UP =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9999 10.8284L7.0502 15.7782L5.63599 14.364L11.9999 8L18.3639 14.364L16.9497 15.7782L11.9999 10.8284Z"/></svg>';
const CH_DOWN =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z"/></svg>';
const CH_UP2 =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M12 13.9142L16.7929 18.7071L18.2071 17.2929L12 11.0858L5.79289 17.2929L7.20711 18.7071L12 13.9142ZM6 7L18 7V9L6 9L6 7Z"/></svg>';
const CH_DOWN2 =
  '<svg width="12" height="12" style="display:block" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.0858L7.20711 5.29291L5.79289 6.70712L12 12.9142L18.2071 6.70712L16.7929 5.29291L12 10.0858ZM18 17L6 17L6 15L18 15V17Z"/></svg>';

// 注入一次:滚动条隐藏(chat_messages 依赖)、pill hover、live 呼吸、弹入、落点回声、reduced-motion
let styleInjected = false;
const ensureStyle = () => {
  if (styleInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent =
    ".chat-scroll-host{scrollbar-width:none;-ms-overflow-style:none;}" +
    ".chat-scroll-host::-webkit-scrollbar{width:0;height:0;display:none;}" +
    "[data-mm-pill]{background:transparent !important;transition:opacity .22s " + EASE + ",background .18s " + EASE + ",transform .18s " + EASE + ";}" +
    "[data-mm-pill]:hover{transform:translateX(-50%) scale(1.12) !important;}" +
    '[data-mm-pill][data-dark="1"]:hover{background:rgba(255,255,255,0.12) !important;}' +
    '[data-mm-pill][data-dark="0"]:hover{background:rgba(0,0,0,0.10) !important;}' +
    // live 刻度呼吸光晕 —— 全设计唯一允许的光晕(spec §6/§8)
    "[data-mm-tick].pupu-mm-live::after{content:'';position:absolute;inset:-3px -4px;border-radius:100px;background:var(--pupu-mm-live-halo);animation:pupuMmBreathe 1.6s ease-in-out infinite;z-index:-1;}" +
    "@keyframes pupuMmBreathe{0%,100%{opacity:.25;transform:scale(.9);}50%{opacity:1;transform:scale(1.25);}}" +
    "[data-mm-tick].pupu-mm-pop{animation:pupuMmPop .34s cubic-bezier(.34,1.56,.64,1) 1;}" +
    "@keyframes pupuMmPop{0%{transform:scaleX(.2);opacity:0;}100%{transform:scaleX(1);opacity:1;}}" +
    // 落点回声:目标消息背景闪光一次
    ".pupu-mm-flash{animation:pupuMmFlash 1.6s ease-out 1;border-radius:10px;}" +
    "@keyframes pupuMmFlash{0%{background-color:var(--pupu-mm-flash);}100%{background-color:transparent;}}" +
    "@media (prefers-reduced-motion: reduce){[data-mm-tick].pupu-mm-live::after,[data-mm-tick].pupu-mm-pop,.pupu-mm-flash{animation:none !important;}}";
  document.head.appendChild(el);
  styleInjected = true;
};

// 导航 pill(样式/显隐逻辑与旧版一致,四颗全保留)
const NavPill = ({ nodeRef, edge, offset, icon, C, isDark, onClick }) => (
  <div
    ref={nodeRef}
    data-mm-pill
    data-dark={isDark ? "1" : "0"}
    onClick={onClick}
    style={{
      position: "absolute",
      left: "50%",
      [edge]: offset,
      width: 16,
      height: 24,
      transform: "translateX(-50%) scale(1)",
      borderRadius: 100,
      color: C.pillFg,
      cursor: "pointer",
      opacity: 0,
      pointerEvents: "none",
    }}
  >
    <span
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 12,
        height: 12,
        transform: "translate(-50%, -50%)",
      }}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  </div>
);

const MessageMinimap = ({
  messagesRef,
  messageNodeRefs,
  messages = [],
  safeVisibleStart = 0,
  scrollToMessageIndex,
  bottomViewportInset = 0,
  isDark,
  isStreaming = false,
}) => {
  const { theme } = useContext(ConfigContext);
  const highlightColor = themeHighlightColor(theme);
  const C = useMemo(() => {
    const base = PALETTE[isDark ? "dark" : "light"];
    return {
      ...base,
      aOff: colorWithAlpha(highlightColor, isDark ? 0.16 : 0.18),
      aOn: colorWithAlpha(highlightColor, isDark ? 0.55 : 0.55),
      live: colorWithAlpha(highlightColor, isDark ? 0.9 : 0.85),
      liveHalo: colorWithAlpha(highlightColor, 0.16),
      flash: colorWithAlpha(highlightColor, isDark ? 0.13 : 0.14),
      snapRole: colorWithAlpha(highlightColor, 0.95),
    };
  }, [highlightColor, isDark]);

  // 几何来源:纯消息数据。messages 引用变化(增删/trace frame 换新)时重算 —— 这
  // 与流式 token 无关(直播文本走 streamingMessageStore,不改 messages)。
  const railModel = useMemo(() => buildRailModel(messages), [messages]);
  const widths = useMemo(() => {
    const stats = widthStats(railModel);
    return railModel.map((it) => tickWidth(it.len, stats));
  }, [railModel]);

  // 刻度池:数量 = min(消息数, 窗口容量)。容量依赖轨道真实高度 → 挂载/resize 时
  // setState 一次(合法重排点),其余时间 React 不参与。
  const [poolSize, setPoolSize] = useState(0);

  const stackRef = useRef(null);
  const trackRef = useRef(null);
  const lensRef = useRef(null);
  const lensPctRef = useRef(null);
  const cTopRef = useRef(null);
  const cBotRef = useRef(null);
  const snapRef = useRef(null);
  const tickRefs = useRef([]);
  const topPillRef = useRef(null);
  const botPillRef = useRef(null);
  const upOnePillRef = useRef(null);
  const downOnePillRef = useRef(null);

  // 交互态(全 ref,零 React)
  const winSRef = useRef(0);
  const winFrozenRef = useRef(null); // 扫播期间冻结的窗口起点
  const pressedRef = useRef(false);
  const scrubbingRef = useRef(false);
  const pressYRef = useRef(0);
  const fisheyeYRef = useRef(null);
  const hoverIdxRef = useRef(-1);
  const viewSetRef = useRef(new Set());
  const viewFirstRef = useRef(-1);
  const viewLastRef = useRef(-1);
  const crawlTimerRef = useRef(null);
  const crawlDirRef = useRef(0);
  const crawlClientYRef = useRef(0);
  const paintApiRef = useRef(null);
  const hoverTrackRef = useRef(false); // 轨道 hover 态,普通模式端点计数透明度靠这个防残留
  const flashTimersRef = useRef({ raf: null, timeout: null }); // 落点回声的 rAF 重试/淡出计时,卸载时清理

  // 最新数据走 ref,让大 effect 依赖保持最小。用 useLayoutEffect(而非 useEffect)
  // 同步,确保同一 commit 内、依赖变化触发下方大 effect 重跑时,latestRef 已是新值
  // ——否则大 effect 的 cleanup+重设置在 passive effect 之前执行,会用旧值 paintNow()
  // 一次(表现为 isStreaming 翻转后 live 态多停留一帧,brief 测试即断言零延迟)。
  const latestRef = useRef({ messages, railModel, widths, isStreaming });
  useLayoutEffect(() => {
    latestRef.current = { messages, railModel, widths, isStreaming };
    if (paintApiRef.current) paintApiRef.current.paint();
  });

  useEffect(() => {
    ensureStyle();
  }, []);

  const REDUCED =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 命令式核心 ----------
  useLayoutEffect(() => {
    const el = messagesRef.current;
    const track = trackRef.current;
    const lens = lensRef.current;
    if (!el || !track || !lens || !latestRef.current.messages.length) return undefined;

    const usable = () => track.clientHeight - 2 * PADV;

    const winBase = () =>
      winFrozenRef.current != null ? winFrozenRef.current : winSRef.current;

    // 刻度池样式合成:基础(纯函数) + 罩中加成 + 鱼眼加成,一处合成
    const styleTicks = () => {
      const { railModel: model, widths: ws, isStreaming: streaming } = latestRef.current;
      const count = model.length;
      const u = usable();
      const windowed = isWindowed(count, u);
      const base = windowed ? winBase() : 0;
      tickRefs.current.forEach((tk, k) => {
        if (!tk) return;
        const idx = base + k;
        if (idx >= count) {
          tk.style.display = "none";
          return;
        }
        tk.style.display = "";
        const it = model[idx];
        let w = ws[idx];
        let h = TICK_H;
        const inV = viewSetRef.current.has(idx);
        if (inV) {
          w += IN_VIEW_W_BONUS;
          h += IN_VIEW_H_BONUS;
        }
        const cy = tickCenterY({ index: idx, winBase: base, count, usable: u });
        if (fisheyeYRef.current != null && !REDUCED) {
          const g = fisheyeGain(Math.abs(cy - fisheyeYRef.current));
          w += g * FISHEYE_W_BONUS;
          h += g * FISHEYE_H_BONUS;
        }
        tk.style.width = `${w}px`;
        tk.style.height = `${h}px`;
        tk.style.left = `${(TRACK_W - w) / 2}px`;
        tk.style.top = `${cy - h / 2}px`;
        const live = streaming && idx === count - 1;
        tk.style.background = live
          ? C.live
          : it.role === "user"
          ? inV
            ? C.uOn
            : C.uOff
          : inV
          ? C.aOn
          : C.aOff;
        tk.classList.toggle("pupu-mm-live", live);
        tk.setAttribute("data-mm-role", it.role);
        const dot = tk.firstElementChild;
        if (dot) dot.style.display = it.hasCode || it.hasAttach ? "" : "none";
      });
    };

    const setPill = (ref, hidden) => {
      if (!ref.current) return;
      ref.current.style.opacity = hidden ? "0" : "1";
      ref.current.style.pointerEvents = hidden ? "none" : "auto";
    };

    // paint:视口检测(只遍历已挂载 Map)→ 窗口归中 → 透镜/进度 → 刻度样式 → 计数/pill。
    // 纯读 scroll 与已挂载节点几何,永不回写刻度几何(宪法 §0)。
    let paintQueued = null;
    const paintNow = () => {
      paintQueued = null;
      const { messages: msgs } = latestRef.current;
      const count = msgs.length;
      if (!count) return;
      const top = el.scrollTop;
      const inset =
        Number.isFinite(bottomViewportInset) && bottomViewportInset > 0
          ? bottomViewportInset
          : 0;
      const vh = Math.max(0, el.clientHeight - inset);
      const u = usable();

      let first = -1;
      let last = -1;
      let firstNode = null;
      let lastNode = null;
      const viewSet = new Set();
      messageNodeRefs.current.forEach((node, idx) => {
        if (!node) return;
        const a = node.offsetTop;
        const b = a + node.offsetHeight;
        if (b > top + 8 && a < top + vh - 8) {
          viewSet.add(idx);
          if (first < 0 || idx < first) {
            first = idx;
            firstNode = node;
          }
          if (idx > last) {
            last = idx;
            lastNode = node;
          }
        }
      });
      viewSetRef.current = viewSet;
      viewFirstRef.current = first;
      viewLastRef.current = last;

      // 滑动窗口:非扫播时随视口居中(整数步进;扫播时冻结)
      if (isWindowed(count, u) && !scrubbingRef.current && first >= 0) {
        winSRef.current = recenterWindow({ first, last, count, usable: u });
      }
      if (!isWindowed(count, u)) winSRef.current = 0;

      let fTop = 0;
      let fBot = 1;
      if (first >= 0 && firstNode && lastNode) {
        fTop = clamp01((top - firstNode.offsetTop) / Math.max(1, firstNode.offsetHeight));
        fBot = clamp01(
          (top + vh - lastNode.offsetTop) / Math.max(1, lastNode.offsetHeight),
        );
        const r = lensRect({
          first,
          last,
          fTop,
          fBot,
          winBase: winBase(),
          count,
          usable: u,
        });
        lens.style.top = `${r.top}px`;
        lens.style.height = `${r.height}px`;
        lens.style.opacity = "1";
        // 单条超长消息淹没整个视口:透镜旁显示阅读进度读数
        const pctEl = lensPctRef.current;
        if (pctEl) {
          if (first === last && firstNode.offsetHeight > vh * 1.2) {
            pctEl.textContent = `${readingPct(fBot)}%`;
            pctEl.style.top = `${track.offsetTop + r.top + r.height / 2 - 6}px`;
            pctEl.style.opacity = "0.9";
          } else {
            pctEl.style.opacity = "0";
          }
        }
      } else {
        lens.style.opacity = "0";
        if (lensPctRef.current) lensPctRef.current.style.opacity = "0";
      }

      styleTicks();

      // 计数:窗口模式端点常驻"未画出的 node 数";普通模式 hover 显示视口外条数
      const cTop = cTopRef.current;
      const cBot = cBotRef.current;
      if (cTop && cBot) {
        if (isWindowed(count, u)) {
          const hid = hiddenCounts({ winBase: winBase(), count, usable: u });
          cTop.textContent = hid.above > 0 ? `↑ ${capCount(hid.above)}` : "";
          cBot.textContent = hid.below > 0 ? `↓ ${capCount(hid.below)}` : "";
          cTop.style.opacity = hid.above > 0 ? "1" : "0";
          cBot.style.opacity = hid.below > 0 ? "1" : "0";
        } else {
          const above = Math.max(0, first);
          const below = first < 0 ? 0 : Math.max(0, count - 1 - last);
          cTop.textContent = above > 0 ? `↑ ${above}` : "";
          cBot.textContent = below > 0 ? `↓ ${below}` : "";
          // 普通模式下透明度由 hover 控制(pointerenter/leave),这里只更新文案;
          // 非 hover 态强制清零,避免窗口模式→普通模式收缩后 opacity:1 残留(无 hover 也常驻)
          if (!hoverTrackRef.current) {
            cTop.style.opacity = "0";
            cBot.style.opacity = "0";
          }
        }
      }

      const atTop = first === 0 && fTop <= 0.01;
      const atBottom = last === count - 1 && fBot >= 0.99;
      setPill(topPillRef, atTop);
      setPill(upOnePillRef, atTop);
      setPill(botPillRef, atBottom);
      setPill(downOnePillRef, atBottom);

      const scrollable = el.scrollHeight - el.clientHeight > 1;
      if (stackRef.current) {
        stackRef.current.style.display = scrollable || isWindowed(count, u) ? "" : "none";
      }
    };
    const paint = () => {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        if (paintQueued != null) return;
        paintQueued = window.requestAnimationFrame(paintNow);
      } else {
        paintNow();
      }
    };
    paintApiRef.current = { paint, paintNow, styleTicks };

    // ---------- 交互 ----------
    const trackYOf = (e) => e.clientY - track.getBoundingClientRect().top;

    const showSnap = (idx, y) => {
      const snap = snapRef.current;
      const { messages: msgs, railModel: model, isStreaming: streaming } = latestRef.current;
      const m = msgs[idx];
      const it = model[idx];
      if (!snap || !m || !it) return;
      hoverIdxRef.current = idx;
      const isLive = streaming && idx === msgs.length - 1;
      const raw = typeof m.content === "string" ? m.content : "";
      const flat = raw.replace(/```[\s\S]*?(```|$)/g, " ⌗ ").replace(/\s+/g, " ").trim();
      const snippet = flat
        ? flat.slice(0, 92) + (flat.length > 92 ? "…" : "")
        : isLive
        ? "正在生成…"
        : "(空消息)";
      let codePeek = "";
      if (it.hasCode) {
        const mCode = raw.match(/```[^\n]*\n([\s\S]*?)(```|$)/);
        if (mCode) codePeek = mCode[1].split("\n").slice(0, 3).join("\n");
      }
      const badges = [
        isLive ? "生成中" : "",
        it.hasCode ? "⌗ 代码" : "",
        it.hasAttach ? "📎" : "",
      ]
        .filter(Boolean)
        .map(
          (b) =>
            `<span style="background:${C.chip};border-radius:4px;padding:0 5px;font-size:9.5px;${
              b === "生成中" ? `color:${C.snapRole};font-weight:600;` : ""
            }">${b}</span>`,
        )
        .join("");
      snap.innerHTML =
        `<div style="display:flex;align-items:center;gap:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;letter-spacing:.05em;color:${C.snapMuted};margin-bottom:3px;">` +
        `<span style="font-weight:700;color:${m.role === "user" ? C.snapFg : C.snapRole};">${m.role === "user" ? "你" : "PuPu"}</span>` +
        `<span>#${idx + 1}</span>` +
        `<span style="margin-left:auto;display:flex;gap:4px;">${badges}</span></div>` +
        `<div data-mm-snap-snippet style="color:${C.snapFg};display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;"></div>` +
        (codePeek
          ? `<div data-mm-snap-code style="margin-top:5px;background:${C.chip};border:1px solid ${C.snapLine};border-radius:6px;padding:5px 7px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.5px;line-height:1.45;color:${C.snapMuted};white-space:pre;overflow:hidden;max-height:46px;"></div>`
          : "");
      // 正文/代码用 textContent 注入,杜绝消息内容进入 innerHTML(XSS 面)
      snap.querySelector("[data-mm-snap-snippet]").textContent = snippet;
      if (codePeek) snap.querySelector("[data-mm-snap-code]").textContent = codePeek;
      const stageH = stackRef.current ? stackRef.current.clientHeight : 0;
      const h = snap.offsetHeight || 84;
      snap.style.top = `${Math.max(10, Math.min(track.offsetTop + y - h / 2, stageH - h - 10))}px`;
      snap.style.opacity = "1";
      snap.style.transform = "translateX(0)";
    };
    const hideSnap = () => {
      hoverIdxRef.current = -1;
      const snap = snapRef.current;
      if (!snap) return;
      snap.style.opacity = "0";
      snap.style.transform = "translateX(6px)";
    };

    // 落点回声:节点可能因扩窗尚未挂载,rAF 重试至多 ~1.5s
    const flashMessage = (idx) => {
      if (REDUCED) return;
      let tries = 0;
      const attempt = () => {
        flashTimersRef.current.raf = null;
        const node = messageNodeRefs.current.get(idx);
        if (node) {
          node.style.setProperty("--pupu-mm-flash", C.flash);
          node.classList.remove("pupu-mm-flash");
          void node.offsetWidth; // 重启动画
          node.classList.add("pupu-mm-flash");
          flashTimersRef.current.timeout = window.setTimeout(() => {
            node.classList.remove("pupu-mm-flash");
            flashTimersRef.current.timeout = null;
          }, 1700);
          return;
        }
        if (tries++ < 90 && typeof window.requestAnimationFrame === "function") {
          flashTimersRef.current.raf = window.requestAnimationFrame(attempt);
        }
      };
      attempt();
    };

    const idxAtCursorY = (y) => {
      const count = latestRef.current.messages.length;
      return indexAtY({ y, winBase: winBase(), count, usable: usable() });
    };

    // 扫播到轨道边缘:窗口自动爬行翻页(仅窗口模式)
    const stopCrawl = () => {
      crawlDirRef.current = 0;
      if (crawlTimerRef.current != null) {
        clearInterval(crawlTimerRef.current);
        crawlTimerRef.current = null;
      }
    };
    const setCrawl = (dir, clientY) => {
      crawlClientYRef.current = clientY;
      if (dir === crawlDirRef.current) return;
      stopCrawl();
      crawlDirRef.current = dir;
      if (dir === 0) return;
      crawlTimerRef.current = setInterval(() => {
        if (winFrozenRef.current == null) return;
        const count = latestRef.current.messages.length;
        const cap = winCapacity(usable());
        winFrozenRef.current = Math.max(
          0,
          Math.min(Math.max(0, count - cap), winFrozenRef.current + crawlDirRef.current),
        );
        const y = crawlClientYRef.current - track.getBoundingClientRect().top;
        const idx = idxAtCursorY(y);
        scrollToMessageIndex(idx, "auto", { align: "top", settle: false });
        showSnap(idx, y);
        styleTicks();
        paintNow();
      }, CRAWL_STEP_MS);
    };

    const endScrub = () => {
      pressedRef.current = false;
      scrubbingRef.current = false;
      stopCrawl();
      winFrozenRef.current = null; // 松手:窗口解冻,下一帧平滑归中
      paint();
    };

    const onPointerEnter = () => {
      hoverTrackRef.current = true;
      const count = latestRef.current.messages.length;
      if (!isWindowed(count, usable())) {
        if (cTopRef.current) cTopRef.current.style.opacity = "1";
        if (cBotRef.current) cBotRef.current.style.opacity = "1";
      }
    };
    const onPointerMove = (e) => {
      const y = trackYOf(e);
      fisheyeYRef.current = y;
      const idx = idxAtCursorY(y);
      if (
        pressedRef.current &&
        !scrubbingRef.current &&
        Math.abs(e.clientY - pressYRef.current) > SCRUB_THRESHOLD_PX
      ) {
        scrubbingRef.current = true;
        const count = latestRef.current.messages.length;
        winFrozenRef.current = isWindowed(count, usable()) ? winSRef.current : null;
      }
      if (scrubbingRef.current) {
        scrollToMessageIndex(idx, "auto", { align: "top", settle: false });
        const count = latestRef.current.messages.length;
        if (isWindowed(count, usable())) {
          const th = track.clientHeight;
          setCrawl(y < CRAWL_EDGE_PX ? -1 : y > th - CRAWL_EDGE_PX ? 1 : 0, e.clientY);
        }
      }
      showSnap(idx, y);
      styleTicks();
    };
    const onPointerLeave = () => {
      if (scrubbingRef.current) return;
      hoverTrackRef.current = false;
      fisheyeYRef.current = null;
      hideSnap();
      const count = latestRef.current.messages.length;
      if (!isWindowed(count, usable())) {
        if (cTopRef.current) cTopRef.current.style.opacity = "0";
        if (cBotRef.current) cBotRef.current.style.opacity = "0";
      }
      styleTicks();
    };
    const onPointerDown = (e) => {
      pressedRef.current = true;
      pressYRef.current = e.clientY;
      if (track.setPointerCapture) {
        try {
          track.setPointerCapture(e.pointerId);
        } catch (err) {
          /* jsdom/旧环境无 pointer capture,忽略 */
        }
      }
    };
    const onPointerUp = (e) => {
      if (track.hasPointerCapture && track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
      const wasScrub = scrubbingRef.current;
      const y = trackYOf(e);
      const idx = idxAtCursorY(y);
      endScrub();
      if (!wasScrub) {
        scrollToMessageIndex(idx, "auto", { align: "center" });
        flashMessage(idx);
      }
    };
    const onPointerCancel = (e) => {
      if (track.hasPointerCapture && track.hasPointerCapture(e.pointerId)) {
        track.releasePointerCapture(e.pointerId);
      }
      fisheyeYRef.current = null;
      hideSnap();
      endScrub();
    };
    const onWheel = (e) => {
      e.preventDefault(); // 轨道上滚轮 1:1 代理聊天区
      el.scrollTop += e.deltaY;
    };
    const onKeyDown = (e) => {
      const count = latestRef.current.messages.length;
      const cur =
        hoverIdxRef.current >= 0
          ? hoverIdxRef.current
          : viewFirstRef.current >= 0
          ? viewFirstRef.current
          : safeVisibleStart;
      let next = null;
      if (e.key === "ArrowUp") next = Math.max(0, cur - 1);
      else if (e.key === "ArrowDown") next = Math.min(count - 1, cur + 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = count - 1;
      if (next == null) return;
      e.preventDefault();
      scrollToMessageIndex(next, "smooth", { align: "center" });
      flashMessage(next);
      hoverIdxRef.current = next;
    };

    const onScroll = () => {
      if (scrubbingRef.current) return; // 扫播中由 dragTo/crawl 主导渲染
      paint();
    };

    track.addEventListener("pointerenter", onPointerEnter);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("pointerleave", onPointerLeave);
    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointerup", onPointerUp);
    track.addEventListener("pointercancel", onPointerCancel);
    track.addEventListener("wheel", onWheel, { passive: false });
    track.addEventListener("keydown", onKeyDown);
    el.addEventListener("scroll", onScroll, { passive: true });

    // 池容量 = 窗口容量:挂载与 resize 时各校准一次(合法 setState 点)
    const syncPool = () => {
      const cap = winCapacity(usable());
      setPoolSize((prev) => (prev === cap ? prev : cap));
    };
    syncPool();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncPool();
            if (!latestRef.current.isStreaming) paint();
          })
        : null;
    if (ro) {
      ro.observe(track);
      ro.observe(el);
    }
    // 流式兜底:直播膨胀不产生 scroll 事件时(用户上翻脱离吸底),透镜/进度仍每 400ms 跟上
    let streamTimer = null;
    if (isStreaming) {
      streamTimer = setInterval(() => {
        if (!scrubbingRef.current) paintNow();
      }, STREAM_PAINT_INTERVAL_MS);
    }

    paintNow();

    return () => {
      track.removeEventListener("pointerenter", onPointerEnter);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("pointerleave", onPointerLeave);
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointerup", onPointerUp);
      track.removeEventListener("pointercancel", onPointerCancel);
      track.removeEventListener("wheel", onWheel);
      track.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("scroll", onScroll);
      if (paintQueued != null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(paintQueued);
      }
      if (ro) ro.disconnect();
      if (streamTimer != null) clearInterval(streamTimer);
      stopCrawl();
      if (flashTimersRef.current.raf != null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(flashTimersRef.current.raf);
      }
      if (flashTimersRef.current.timeout != null) {
        window.clearTimeout(flashTimersRef.current.timeout);
      }
      flashTimersRef.current = { raf: null, timeout: null };
      paintApiRef.current = null;
    };
    // messages/widths 走 latestRef(顶部小 effect 同步并触发 paint),此处依赖保持最小:
    // 只有形态级变化(主题/流式态/池容量/挂载目标)才重初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [C, isStreaming, poolSize, bottomViewportInset, messagesRef, messageNodeRefs, scrollToMessageIndex, safeVisibleStart, REDUCED]);

  // 新消息弹入:池尾刻度补 pop 动画(消息数增长的下降沿由 useMemo/latestRef 触发重绘)
  const prevCountRef = useRef(messages.length);
  useEffect(() => {
    const prev = prevCountRef.current;
    prevCountRef.current = messages.length;
    if (messages.length > prev && tickRefs.current.length) {
      // 池槽位 = 最新消息的窗口内相对位置(窗口模式下 winSRef 非零;非窗口态恒为 0),
      // 而非"最后一个可见槽"——窗口模式下二者不同,错位会让 pop 动画糊到旧刻度上
      const slot = messages.length - 1 - winSRef.current;
      const newestTick =
        slot >= 0 && slot < tickRefs.current.length ? tickRefs.current[slot] : null;
      if (newestTick) {
        newestTick.classList.remove("pupu-mm-pop");
        void newestTick.offsetWidth;
        newestTick.classList.add("pupu-mm-pop");
      }
    }
  }, [messages.length]);

  if (!messages.length) return null;
  const tickCount = Math.min(messages.length, Math.max(poolSize, 1));

  // 导航 pill 处理器(index 语义:当前首条可见消息 ±1)
  const jumpRelative = (delta) => {
    const cur = viewFirstRef.current >= 0 ? viewFirstRef.current : safeVisibleStart;
    const next = Math.max(0, Math.min(messages.length - 1, cur + delta));
    if (next !== cur) scrollToMessageIndex(next, "smooth");
  };

  return (
    <div
      ref={stackRef}
      data-mm-stack
      style={{
        position: "absolute",
        right: 0,
        top: TOP_INSET,
        bottom: bottomViewportInset,
        width: STACK_W,
        zIndex: 2,
      }}
    >
      <div
        ref={cTopRef}
        data-mm-count-top
        style={{
          position: "absolute", left: "50%", top: 64,
          transform: "translateX(-50%)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9, fontWeight: 600, color: C.count,
          fontVariantNumeric: "tabular-nums",
          opacity: 0, transition: "opacity .25s ease",
          whiteSpace: "nowrap", pointerEvents: "none",
        }}
      />
      <div
        ref={cBotRef}
        data-mm-count-bottom
        style={{
          position: "absolute", left: "50%", bottom: 64,
          transform: "translateX(-50%)",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9, fontWeight: 600, color: C.count,
          fontVariantNumeric: "tabular-nums",
          opacity: 0, transition: "opacity .25s ease",
          whiteSpace: "nowrap", pointerEvents: "none",
        }}
      />
      <div
        ref={lensPctRef}
        data-mm-lenspct
        style={{
          position: "absolute", right: STACK_W + 7,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 9.5, color: C.snapRole,
          fontVariantNumeric: "tabular-nums",
          opacity: 0,
          transition: `opacity .2s ease, top .12s ${EASE}`,
          pointerEvents: "none", whiteSpace: "nowrap",
        }}
      />

      <div
        ref={trackRef}
        data-mm-track
        tabIndex={0}
        role="scrollbar"
        aria-label="会话导航轨"
        style={{
          position: "absolute",
          right: 2,
          top: INSET_BASE,
          bottom: INSET_BASE,
          width: TRACK_W,
          cursor: "pointer",
          touchAction: "none",
          outline: "none",
        }}
      >
        <div
          ref={lensRef}
          data-mm-lens
          style={{
            position: "absolute",
            left: -3,
            right: -3,
            background: C.lensBg,
            border: `1px solid ${C.lensLine}`,
            borderRadius: 8,
            opacity: 0,
            pointerEvents: "none",
            transition: `top .12s ${EASE}, height .12s ${EASE}, opacity .2s ease`,
          }}
        />
        {Array.from({ length: tickCount }).map((_, k) => (
          <div
            key={k}
            data-mm-tick
            ref={(n) => {
              tickRefs.current[k] = n;
            }}
            style={{
              position: "absolute",
              borderRadius: 100,
              background: C.uOff,
              transition:
                `background .24s ease, width .13s ease, height .13s ease, ` +
                `left .13s ease, top .13s ease`,
              // live 呼吸光晕的颜色走 CSS var(伪元素无法内联)
              "--pupu-mm-live-halo": C.liveHalo,
            }}
          >
            <span
              data-mm-dot
              style={{
                position: "absolute",
                top: "50%",
                right: -5,
                width: 3,
                height: 3,
                borderRadius: 100,
                background: C.aOn,
                transform: "translateY(-50%)",
                display: "none",
              }}
            />
          </div>
        ))}
      </div>

      <div
        ref={snapRef}
        data-mm-snap
        style={{
          position: "absolute",
          right: STACK_W + 14,
          width: SNAP_W,
          background: C.snapBg,
          WebkitBackdropFilter: "blur(14px) saturate(1.1)",
          backdropFilter: "blur(14px) saturate(1.1)",
          border: `1px solid ${C.snapLine}`,
          borderRadius: 12,
          padding: "9px 12px 10px",
          fontSize: 11.5,
          lineHeight: 1.55,
          boxShadow: isDark
            ? "0 10px 34px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)"
            : "0 10px 34px rgba(30,24,12,0.18), 0 2px 8px rgba(30,24,12,0.1)",
          opacity: 0,
          transform: "translateX(6px)",
          pointerEvents: "none",
          transition: `opacity .15s ease, transform .15s ease, top .12s ${EASE}`,
          zIndex: 5,
        }}
      />

      <NavPill nodeRef={topPillRef} edge="top" offset={8} icon={CH_UP2} C={C} isDark={isDark}
        onClick={() => scrollToMessageIndex(0, "smooth")} />
      <NavPill nodeRef={upOnePillRef} edge="top" offset={38} icon={CH_UP} C={C} isDark={isDark}
        onClick={() => jumpRelative(-1)} />
      <NavPill nodeRef={downOnePillRef} edge="bottom" offset={38} icon={CH_DOWN} C={C} isDark={isDark}
        onClick={() => jumpRelative(1)} />
      <NavPill nodeRef={botPillRef} edge="bottom" offset={8} icon={CH_DOWN2} C={C} isDark={isDark}
        onClick={() => {
          const el = messagesRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }} />
    </div>
  );
};

export default MessageMinimap;
