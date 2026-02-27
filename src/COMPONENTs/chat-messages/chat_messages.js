import {
  useRef,
  useEffect,
  useContext,
  useMemo,
  useState,
  useLayoutEffect,
  useCallback,
} from "react";
import ChatBubble from "../chat-bubble/chat_bubble";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  AnimatedOrb — Curl-noise particle flow field rendered as a ·░▒▓ ink-trail character field                                  */
/*  ~440 particles stream along a time-evolving divergence-free vector field (curl of Perlin noise).                           */
/*  Each particle deposits ink that decays per frame, producing flowing luminous streams.                                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const AnimatedOrb = ({ isDark }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container) return;

    /* ── constants ── */
    const CELL = 13; // char grid cell px
    const FONT_SIZE = 10;
    const N_PARTICLES = 440;
    const SPEED = 2.6; // px per frame
    const INK_DEPOSIT = 0.6;
    const INK_DECAY = 0.93; // trail half-life ≈ 10 frames
    const NOISE_SCALE = 0.0036;
    const TIME_SPEED = 0.38; // how fast the field evolves (noise units/s)
    const CHARS = ["\u00b7", "\u2591", "\u2592", "\u2593"];
    const THRESH = [0.055, 0.26, 0.54, 0.78];

    /* ── Perlin noise (classic, 4 gradients) ── */
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const lerp = (a, b, t) => a + (b - a) * t;
    const grad2 = (h, x, y) => {
      switch (h & 3) {
        case 0:
          return x + y;
        case 1:
          return -x + y;
        case 2:
          return x - y;
        default:
          return -x - y;
      }
    };
    /* deterministic permutation table */
    const P = new Uint8Array(512);
    for (let i = 0; i < 256; i++) P[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor((Math.sin(i * 127.1 + 311.7) * 0.5 + 0.5) * (i + 1));
      const tmp = P[i];
      P[i] = P[j & 255];
      P[j & 255] = tmp;
    }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];

    const noise2 = (x, y) => {
      const xi = Math.floor(x) & 255,
        yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x),
        yf = y - Math.floor(y);
      const u = fade(xf),
        v = fade(yf);
      return lerp(
        lerp(
          grad2(P[P[xi] + yi], xf, yf),
          grad2(P[P[xi + 1] + yi], xf - 1, yf),
          u,
        ),
        lerp(
          grad2(P[P[xi] + yi + 1], xf, yf - 1),
          grad2(P[P[xi + 1] + yi + 1], xf - 1, yf - 1),
          u,
        ),
        v,
      );
    };

    /* ── curl of noise field = divergence-free 2D velocity ── */
    /* curl2D(f) = (∂f/∂y, −∂f/∂x)  → particles never bunch or thin out */
    const curlAt = (px, py, tOffset) => {
      const eps = 1.2;
      const s = NOISE_SCALE;
      /* use tOffset as a z-slice through a 3D noise volume */
      const dn_dy =
        (noise2(px * s, (py + eps) * s + tOffset) -
          noise2(px * s, (py - eps) * s + tOffset)) /
        (2 * eps);
      const dn_dx =
        (noise2((px + eps) * s, py * s + tOffset * 0.7) -
          noise2((px - eps) * s, py * s + tOffset * 0.7)) /
        (2 * eps);
      /* normalise → constant speed */
      const vx = dn_dy,
        vy = -dn_dx;
      const mag = Math.sqrt(vx * vx + vy * vy) || 1;
      return { vx: (vx / mag) * SPEED, vy: (vy / mag) * SPEED };
    };

    /* ── state ── */
    let W = 0,
      H = 0,
      COLS = 0,
      ROWS = 0;
    let ctx = null;
    let ink = null;
    let envCache = null;
    let particles = null;
    let tSec = 0; // simulation time in seconds

    const spawnParticle = () => ({
      x: W * (0.05 + Math.random() * 0.9),
      y: H * (0.05 + Math.random() * 0.9),
      life: 90 + Math.random() * 130,
    });

    const buildEnv = () => {
      envCache = new Float32Array(COLS * ROWS);
      const cx = COLS * 0.5,
        cy = ROWS * 0.5;
      const rx = COLS * 0.47,
        ry = ROWS * 0.47;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++) {
          const dx = (c - cx) / rx,
            dy = (r - cy) / ry;
          envCache[r * COLS + c] = Math.max(
            0,
            Math.min(
              1,
              1 -
                Math.pow(Math.max(0, Math.sqrt(dx * dx + dy * dy) - 0.06), 1.9),
            ),
          );
        }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = container.offsetWidth;
      H = container.offsetHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      COLS = Math.ceil(W / CELL);
      ROWS = Math.ceil(H / CELL);
      ink = new Float32Array(COLS * ROWS);
      envCache = null;
      particles = Array.from({ length: N_PARTICLES }, spawnParticle);
    };

    resize();

    const cr = isDark ? 99 : 76;
    const cg = isDark ? 102 : 55;
    const cb = 241;
    const maxAlpha = isDark ? 0.72 : 0.54;

    const DT = 1 / 60;

    const draw = () => {
      if (!ctx || !ink || !W) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      if (!envCache || envCache.length !== COLS * ROWS) buildEnv();

      tSec += DT;
      const tOff = tSec * TIME_SPEED;

      /* 1 — decay ink */
      for (let i = 0; i < ink.length; i++) ink[i] *= INK_DECAY;

      /* 2 — advance particles & stamp ink */
      for (let p = 0; p < particles.length; p++) {
        const pt = particles[p];
        const { vx, vy } = curlAt(pt.x, pt.y, tOff);
        pt.x += vx;
        pt.y += vy;
        pt.life--;

        if (
          pt.life <= 0 ||
          pt.x < -CELL * 2 ||
          pt.x > W + CELL * 2 ||
          pt.y < -CELL * 2 ||
          pt.y > H + CELL * 2
        ) {
          particles[p] = spawnParticle();
          continue;
        }

        /* bilinear splat over 2×2 neighbourhood */
        const gc = pt.x / CELL,
          gr = pt.y / CELL;
        const c0 = Math.floor(gc),
          r0 = Math.floor(gr);
        const fx = gc - c0,
          fy = gr - r0;
        for (let dr = 0; dr <= 1; dr++) {
          for (let dc = 0; dc <= 1; dc++) {
            const cc = c0 + dc,
              rr = r0 + dr;
            if (cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS) {
              const w = (dc === 0 ? 1 - fx : fx) * (dr === 0 ? 1 - fy : fy);
              ink[rr * COLS + cc] = Math.min(
                1,
                ink[rr * COLS + cc] + INK_DEPOSIT * w,
              );
            }
          }
        }
      }

      /* 3 — render character grid */
      ctx.clearRect(0, 0, W, H);
      ctx.font = `${FONT_SIZE}px "Courier New", Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (let row = 0; row < ROWS; row++) {
        const py = row * CELL + CELL / 2;
        for (let col = 0; col < COLS; col++) {
          const iv = ink[row * COLS + col];
          if (iv < THRESH[0]) continue;
          const env = envCache[row * COLS + col];
          if (env < 0.02) continue;

          let ci = 0;
          for (let ti = THRESH.length - 1; ti >= 0; ti--)
            if (iv >= THRESH[ti]) {
              ci = ti;
              break;
            }

          const alpha = iv * env * maxAlpha;
          if (alpha < 0.012) continue;

          ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(2)})`;
          ctx.fillText(CHARS[ci], col * CELL + CELL / 2, py);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    const ro = new ResizeObserver(resize);
    ro.observe(container);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [isDark]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", pointerEvents: "none" }}
      />
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  EmptyChat — shown when there are no messages                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const EmptyChat = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
        userSelect: "none",
        pointerEvents: "none",
        padding: "0 0 72px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {/* Ambient glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isDark
            ? "radial-gradient(ellipse 72% 52% at 50% 28%, rgba(99,102,241,0.09) 0%, transparent 68%)"
            : "radial-gradient(ellipse 72% 52% at 50% 28%, rgba(99,102,241,0.055) 0%, transparent 68%)",
          pointerEvents: "none",
        }}
      />
      {/* Character-field background — absolute, fills whole empty area */}
      <AnimatedOrb isDark={isDark} />
      <div
        style={{
          fontSize: 27,
          fontFamily: "Jost, sans-serif",
          fontWeight: 700,
          letterSpacing: "-0.3px",
          margin: "0 0 10px",
          textAlign: "center",
          color: isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)",
          position: "relative",
          zIndex: 1,
        }}
      >
        How can I help you today?
      </div>
      <div
        style={{
          fontSize: 13.5,
          fontFamily: theme?.font?.fontFamily || "inherit",
          fontWeight: 400,
          letterSpacing: "0.1px",
          textAlign: "center",
          color: isDark ? "rgba(255,255,255,0.36)" : "rgba(0,0,0,0.36)",
          position: "relative",
          zIndex: 1,
        }}
      >
        Local AI &nbsp;·&nbsp; Fast &nbsp;·&nbsp; Private &nbsp;·&nbsp; Runs
        entirely on your device
      </div>
    </div>
  );
};

const BOTTOM_FOLLOW_THRESHOLD = 24;
const PREVIOUS_MESSAGE_EPSILON = 6;

const ChatMessages = ({
  chatId,
  messages = [],
  isStreaming = false,
  onDeleteMessage,
  onResendMessage,
  onEditMessage,
  className = "scrollable",
  initialVisibleCount = 12,
  loadBatchSize = 6,
  topLoadThreshold = 80,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const messagesRef = useRef(null);
  const messageNodeRefs = useRef(new Map());
  const lastScrollTopRef = useRef(0);
  const visibleStartRef = useRef(
    Math.max(0, messages.length - initialVisibleCount),
  );
  const prependCompensationRef = useRef(null);
  const pendingScrollToBottomRef = useRef("auto");
  const pendingJumpActionRef = useRef(null);
  const activeChatIdRef = useRef(chatId);
  const [visibleStartIndex, setVisibleStartIndex] = useState(() =>
    Math.max(0, messages.length - initialVisibleCount),
  );
  const [isAtBottom, setIsAtBottom] = useState(true);

  const safeVisibleStart = Math.max(
    0,
    Math.min(visibleStartIndex, messages.length),
  );
  const visibleMessages = useMemo(
    () => messages.slice(safeVisibleStart),
    [messages, safeVisibleStart],
  );

  const updateIsAtBottom = useCallback((el) => {
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsAtBottom(distance <= BOTTOM_FOLLOW_THRESHOLD);
  }, []);

  const loadOlderMessages = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    setVisibleStartIndex((previous) => {
      if (previous <= 0) {
        return 0;
      }
      const next = Math.max(0, previous - loadBatchSize);
      if (next === previous) {
        return previous;
      }

      prependCompensationRef.current = {
        previousScrollHeight: el.scrollHeight,
        previousScrollTop: el.scrollTop,
      };
      visibleStartRef.current = next;
      return next;
    });
  }, [loadBatchSize]);

  const handleScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    const currentScrollTop = el.scrollTop;
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current - 0.5;
    lastScrollTopRef.current = currentScrollTop;

    updateIsAtBottom(el);

    if (
      currentScrollTop <= topLoadThreshold &&
      isScrollingUp &&
      visibleStartRef.current > 0 &&
      !prependCompensationRef.current
    ) {
      loadOlderMessages();
    }
  }, [loadOlderMessages, topLoadThreshold, updateIsAtBottom]);

  const scrollToBottom = useCallback((behavior = "auto") => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    el.scrollTo({ top: el.scrollHeight, behavior });
    lastScrollTopRef.current = el.scrollHeight;
    setIsAtBottom(true);
  }, []);

  const scrollToTop = useCallback(
    (behavior = "smooth") => {
      const el = messagesRef.current;
      if (!el) {
        return;
      }
      el.scrollTo({ top: 0, behavior });
      lastScrollTopRef.current = 0;
      updateIsAtBottom(el);
    },
    [updateIsAtBottom],
  );

  const getSortedRenderedEntries = useCallback(() => {
    return [...messageNodeRefs.current.entries()]
      .filter(([, node]) => node)
      .sort((a, b) => a[0] - b[0]);
  }, []);

  const jumpToPreviousRenderedMessage = useCallback(
    (behavior = "smooth") => {
      const el = messagesRef.current;
      if (!el) {
        return false;
      }

      const thresholdTop = el.scrollTop - PREVIOUS_MESSAGE_EPSILON;
      let previousNode = null;

      for (const [, node] of getSortedRenderedEntries()) {
        if (node.offsetTop < thresholdTop) {
          previousNode = node;
          continue;
        }
        break;
      }

      if (!previousNode) {
        return false;
      }

      el.scrollTo({
        top: Math.max(0, previousNode.offsetTop - 12),
        behavior,
      });
      updateIsAtBottom(el);
      return true;
    },
    [getSortedRenderedEntries, updateIsAtBottom],
  );

  const handleBackToBottom = useCallback(() => {
    const nextStart = Math.max(0, messages.length - initialVisibleCount);
    const shouldAdjustWindow = nextStart !== visibleStartRef.current;
    visibleStartRef.current = nextStart;
    if (shouldAdjustWindow) {
      pendingScrollToBottomRef.current = "auto";
      setVisibleStartIndex(nextStart);
      return;
    }

    scrollToBottom("auto");
  }, [initialVisibleCount, messages.length, scrollToBottom]);

  const handleSkipToTop = useCallback(() => {
    pendingJumpActionRef.current = null;
    const shouldExpandWindow = visibleStartRef.current !== 0;
    visibleStartRef.current = 0;

    if (shouldExpandWindow) {
      pendingJumpActionRef.current = { type: "top", behavior: "smooth" };
      setVisibleStartIndex(0);
      return;
    }

    scrollToTop("smooth");
  }, [scrollToTop]);

  const handleJumpToPreviousMessage = useCallback(() => {
    if (jumpToPreviousRenderedMessage("smooth")) {
      return;
    }

    if (visibleStartRef.current > 0) {
      pendingJumpActionRef.current = { type: "previous", behavior: "smooth" };
      loadOlderMessages();
      return;
    }

    scrollToTop("smooth");
  }, [jumpToPreviousRenderedMessage, loadOlderMessages, scrollToTop]);

  useEffect(() => {
    visibleStartRef.current = visibleStartIndex;
  }, [visibleStartIndex]);

  useEffect(() => {
    if (activeChatIdRef.current === chatId) {
      return;
    }

    activeChatIdRef.current = chatId;
    lastScrollTopRef.current = 0;
    const nextStart = Math.max(0, messages.length - initialVisibleCount);
    visibleStartRef.current = nextStart;
    setVisibleStartIndex(nextStart);
    setIsAtBottom(true);
    pendingScrollToBottomRef.current = "auto";
  }, [chatId, initialVisibleCount, messages.length]);

  useEffect(() => {
    if (messages.length > 0) {
      return;
    }

    visibleStartRef.current = 0;
    lastScrollTopRef.current = 0;
    setVisibleStartIndex(0);
    setIsAtBottom(true);
    pendingScrollToBottomRef.current = "auto";
  }, [messages.length]);

  useLayoutEffect(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    if (prependCompensationRef.current) {
      if (isAtBottom) {
        scrollToBottom("auto");
      } else {
        const { previousScrollHeight, previousScrollTop } =
          prependCompensationRef.current;
        const delta = el.scrollHeight - previousScrollHeight;
        el.scrollTop = previousScrollTop + delta;
        lastScrollTopRef.current = el.scrollTop;
      }
      prependCompensationRef.current = null;
      updateIsAtBottom(el);
    }

    const pendingAction = pendingJumpActionRef.current;
    if (!pendingAction) {
      return;
    }

    if (pendingAction.type === "top") {
      pendingJumpActionRef.current = null;
      scrollToTop(pendingAction.behavior || "smooth");
      return;
    }

    if (pendingAction.type === "previous") {
      const jumped = jumpToPreviousRenderedMessage(
        pendingAction.behavior || "smooth",
      );
      if (jumped) {
        pendingJumpActionRef.current = null;
        return;
      }

      if (visibleStartRef.current > 0) {
        loadOlderMessages();
        return;
      }

      pendingJumpActionRef.current = null;
      scrollToTop(pendingAction.behavior || "smooth");
    }
  }, [
    isAtBottom,
    jumpToPreviousRenderedMessage,
    loadOlderMessages,
    safeVisibleStart,
    scrollToBottom,
    scrollToTop,
    updateIsAtBottom,
  ]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) {
      return;
    }

    if (pendingScrollToBottomRef.current) {
      scrollToBottom(pendingScrollToBottomRef.current);
      pendingScrollToBottomRef.current = null;
      return;
    }

    if (isAtBottom) {
      scrollToBottom(isStreaming ? "auto" : "smooth");
    }
  }, [isAtBottom, isStreaming, messages, scrollToBottom, safeVisibleStart]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el || prependCompensationRef.current || messages.length === 0) {
      return;
    }

    if (
      visibleStartRef.current > 0 &&
      el.scrollHeight <= el.clientHeight + topLoadThreshold
    ) {
      loadOlderMessages();
    }
  }, [loadOlderMessages, messages, safeVisibleStart, topLoadThreshold]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
      <div
        ref={messagesRef}
        className={className}
        onScroll={handleScroll}
        style={{
          height: "100%",
          overflowY: "auto",
          padding: messages.length === 0 ? "0" : "20px 0 8px",
          position: "relative",
          boxSizing: "border-box",
          scrollBehavior: "auto",
        }}
      >
        {messages.length === 0 ? (
          <EmptyChat />
        ) : (
          <div
            style={{
              width: "100%",
              minHeight: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 20,
            }}
          >
            {visibleMessages.map((msg, index) => {
              const messageIndex = safeVisibleStart + index;
              return (
                <div
                  key={msg.id}
                  ref={(node) => {
                    if (node) {
                      messageNodeRefs.current.set(messageIndex, node);
                    } else {
                      messageNodeRefs.current.delete(messageIndex);
                    }
                  }}
                  style={{
                    width: "100%",
                    maxWidth: 680,
                    margin: "0 auto",
                    padding: "0 20px",
                    boxSizing: "border-box",
                  }}
                >
                  <ChatBubble
                    message={msg}
                    onDeleteMessage={onDeleteMessage}
                    onResendMessage={onResendMessage}
                    onEditMessage={onEditMessage}
                    disableActionButtons={isStreaming}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div
          style={{
            position: "absolute",
            // Align to chat input's right edge and keep a visible gap above input.
            right: "max(20px, calc(50% - 370px))",
            // Match the attach panel's floated distance to the input edge (padding=12).
            bottom: 12,
            zIndex: 2,
            opacity: !isAtBottom ? 1 : 0,
            transform: !isAtBottom ? "translateY(0)" : "translateY(8px)",
            transition:
              "opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
            pointerEvents: !isAtBottom ? "auto" : "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              padding: "3px",
              borderRadius: 16,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.05)",
              boxShadow: isDark
                ? "0 4px 24px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16)"
                : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
              transition: "background-color 0.22s ease, box-shadow 0.22s ease",
              backdropFilter: "blur(6px)",
            }}
          >
            <Button
              prefix_icon="skip_up"
              onClick={handleSkipToTop}
              style={{
                color,
                fontSize: 12,
                iconSize: 12,
                borderRadius: 14,
                paddingVertical: 6,
                paddingHorizontal: 6,
              }}
            />
            <Button
              prefix_icon="arrow_up"
              onClick={handleJumpToPreviousMessage}
              style={{
                color,
                fontSize: 12,
                iconSize: 12,
                borderRadius: 14,
                paddingVertical: 6,
                paddingHorizontal: 6,
              }}
            />
            <Button
              prefix_icon="skip_down"
              onClick={handleBackToBottom}
              style={{
                color,
                fontSize: 12,
                iconSize: 12,
                borderRadius: 14,
                paddingVertical: 6,
                paddingHorizontal: 6,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatMessages;
