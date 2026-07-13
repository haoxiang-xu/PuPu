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
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  colorWithAlpha,
  themeHighlightColor,
} from "../../../CONTAINERs/config/theme_highlight";
import {
  TICK_H,
  TRACK_W,
  PADV,
  NEEDLE_W,
  HOVER_MAX_W,
  FISHEYE_W_BONUS,
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
  railExtent,
  fisheyeGain,
  clamp01,
  readingPct,
} from "../minimap_rail_geometry";

const EASE = "cubic-bezier(.22,.61,.36,1)";
const TOP_INSET = 38; // 避开窗口顶部可拖拽标题栏(否则 to-top 按钮点不到)
const INSET_BASE = 74; // 轨道上/下内边距:给两颗 pill 让位
const STACK_W = 36; // 轨道整体内收:贴窗口边会被 overflow:hidden 祖先裁掉透镜/够不着 hover
const SNAP_W = 236;
const SCRUB_THRESHOLD_PX = 6;
const WIN_GLIDE_TAU_MS = 170; // 窗口归中滑动时间常数:大跳 ~0.5s 收敛,与刷新率无关
const STREAM_PAINT_INTERVAL_MS = 400; // 流式期间兜底重绘(直播膨胀不产生 scroll 事件时透镜仍跟上)

const PALETTE = {
  dark: {
    uOn: "rgba(255,255,255,0.62)",
    tickDim: "rgba(255,255,255,0.12)", // 视口外:统一淡色,不分角色
    count: "rgba(255,255,255,0.40)",
    /* 快照卡走 palette/attach 家族语言(command_palette_panel/command_menu 同源 token) */
    snapBg: "rgba(28,28,28,0.85)", snapLine: "rgba(255,255,255,0.10)",
    snapFg: "rgba(255,255,255,0.92)", snapMuted: "rgba(255,255,255,0.42)",
    snapBody: "rgba(255,255,255,0.78)", snapHint: "rgba(255,255,255,0.35)",
    snapCodeBg: "rgba(255,255,255,0.05)",
    snapShadow: "0 10px 34px rgba(0,0,0,0.5)",
    chip: "rgba(255,255,255,0.10)",
  },
  light: {
    uOn: "rgba(0,0,0,0.55)",
    tickDim: "rgba(0,0,0,0.12)",
    count: "rgba(0,0,0,0.40)",
    snapBg: "rgba(252,252,252,0.9)", snapLine: "rgba(0,0,0,0.09)",
    snapFg: "rgba(0,0,0,0.86)", snapMuted: "rgba(0,0,0,0.44)",
    snapBody: "rgba(0,0,0,0.72)", snapHint: "rgba(0,0,0,0.38)",
    snapCodeBg: "rgba(0,0,0,0.045)",
    snapShadow: "0 10px 34px rgba(0,0,0,0.12)",
    chip: "rgba(0,0,0,0.06)",
  },
};

// 导航钮图标(E5 定稿):1.8px 细线,与 2.5px 刻度同"线"气质;bar+箭头 = 远跳。
const IC_STROKE =
  'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const IC_TOP =
  `<svg width="13" height="13" style="display:block" viewBox="0 0 24 24" ${IC_STROKE}><path d="M6 6h12M12 19V10M8.5 13.5 12 10l3.5 3.5"/></svg>`;
const IC_PREV =
  `<svg width="13" height="13" style="display:block" viewBox="0 0 24 24" ${IC_STROKE}><path d="M8 14.5 12 10.5l4 4"/></svg>`;
const IC_NEXT =
  `<svg width="13" height="13" style="display:block" viewBox="0 0 24 24" ${IC_STROKE}><path d="M8 10.5 12 14.5l4-4"/></svg>`;
const IC_END =
  `<svg width="13" height="13" style="display:block" viewBox="0 0 24 24" ${IC_STROKE}><path d="M6 18h12M12 5v9M8.5 10.5 12 14l3.5-3.5"/></svg>`;

// 注入一次:滚动条隐藏(chat_messages 依赖)、pill hover、live 呼吸、弹入、落点回声、reduced-motion
let styleInjected = false;
const ensureStyle = () => {
  if (styleInjected || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent =
    ".chat-scroll-host{scrollbar-width:none;-ms-overflow-style:none;}" +
    ".chat-scroll-host::-webkit-scrollbar{width:0;height:0;display:none;}" +
    // 导航钮(E5):无底座,右齐平;静息淡显 → hover 亮起,图标向左递 2px(与刻度伸长同向)
    "[data-mm-pill]{transition:opacity .22s " + EASE + ",color .15s ease;}" +
    '[data-mm-pill][data-dark="1"]{color:rgba(255,255,255,0.34);}' +
    '[data-mm-pill][data-dark="0"]{color:rgba(0,0,0,0.30);}' +
    '[data-mm-pill][data-dark="1"]:hover{color:rgba(255,255,255,0.95);}' +
    '[data-mm-pill][data-dark="0"]:hover{color:rgba(0,0,0,0.85);}' +
    "[data-mm-pill] svg{transition:transform .15s ease;}" +
    "[data-mm-pill]:hover svg{transform:translateX(-2px);}" +
    // 注解标签:随语言翻译,排印跟随 locale 正文字体(--pupu-font-family,en=Jost/zh=霞鹜文楷…);
    // hover 驻留 300ms 才出现,扫过不闪、离开即收
    "[data-mm-lbl]{position:absolute;right:30px;top:50%;transform:translate(5px,-50%);" +
    'font-family:var(--pupu-font-family,"Jost",sans-serif);font-size:10px;font-weight:500;line-height:1;letter-spacing:.02em;' +
    "opacity:0;transition:opacity .18s ease,transform .18s ease;pointer-events:none;white-space:nowrap;}" +
    '[data-mm-pill][data-dark="1"] [data-mm-lbl]{color:rgba(255,255,255,0.52);}' +
    '[data-mm-pill][data-dark="0"] [data-mm-lbl]{color:rgba(0,0,0,0.50);}' +
    "[data-mm-pill]:hover [data-mm-lbl]{opacity:1;transform:translate(0,-50%);transition-delay:.3s;}" +
    // live 刻度呼吸光晕 —— 全设计唯一允许的光晕(spec §6/§8)
    "[data-mm-tick].pupu-mm-live::after{content:'';position:absolute;inset:-3px -4px;border-radius:100px;background:var(--pupu-mm-live-halo);animation:pupuMmBreathe 1.6s ease-in-out infinite;z-index:-1;}" +
    "@keyframes pupuMmBreathe{0%,100%{opacity:.25;transform:scale(.9);}50%{opacity:1;transform:scale(1.25);}}" +
    "[data-mm-tick].pupu-mm-pop{animation:pupuMmPop .34s cubic-bezier(.34,1.56,.64,1) 1;}" +
    "@keyframes pupuMmPop{0%{transform:scaleX(.2);opacity:0;}100%{transform:scaleX(1);opacity:1;}}" +
    // 落点回声:侧标线(CEO 选定方案 C)—— 3px 竖线在消息侧边展开→停→淡出
    ".pupu-mm-flash{position:relative;}" +
    // assistant(默认,线在左):只标消息开头一小段;user(right,气泡小):整高
    ".pupu-mm-flash::before{content:'';position:absolute;left:4px;top:4px;width:3px;height:20px;border-radius:100px;background:var(--pupu-mm-flash);animation:pupuMmFlashBar 1.8s cubic-bezier(0.22,1,0.36,1) 1;pointer-events:none;}" +
    '.pupu-mm-flash[data-mm-flash-side="right"]::before{left:auto;right:-12px;top:8%;height:84%;}' +
    "@keyframes pupuMmFlashBar{0%{transform:scaleY(0);opacity:0;}12%{transform:scaleY(1);opacity:1;}70%{transform:scaleY(1);opacity:1;}100%{transform:scaleY(1);opacity:0;}}" +
    "@media (prefers-reduced-motion: reduce){[data-mm-tick].pupu-mm-live::after,[data-mm-tick].pupu-mm-pop{animation:none !important;}.pupu-mm-flash::before{animation:none !important;content:none;}[data-mm-pill] svg,[data-mm-lbl]{transition:none !important;}}";
  document.head.appendChild(el);
  styleInjected = true;
};

// 导航 pill(E5 · 注解标签):右齐平贴轨(与刻度共享右缘)、无底座细线图标,
// hover 亮起 + 图标左递,驻留 300ms 滑出等宽小标签。显隐逻辑与旧版一致,四颗全保留。
const NavPill = ({ nodeRef, edge, offset, icon, label, isDark, onClick }) => (
  <div
    ref={nodeRef}
    data-mm-pill
    data-dark={isDark ? "1" : "0"}
    role="button"
    aria-label={label}
    onClick={onClick}
    style={{
      position: "absolute",
      right: 8, // 与轨道(right:8)右缘对齐,不再居中悬浮
      [edge]: offset,
      width: TRACK_W,
      height: 18,
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      cursor: "pointer",
      opacity: 0,
      pointerEvents: "none",
    }}
  >
    <span data-mm-lbl>{label}</span>
    <span
      style={{ width: 13, height: 13, display: "block" }}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  </div>
);

const MessageMinimap = ({
  scrollHostId = "chat-scroll-host",
  messagesRef,
  messageNodeRefs,
  messages = [],
  safeVisibleStart = 0,
  scrollToMessageIndex,
  scrollViewportByPage,
  onBackToBottom,
  bottomViewportInset = 0,
  isDark,
  isStreaming = false,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const highlightColor = themeHighlightColor(theme);
  const C = useMemo(() => {
    const base = PALETTE[isDark ? "dark" : "light"];
    return {
      ...base,
      aOn: colorWithAlpha(highlightColor, isDark ? 0.9 : 0.85), // 点亮才着色,直接用强色
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
  // 窗口归中滑动的连续性状态。必须是组件级 ref:点击跳远消息会触发 chunked
  // expand → safeVisibleStart 变化 → 大 effect 重初始化;若这些住在 effect 闭包,
  // 每次重初始化都会重置"首帧直接落位"标记,把进行中的滑动打断成闪跳。
  const winGlideLastTsRef = useRef(null);
  const snapNextWinRef = useRef(true);
  const lastPaintCountRef = useRef(-1);
  const lastPaintFirstIdRef = useRef(null);
  const flashTimersRef = useRef({
    generation: 0,
    raf: null,
    timeout: null,
    target: null,
  }); // 落点回声只允许最新一次 jump 持有重试/淡出任务
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
    if (!el || !track || !latestRef.current.messages.length) return undefined;

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
      // 归中滑动期间 base 可为分数:槽位映射取整,位置保留分数位(整组刻度平滑滑动)
      const slotBase = Math.floor(base);
      tickRefs.current.forEach((tk, k) => {
        if (!tk) return;
        const idx = slotBase + k;
        if (idx >= count) {
          tk.style.display = "none";
          return;
        }
        tk.style.display = "";
        const it = model[idx];
        let w = ws[idx];
        const cy = tickCenterY({ index: idx, winBase: base, count, usable: u });
        if (fisheyeYRef.current != null && !REDUCED) {
          const g = fisheyeGain(Math.abs(cy - fisheyeYRef.current));
          w = Math.min(HOVER_MAX_W, w + g * FISHEYE_W_BONUS); // hover 只变长,不加粗
        }
        if (idx === viewFirstRef.current) w = NEEDLE_W; // 位置针:视口顶部所在的刻度最长
        tk.style.width = `${w}px`;
        tk.style.height = `${TICK_H}px`;
        tk.style.top = `${cy - TICK_H / 2}px`;
        const inV = viewSetRef.current.has(idx);
        const live = streaming && idx === count - 1;
        // 视口外统一淡色不分角色;点亮的才按角色着色
        tk.style.background = live
          ? C.live
          : !inV
          ? C.tickDim
          : it.role === "user"
          ? C.uOn
          : C.aOn;
        tk.classList.toggle("pupu-mm-live", live);
        tk.setAttribute("data-mm-role", it.role);
      });
    };

    const setPill = (ref, hidden) => {
      if (!ref.current) return;
      ref.current.style.opacity = hidden ? "0" : "1";
      ref.current.style.pointerEvents = hidden ? "none" : "auto";
    };

    // 窗口归中滑动:大跳距(点击/瞬时落位)时 winS 逐帧趋近目标,而非一帧重映射。
    // 挂载首帧与会话切换(首条 id/条数变化)直接落位;连续性状态在组件级 ref 上。
    let winGlideRaf = null;
    const stopWinGlide = () => {
      if (winGlideRaf != null && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(winGlideRaf);
      }
      winGlideRaf = null;
    };

    // paint:视口检测(只遍历已挂载 Map)→ 窗口归中 → 透镜/进度 → 刻度样式 → 计数/pill。
    // 纯读 scroll 与已挂载节点几何,永不回写刻度几何(宪法 §0)。
    let paintQueued = null;
    const paintNow = () => {
      paintQueued = null;
      const { messages: msgs } = latestRef.current;
      const count = msgs.length;
      if (!count) return;
      const firstId = msgs[0] && msgs[0].id;
      if (count !== lastPaintCountRef.current || firstId !== lastPaintFirstIdRef.current) {
        lastPaintCountRef.current = count;
        lastPaintFirstIdRef.current = firstId;
        snapNextWinRef.current = true;
      }
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
      const ariaIndex = Math.max(
        0,
        Math.min(count - 1, first >= 0 ? first : safeVisibleStart),
      );
      track.setAttribute("aria-valuenow", String(ariaIndex));
      track.setAttribute("aria-valuemax", String(Math.max(0, count - 1)));
      track.setAttribute(
        "aria-valuetext",
        `Message ${ariaIndex + 1} of ${count}`,
      );

      // 滑动窗口:非扫播时随视口居中(扫播时冻结)。小步进(≤1)即时落位保持跟手;
      // 点击/瞬时跳转造成的大位移做归中滑动 —— 选中区域平滑滑入轨道中央,
      // 而非一帧内瞬间重映射(会读成 bug 般的闪跳)。
      if (isWindowed(count, u) && !scrubbingRef.current && first >= 0) {
        const target = recenterWindow({ first, last, count, usable: u });
        const diff = target - winSRef.current;
        const canGlide =
          !REDUCED &&
          typeof window !== "undefined" &&
          typeof window.requestAnimationFrame === "function";
        if (snapNextWinRef.current || !canGlide || Math.abs(diff) <= 1) {
          winSRef.current = target;
          winGlideLastTsRef.current = null;
          stopWinGlide();
        } else {
          // 时间基指数趋近:每帧固定比例在 120Hz 屏上会快一倍,故按真实 dt 推进
          const now =
            typeof performance !== "undefined" &&
            typeof performance.now === "function"
              ? performance.now()
              : Date.now();
          const dt =
            winGlideLastTsRef.current == null
              ? 16
              : Math.min(100, Math.max(8, now - winGlideLastTsRef.current));
          winGlideLastTsRef.current = now;
          winSRef.current += diff * (1 - Math.exp(-dt / WIN_GLIDE_TAU_MS));
          if (Math.abs(target - winSRef.current) < 0.5) {
            winSRef.current = target;
            winGlideLastTsRef.current = null;
          } else if (winGlideRaf == null) {
            winGlideRaf = window.requestAnimationFrame(winGlideStep);
          }
        }
        snapNextWinRef.current = false;
      }
      if (!isWindowed(count, u)) {
        winSRef.current = 0;
        stopWinGlide();
      }

      let fTop = 0;
      let fBot = 1;
      if (first >= 0 && firstNode && lastNode) {
        fTop = clamp01((top - firstNode.offsetTop) / Math.max(1, firstNode.offsetHeight));
        fBot = clamp01(
          (top + vh - lastNode.offsetTop) / Math.max(1, lastNode.offsetHeight),
        );
      }
      // 超屏进度:视口顶部的消息高过一屏 → 位置针旁显示 %(fBot 取顶部消息的已读比例)
      const pctEl = lensPctRef.current;
      if (pctEl) {
        if (first >= 0 && firstNode && firstNode.offsetHeight > vh * 1.1) {
          const fRead = clamp01(
            (top + vh - firstNode.offsetTop) / Math.max(1, firstNode.offsetHeight),
          );
          pctEl.textContent = `${readingPct(fRead)}%`;
          pctEl.style.top = `${
            track.offsetTop +
            tickCenterY({ index: first, winBase: winBase(), count, usable: u }) -
            6
          }px`;
          pctEl.style.opacity = "0.9";
        } else {
          pctEl.style.opacity = "0";
        }
      }

      styleTicks();

      // 计数:只在轨道装不下全部刻度时,显示两端没画出来的数量;装得下时无任何计数
      const cTop = cTopRef.current;
      const cBot = cBotRef.current;
      if (cTop && cBot) {
        if (isWindowed(count, u)) {
          const hid = hiddenCounts({ winBase: Math.round(winBase()), count, usable: u });
          cTop.textContent = hid.above > 0 ? `↑ ${capCount(hid.above)}` : "";
          cBot.textContent = hid.below > 0 ? `↓ ${capCount(hid.below)}` : "";
          cTop.style.opacity = hid.above > 0 ? "1" : "0";
          cBot.style.opacity = hid.below > 0 ? "1" : "0";
        } else {
          cTop.style.opacity = "0";
          cBot.style.opacity = "0";
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
    // 滑动帧:重进 paintNow,由归中块按剩余距离继续推进,直至收敛自停
    const winGlideStep = () => {
      winGlideRaf = null;
      paintNow();
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
        ? "Generating…"
        : "(empty)";
      let codePeek = "";
      if (it.hasCode) {
        const mCode = raw.match(/```[^\n]*\n([\s\S]*?)(```|$)/);
        if (mCode) codePeek = mCode[1].split("\n").slice(0, 3).join("\n");
      }
      // palette 家族条目排版:名称 12.5/600 + 提示 10.5/.05em + chip 圆角 8
      const badges = [
        isLive ? "Generating" : "",
        it.hasCode ? "⌗ Code" : "",
        it.hasAttach ? "📎" : "",
      ]
        .filter(Boolean)
        .map(
          (b) =>
            `<span style="display:inline-flex;align-items:center;height:16px;background:${C.chip};border-radius:8px;padding:0 6px;font-size:10px;line-height:16px;color:${C.snapMuted};${
              b === "Generating" ? `color:${C.snapRole};font-weight:600;` : ""
            }">${b}</span>`,
        )
        .join("");
      const roleDot = m.role === "user" ? C.uOn : C.aOn;
      snap.innerHTML =
        `<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px;">` +
        `<span style="flex-shrink:0;width:6px;height:6px;border-radius:100px;background:${roleDot};"></span>` +
        `<span style="font-size:12.5px;line-height:16px;font-weight:600;color:${C.snapFg};">${m.role === "user" ? "User" : "Assistant"}</span>` +
        `<span style="font-size:10.5px;letter-spacing:.05em;color:${C.snapHint};">#${idx + 1}</span>` +
        `<span style="margin-left:auto;display:flex;gap:4px;">${badges}</span></div>` +
        `<div data-mm-snap-snippet style="font-size:12px;line-height:1.55;color:${C.snapBody};display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;"></div>` +
        (codePeek
          ? `<div data-mm-snap-code style="margin-top:6px;background:${C.snapCodeBg};border:1px solid ${C.snapLine};border-radius:8px;padding:6px 8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:1.5;color:${C.snapMuted};white-space:pre;overflow:hidden;max-height:48px;"></div>`
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

    const cancelFlash = () => {
      const work = flashTimersRef.current;
      work.generation += 1;
      if (
        work.raf != null &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(work.raf);
      }
      if (work.timeout != null) {
        window.clearTimeout(work.timeout);
      }
      if (work.target) {
        work.target.classList.remove("pupu-mm-flash");
      }
      work.raf = null;
      work.timeout = null;
      work.target = null;
    };

    // 落点回声:节点可能因扩窗尚未挂载,rAF 重试至多 ~1.5s
    const flashMessage = (idx) => {
      if (REDUCED) return;
      cancelFlash();
      const generation = flashTimersRef.current.generation;
      let tries = 0;
      const attempt = () => {
        const work = flashTimersRef.current;
        if (work.generation !== generation) return;
        work.raf = null;
        const node = messageNodeRefs.current.get(idx);
        if (node) {
          // 侧标线:user 打在气泡本体右侧,assistant 打在整行左侧(padding 带内,
          // 不越出 wrapper 以免触发聊天区横向溢出)
          const role = (latestRef.current.messages[idx] || {}).role;
          let target = node;
          if (role === "user") {
            const bubble = node.querySelector('div[style*="border-radius"]');
            if (bubble) target = bubble;
            target.setAttribute("data-mm-flash-side", "right");
          } else {
            target.removeAttribute("data-mm-flash-side");
          }
          target.style.setProperty("--pupu-mm-flash", C.aOn); // 实色标线,非淡染
          target.classList.remove("pupu-mm-flash");
          void target.offsetWidth; // 重启动画
          target.classList.add("pupu-mm-flash");
          work.target = target;
          work.timeout = window.setTimeout(() => {
            const latest = flashTimersRef.current;
            if (latest.generation !== generation) return;
            target.classList.remove("pupu-mm-flash");
            latest.timeout = null;
            latest.target = null;
          }, 1900);
          return;
        }
        if (tries++ < 90 && typeof window.requestAnimationFrame === "function") {
          work.raf = window.requestAnimationFrame(attempt);
        }
      };
      attempt();
    };

    const idxAtCursorY = (y) => {
      const count = latestRef.current.messages.length;
      // 滑动进行中 base 为分数:命中判定取整,避免落到不存在的分数下标
      return indexAtY({ y, winBase: Math.round(winBase()), count, usable: usable() });
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
      // 松手:让 winS 接管冻结位再解冻 —— 直接置 null 会先闪回冻结前的 winS 再归中
      if (winFrozenRef.current != null) winSRef.current = winFrozenRef.current;
      winFrozenRef.current = null;
      paint();
    };

    // 刻度组外的轨道空白 = 死区(jsdom 下 usable≤0 无法定义边界,视为全域有效)
    const insideRail = (y) => {
      const u = usable();
      if (u <= 0) return true;
      const ext = railExtent(latestRef.current.messages.length, u);
      return y >= ext.top - 2 && y <= ext.bottom + 2;
    };

    const onPointerMove = (e) => {
      const y = trackYOf(e);
      if (!insideRail(y) && !scrubbingRef.current) {
        // 组外滑动:清掉既有 hover 态,不触发任何效果
        if (fisheyeYRef.current != null) {
          fisheyeYRef.current = null;
          hideSnap();
          styleTicks();
        }
        return;
      }
      fisheyeYRef.current = y;
      const idx = idxAtCursorY(y);
      if (
        pressedRef.current &&
        !scrubbingRef.current &&
        Math.abs(e.clientY - pressYRef.current) > SCRUB_THRESHOLD_PX
      ) {
        scrubbingRef.current = true;
        const count = latestRef.current.messages.length;
        // 冻结位取整:滑动中途起拖时,爬行步进(±1)要落在整数槽位上
        winFrozenRef.current = isWindowed(count, usable())
          ? Math.round(winSRef.current)
          : null;
      }
      if (scrubbingRef.current) {
        scrollToMessageIndex(idx, "auto", { align: "top", settle: false });
        const count = latestRef.current.messages.length;
        if (isWindowed(count, usable())) {
          const th = track.clientHeight;
          setCrawl(y < CRAWL_EDGE_PX ? -1 : y > th - CRAWL_EDGE_PX ? 1 : 0, e.clientY);
        }
        // 扫播中 onScroll 被抑制,这里同步重绘 —— 位置针/高亮/计数跟着拖动走
        showSnap(idx, y);
        paintNow();
        return;
      }
      showSnap(idx, y);
      styleTicks();
    };
    const onPointerLeave = () => {
      if (scrubbingRef.current) return;
      fisheyeYRef.current = null;
      hideSnap();
      styleTicks();
    };
    const onPointerDown = (e) => {
      if (!insideRail(trackYOf(e))) return; // 死区不起拖、不入点击
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
      const wasPressed = pressedRef.current; // 死区 pointerdown 不置 pressed → 松手不算点击
      const y = trackYOf(e);
      const idx = idxAtCursorY(y);
      endScrub();
      if (!wasScrub && wasPressed && insideRail(y)) {
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
      cancelFlash();
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
      const slot = messages.length - 1 - Math.round(winSRef.current);
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
    if (next !== cur) {
      scrollToMessageIndex(next, "smooth");
      return;
    }
    // 死区退化:±1 已到消息边界但视口未到内容边界(深读超屏首/末消息时 pill
    // 仍可见可点,此前静默 no-op = "点了没反应")→ 退化为视口页步进,
    // 与位置针旁的超屏进度 % 指示天然配套;到真实边界后 pill 显隐自然收口。
    if (typeof scrollViewportByPage === "function") {
      scrollViewportByPage(delta);
    }
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
        aria-label="Conversation minimap"
        aria-controls={scrollHostId}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, messages.length - 1)}
        aria-valuenow={Math.max(
          0,
          Math.min(messages.length - 1, safeVisibleStart),
        )}
        aria-valuetext={`Message ${Math.min(
          messages.length,
          safeVisibleStart + 1,
        )} of ${messages.length}`}
        style={{
          position: "absolute",
          right: 8,
          top: INSET_BASE,
          bottom: INSET_BASE,
          width: TRACK_W,
          cursor: "pointer",
          touchAction: "none",
          outline: "none",
        }}
      >
        {Array.from({ length: tickCount }).map((_, k) => (
          <div
            key={k}
            data-mm-tick
            ref={(n) => {
              tickRefs.current[k] = n;
            }}
            style={{
              position: "absolute",
              right: 0, // 右侧齐平,向左生长
              borderRadius: 100,
              background: C.tickDim,
              // 长度/位置零 transition —— hover 即时跟手;只有颜色淡入淡出
              transition: "background .18s ease, opacity .18s ease",
              // live 呼吸光晕的颜色走 CSS var(伪元素无法内联)
              "--pupu-mm-live-halo": C.liveHalo,
            }}
          />
        ))}
      </div>

      <div
        ref={snapRef}
        data-mm-snap
        style={{
          position: "absolute",
          right: STACK_W + 14,
          width: SNAP_W,
          /* palette/attach 家族 chrome:同 command_palette_panel 的面板参数 */
          background: C.snapBg,
          WebkitBackdropFilter: "blur(20px) saturate(130%)",
          backdropFilter: "blur(20px) saturate(130%)",
          border: `1px solid ${C.snapLine}`,
          borderRadius: 14,
          padding: "10px 12px",
          fontSize: 12,
          lineHeight: 1.55,
          boxShadow: C.snapShadow,
          opacity: 0,
          transform: "translateX(6px)",
          pointerEvents: "none",
          transition: `opacity .15s ease, transform .15s ease, top .12s ${EASE}`,
          zIndex: 5,
        }}
      />

      <NavPill nodeRef={topPillRef} edge="top" offset={8} icon={IC_TOP} label={t("chat.minimap.top")} isDark={isDark}
        onClick={() => {
          // 远距离到顶用瞬时落位:长距离 smooth 会被触控板惯性滚轮中断在半路
          // ("底部按 to-top 有时失效"的另一半根因);近距离保留 smooth 的顺滑。
          const far = (viewFirstRef.current < 0 ? safeVisibleStart : viewFirstRef.current) > 8;
          scrollToMessageIndex(0, far ? "auto" : "smooth");
        }} />
      <NavPill nodeRef={upOnePillRef} edge="top" offset={30} icon={IC_PREV} label={t("chat.minimap.prev")} isDark={isDark}
        onClick={() => jumpRelative(-1)} />
      <NavPill nodeRef={downOnePillRef} edge="bottom" offset={30} icon={IC_NEXT} label={t("chat.minimap.next")} isDark={isDark}
        onClick={() => jumpRelative(1)} />
      <NavPill nodeRef={botPillRef} edge="bottom" offset={8} icon={IC_END} label={t("chat.minimap.end")} isDark={isDark}
        onClick={() => {
          if (typeof onBackToBottom === "function") {
            onBackToBottom();
            return;
          }
          const el = messagesRef.current;
          if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
        }} />
    </div>
  );
};

export default MessageMinimap;
