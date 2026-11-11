import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Tooltip from "../../BUILTIN_COMPONENTs/tooltip/tooltip";

/* Each crumb is an arrow-shaped block: square on its left when it opens the
   trail, notched when a crumb comes before it; pointed on its right when a
   crumb follows, square when it ends the trail. Neighbours nest, the point
   of one in the notch of the next. */
const HEIGHT = 26;
/* The angle at the tip of a point (and at the bottom of a notch): a little
   blunter than a right angle. */
const TIP_ANGLE = 110;
/* How far a point sticks out / a notch cuts in for that angle. */
const depthFor = (height) => height / 2 / Math.tan(((TIP_ANGLE / 2) * Math.PI) / 180);
const DEPTH = depthFor(HEIGHT);
const GAP = 3; // between a point and the notch it sits in
const ICON = 16;
const HOVER_ONLY = ["hover"];
/* Button's own pressed inset. */
const PRESSED_INSET = 2;
/* The resting block every crumb sits on, so the trail reads as one: a
   crumb that leads somewhere a little stronger, where you are the quiet
   one. The hover block grows in over it, like a Button's. */
export const CRUMB_REST_ALPHA = Object.freeze({ link: 0.08, current: 0.035 });

/* Corner radii, per kind of corner, so they read alike: a square corner, the
   sharp corners on either side of a notch, and the blunt ones (the tip of a
   point, the bottom of a notch). A single round-joined stroke made the sharp
   ones look heavy and the blunt ones look square. */
/* The notch's inner corner is cut into the block, so the same radius reads
   smaller there than on a corner that sticks out: it gets more. */
const RADIUS = { square: 4, sharp: 1.5, blunt: 6, notch: 6 };

/* A polygon with each vertex filleted: cut back along both edges by the
   tangent length for its radius, and joined with a curve through the
   vertex. */
const roundedPolygon = (points) => {
  const n = points.length;
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const [x, y, radius] = points[i];
    const [px, py] = points[(i - 1 + n) % n];
    const [nx, ny] = points[(i + 1) % n];
    const ax = px - x;
    const ay = py - y;
    const bx = nx - x;
    const by = ny - y;
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    const angle = Math.acos(
      Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))),
    );
    const cut = Math.min(radius / Math.tan(angle / 2), la / 2, lb / 2);
    const fmt = (v) => Math.round(v * 100) / 100;
    const sx = fmt(x + (ax / la) * cut);
    const sy = fmt(y + (ay / la) * cut);
    const ex = fmt(x + (bx / lb) * cut);
    const ey = fmt(y + (by / lb) * cut);
    parts.push(`${i === 0 ? "M" : "L"}${sx} ${sy}`, `Q${fmt(x)} ${fmt(y)} ${ex} ${ey}`);
  }
  return `${parts.join(" ")} Z`;
};

/* `point` is true/false, or how far grown in, 0 to 1, while a square end
   turns into a point or back: the tip comes out from the middle of the
   flat edge. */
export const crumbPath = (width, { notch, point, height = HEIGHT }) => {
  const mid = height / 2;
  const depth = depthFor(height);
  const amount = point === true ? 1 : Math.max(0, Math.min(1, Number(point) || 0));
  const shoulder = width - depth * amount;
  const leftCorner = notch ? RADIUS.sharp : RADIUS.square;
  const rightCorner = RADIUS.square;
  const points = [
    [0, 0, leftCorner],
    [shoulder, 0, rightCorner],
    ...(amount > 0 ? [[width, mid, RADIUS.blunt]] : []),
    [shoulder, height, rightCorner],
    [0, height, leftCorner],
    ...(notch ? [[depth, mid, RADIUS.notch]] : []),
  ];
  return roundedPolygon(points);
};

/**
 * The arrow-shaped hover block, behaving like a plain Button's: nothing at
 * rest, grows in from the centre on hover, tightens and darkens while
 * pressed. Same colours and timing as Button, from the theme.
 */
export function ArrowHoverShape({ width, height, notch, point, hovered, pressed, isDark, testId }) {
  const { theme } = useContext(ConfigContext) || {};
  const bg = theme?.button?.background || {};
  const hoverColor = bg.hoverBackgroundColor || (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)");
  const activeColor = bg.activeBackgroundColor || (isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)");
  const shown = hovered || pressed;
  if (!(width > 0 && height > 0)) return null;
  return (
    <svg
      aria-hidden="true"
      data-testid={testId}
      data-shown={shown ? "true" : "false"}
      width={width}
      height={height}
      style={{
        position: "absolute",
        inset: 0,
        transformOrigin: "center",
        /* Pressed, it pulls in 2px on every side, as a Button's block
           does: a fixed inset, not a ratio, so a wide entry tightens as
           visibly as a small crumb. */
        transform: pressed
          ? `scale(${1 - (2 * PRESSED_INSET) / width}, ${1 - (2 * PRESSED_INSET) / height})`
          : shown
            ? "scale(1)"
            : "scale(0.5, 0)",
        opacity: shown ? 1 : 0,
        transition: shown
          ? "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.0), opacity 0.18s ease"
          : "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease",
        pointerEvents: "none",
      }}
    >
      <path
        d={crumbPath(width, { notch, point, height })}
        fill={pressed ? activeColor : hoverColor}
        style={{ transition: "fill 0.15s ease" }}
      />
    </svg>
  );
}

/* A crumb that joins the trail slides in from the right while it fades in,
   and snaps onto the one before it like a magnet: the curve overshoots a
   touch and settles. One that leaves goes back the way it came. */
const ENTER_FROM = 18;
export const CRUMB_MOTION = Object.freeze({
  enter:
    "transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease-out",
  exit: "transform 0.18s cubic-bezier(0.4, 0, 1, 1), opacity 0.16s ease-in",
  exitMs: 180,
});

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* What is drawn: the trail as it is, plus any crumb still on its way out,
   kept in the place it left. */
const useTrailPresence = (crumbs) => {
  const [leaving, setLeaving] = useState([]);
  const [entering, setEntering] = useState(() => new Set());
  const previous = useRef(crumbs);
  const mounted = useRef(false);

  /* Keyed on the trail itself, not on the array: a parent may hand over a
     fresh array with the same crumbs on every render. */
  const trail = crumbs.map((crumb) => crumb.key).join("/");
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = crumbs;
    if (!mounted.current) {
      /* What is there on first paint is simply there. */
      mounted.current = true;
      return;
    }
    const keys = new Set(crumbs.map((crumb) => crumb.key));
    const oldKeys = new Set(before.map((crumb) => crumb.key));
    const gone = before
      .map((crumb, index) => ({ crumb, index }))
      .filter(({ crumb }) => !keys.has(crumb.key));
    const added = crumbs.filter((crumb) => !oldKeys.has(crumb.key)).map((crumb) => crumb.key);
    if (prefersReducedMotion()) return;
    /* A crumb that comes back while still leaving just comes back. */
    setLeaving((prev) => [
      ...prev.filter((item) => !keys.has(item.crumb.key)),
      ...gone.filter(({ crumb }) => !prev.some((item) => item.crumb.key === crumb.key)),
    ]);
    if (added.length) setEntering(new Set(added));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trail]);

  /* Entering crumbs are drawn once where they start, then let go. */
  useEffect(() => {
    if (!entering.size) return undefined;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setEntering(new Set()));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [entering]);

  useEffect(() => {
    if (!leaving.length) return undefined;
    const timer = setTimeout(() => setLeaving([]), CRUMB_MOTION.exitMs);
    return () => clearTimeout(timer);
  }, [leaving]);

  const drawn = crumbs.map((crumb) => ({
    crumb,
    phase: entering.has(crumb.key) ? "enter" : "idle",
  }));
  leaving
    .slice()
    .sort((a, b) => a.index - b.index)
    .forEach(({ crumb, index }) => {
      drawn.splice(Math.min(index, drawn.length), 0, { crumb, phase: "exit" });
    });
  return drawn;
};

/**
 * Where the side menu is, always on its first line, above the search field:
 * Home on the chat list, Home › Agents in the Agents pane. Every crumb
 * names itself in a tooltip (on hover only: a click must not pin it); only
 * the ones that lead somewhere react to the pointer.
 *
 * crumbs: [{ key, icon, label, onClick? }] — the last one is where you are.
 */
export default function SideMenuBreadcrumb({ crumbs, isDark }) {
  const drawn = useTrailPresence(crumbs);
  const lastKey = crumbs.length ? crumbs[crumbs.length - 1].key : null;
  return (
    <nav
      data-testid="side-menu-breadcrumb"
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        height: HEIGHT,
        flexShrink: 0,
        WebkitAppRegion: "no-drag",
      }}
    >
      {drawn.map(({ crumb, phase }, index) => {
        const away = phase !== "idle";
        const leavingNow = phase === "exit";
        return (
          <div
            key={crumb.key}
            data-testid={`side-menu-crumb-${crumb.key}-slot`}
            data-phase={phase}
            aria-hidden={leavingNow ? true : undefined}
            style={{
              display: "flex",
              marginLeft: index > 0 ? GAP - DEPTH : 0,
              /* Later crumbs sit under earlier ones, so one sliding in
                 tucks its notch under the point it snaps onto. */
              position: "relative",
              zIndex: drawn.length - index,
              transform: away ? `translateX(${ENTER_FROM}px)` : "translateX(0)",
              opacity: away ? 0 : 1,
              transition:
                phase === "enter" ? "none" : leavingNow ? CRUMB_MOTION.exit : CRUMB_MOTION.enter,
              pointerEvents: leavingNow ? "none" : undefined,
            }}
          >
            <Tooltip
              label={crumb.label}
              position="bottom"
              trigger={HOVER_ONLY}
              /* Gone as the pointer leaves: no grace period to cross into it. */
              close_delay={0}
              style={{ whiteSpace: "nowrap" }}
            >
              <Crumb
                crumb={crumb}
                notch={index > 0}
                /* Whether a crumb follows in the trail as it now is, so the
                   one before a leaving crumb squares off as it goes. */
                point={
                  leavingNow
                    ? index < drawn.length - 1
                    : crumbs.findIndex((c) => c.key === crumb.key) < crumbs.length - 1
                }
                current={leavingNow || crumb.key === lastKey}
                isDark={isDark}
              />
            </Tooltip>
          </div>
        );
      })}
    </nav>
  );
}

/* A square end turning into a point (a crumb joined after it) or back (the
   one after it left): the tip grows out of the flat edge, in step with the
   crumb sliding in or out. */
export const POINT_MORPH_MS = 260;
const usePointAmount = (point) => {
  const target = point ? 1 : 0;
  const [amount, setAmount] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) return undefined;
    if (prefersReducedMotion()) {
      current.current = target;
      setAmount(target);
      return undefined;
    }
    let frame = 0;
    let start = null;
    const step = (now) => {
      if (start === null) start = now;
      const k = Math.min(1, (now - start) / POINT_MORPH_MS);
      const eased = 1 - (1 - k) ** 3;
      const value = from + (target - from) * eased;
      current.current = value;
      setAmount(value);
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return amount;
};

function Crumb({ crumb, notch, point: pointed, current, isDark }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const point = usePointAmount(pointed);
  const interactive = !current && typeof crumb.onClick === "function";
  const fg = isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)";
  const padLeft = notch ? DEPTH + 4 : 6;
  const padRight = 6 + (DEPTH - 2) * point;
  const width = padLeft + ICON + padRight;
  return (
    <button
      type="button"
      data-testid={`side-menu-crumb-${crumb.key}`}
      data-notch={notch ? "true" : "false"}
      data-point={pointed ? "true" : "false"}
      aria-label={crumb.label}
      aria-current={current ? "page" : undefined}
      /* Not `disabled`: a disabled button swallows the hover that shows its
         tooltip. */
      aria-disabled={interactive ? undefined : true}
      tabIndex={interactive ? undefined : -1}
      onClick={interactive ? crumb.onClick : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        width,
        height: HEIGHT,
        padding: `0 ${padRight}px 0 ${padLeft}px`,
        border: "none",
        background: "transparent",
        color: fg,
        cursor: interactive ? "pointer" : "default",
        WebkitAppRegion: "no-drag",
      }}
    >
      <svg
        aria-hidden="true"
        data-testid={`side-menu-crumb-${crumb.key}-rest`}
        width={width}
        height={HEIGHT}
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <path
          d={crumbPath(width, { notch, point })}
          fill={`rgba(${isDark ? "255,255,255" : "0,0,0"},${
            interactive ? CRUMB_REST_ALPHA.link : CRUMB_REST_ALPHA.current
          })`}
        />
      </svg>
      {/* On top, like any button: only one that leads somewhere, and only
          under the pointer. Where you are never reacts. */}
      {interactive && (
        <ArrowHoverShape
          width={width}
          height={HEIGHT}
          notch={notch}
          point={point}
          hovered={hovered}
          pressed={pressed}
          isDark={isDark}
          testId={`side-menu-crumb-${crumb.key}-shape`}
        />
      )}
      <Icon
        src={crumb.icon}
        color={fg}
        style={{
          position: "relative",
          width: ICON,
          height: ICON,
          /* Where you are is the quiet one. */
          opacity: interactive ? (hovered ? 1 : 0.85) : 0.4,
          transition: "opacity 0.15s ease",
        }}
      />
    </button>
  );
}
