import { Fragment, forwardRef, useContext, useId, useCallback, useLayoutEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { parseSurfaceColor, THRESHOLDS } from "./surface_composite";

// Dither shadow alpha using the surrounding surface colour as a contrast
// estimate. The independent SVG is cacheable: no per-frame backdrop capture.
const ZERO_RGB = "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0";

export function parseResolvedShadows(value) {
  if (!value || value === "none") return [];
  if (typeof value !== "string") return null;
  const layers = value.match(/(?:[^,()]|\([^()]*\))+/g);
  if (!layers) return null;
  const result = [];
  for (const raw of layers) {
    const color = raw.match(/(?:rgba?|color)\([^()]*\)/)?.[0];
    const rgba = parseSurfaceColor(color);
    const inset = /\binset\b/.test(raw);
    const lengths = raw.replace(color || "", "").replace(/\binset\b/, "").trim().split(/\s+/);
    if (!rgba || lengths.length < 2 || lengths.length > 4 ||
        !lengths.every(v => /^-?(?:\d*\.)?\d+(?:px)?$/.test(v))) return null;
    const [x, y, blur = 0, spread = 0] = lengths.map(parseFloat);
    if (blur < 0 || ![x, y, blur, spread].every(Number.isFinite)) return null;
    result.push({ x, y, blur, spread, rgba, inset, raw: raw.trim() });
  }
  return result;
}

function shapeImage(width, height, pad, radius, spread = 0, path = "", ratio = 1) {
  const w = Math.max(0, width + 2 * spread), h = Math.max(0, height + 2 * spread);
  const [rx, ry] = radius.map((r, i) => Math.max(0, Math.min(r + spread, (i ? h : w) / 2)));
  const shape = path ? `<path d="${path}" transform="translate(${pad} ${pad})" fill="white"/>` : `<rect x="${pad - spread}" y="${pad - spread}" width="${w}" height="${h}" rx="${rx}" ry="${ry}" fill="white"/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${(width + 2 * pad) * ratio}" height="${(height + 2 * pad) * ratio}" viewBox="0 0 ${width + 2 * pad} ${height + 2 * pad}">${shape}</svg>`)}`;
}

// The follower SVG is a separate box. Anchor positioning keeps its place in
// step with the host's layout box, but nothing else about it can follow a
// moving host in the same frame: its shape is measured and re-rendered through
// React (a frame or more late), anchor() ignores the host's own transform, and
// copying the host's transition onto it only eases the already-eased anchor
// values a second time, so it trails. A host that animates anything the shadow
// depends on therefore keeps its native box-shadow, painted with the element.
// Only properties that cannot move, size, fade or re-shape the shadow may
// transition under a follower.
const SHADOW_NEUTRAL_PROPERTY = /^(?:color|background(?:-color|-image|-position|-size|-repeat)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color|outline-(?:color|offset|style|width)|outline|fill|stroke|caret-color|text-decoration-color|text-emphasis-color|column-rule-color|accent-color|(?:-webkit-)?backdrop-filter|visibility|cursor)$/;
const EASING_KEYWORD = /^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|normal|allow-discrete)$/;

function splitList(value) {
  return String(value).match(/(?:[^,()]|\([^()]*\))+/g) || [];
}

function seconds(value) {
  const match = /^(-?(?:\d*\.)?\d+)(ms|s)$/.exec(value);
  return match ? parseFloat(match[1]) / (match[2] === "ms" ? 1000 : 1) : null;
}

/** True when a CSS `transition` shorthand animates something the shadow
 * follows (geometry, transform, opacity, the shadow itself, or `all`). */
export function transitionMovesShadow(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return splitList(value).some((item) => {
    const tokens = item.trim().toLowerCase().replace(/[a-z-]+\([^()]*\)/g, "").split(/\s+/).filter(Boolean);
    if (!tokens.length || (tokens.length === 1 && tokens[0] === "none")) return false;
    const times = tokens.map(seconds).filter(t => t !== null);
    const duration = times[0] ?? 0;
    const delay = times[1] ?? 0;
    if (duration <= 0 && delay <= 0) return false;
    const property = tokens.find(t => seconds(t) === null && !EASING_KEYWORD.test(t)) || "all";
    return property !== "none" && !SHADOW_NEUTRAL_PROPERTY.test(property);
  });
}

function animationMoves(value) {
  return typeof value === "string" && !!value.trim() && !/^\s*none\b/.test(value);
}

/** The same test on resolved longhands (class-driven transitions). */
function computedMotion(computed) {
  if (animationMoves(computed.animationName)) return true;
  const properties = splitList(computed.transitionProperty || "").map(v => v.trim().toLowerCase());
  const durations = splitList(computed.transitionDuration || "").map(v => seconds(v.trim()) ?? 0);
  const delays = splitList(computed.transitionDelay || "").map(v => seconds(v.trim()) ?? 0);
  return properties.some((property, i) => property !== "none" && !SHADOW_NEUTRAL_PROPERTY.test(property) &&
    ((durations.length ? durations[i % durations.length] : 0) > 0 || (delays.length ? delays[i % delays.length] : 0) > 0));
}

function supported() {
  return typeof navigator !== "undefined" && /(?:Chrome|Chromium)\//.test(navigator.userAgent) &&
    typeof CSS !== "undefined" && CSS.supports("anchor-name", "--shadow") &&
    CSS.supports("backdrop-filter", "url(#shadow)");
}

/** A native element with an independent, inert shadow sibling. No layout wrapper,
 * content filter, pointer target, or new backdrop root is added around children.
 * shadowShape is reserved for an SVG path with a native drop-shadow fallback.
 * Unsupported engines/shapes keep the original native box-shadow.
 */
const ShadowSurface = forwardRef(function ShadowSurface({ as: Tag = "div", style, children, shadowShape, ...props }, forwardedRef) {
  const { onThemeMode, theme } = useContext(ConfigContext) || {};
  const id = `shadow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const element = useRef(null);
  const [paint, setPaint] = useState(null);
  const shadow = shadowShape?.shadow ?? style?.boxShadow;
  const path = shadowShape?.path || "";
  // A host whose own style animates the shadow's box keeps its native shadow
  // from the first frame: no follower is ever mounted to trail it.
  const moving = transitionMovesShadow(style?.transition) || animationMoves(style?.animation) || animationMoves(style?.animationName);
  const eligible = supported() && typeof shadow === "string" && !!shadow && shadow !== "none" && (!style?.filter || !!path) && !style?.anchorName && !moving;
  const follower = useRef(null);
  const painted = useRef(null);
  // A stable callback follows native host replacement without resetting the
  // caller's ref whenever shadow paint state changes.
  const attachElement = useCallback((node) => {
    element.current = node;
    if (typeof forwardedRef === "function") {
      const cleanup = forwardedRef(node);
      if (typeof cleanup === "function") return () => {
        element.current = null;
        cleanup();
      };
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  }, [forwardedRef]);

  useLayoutEffect(() => {
    if (!eligible || !element.current) return undefined;
    const node = element.current;
    let resolved;
    // Elements (the host or an ancestor) running a transition or animation
    // that can move or resize the host. While any runs, the native shadow
    // paints, because only it is drawn with the element in the same frame.
    const running = new Set();
    // Hand the shadow back to the host synchronously, inside the same frame
    // as the change that invalidated the follower (transitionrun, a
    // ResizeObserver delivery or a style mutation all run before paint).
    // React then re-renders to the same state.
    const handOff = () => {
      if (!painted.current) return;
      node.style.boxShadow = shadow;
      if (path) node.style.filter = style?.filter ?? "";
      if (follower.current) follower.current.style.display = "none";
      painted.current = null;
    };
    const read = (refresh = true) => {
      if (refresh || !resolved) {
        // Resolve the target shadow on an inert probe. Writing the owner's
        // shadow here would restart its box-shadow/size transitions.
        const computed = getComputedStyle(node);
        const probe = document.createElement("span");
        probe.style.cssText = "all:initial;position:fixed;visibility:hidden;pointer-events:none;width:0;height:0";
        probe.style.color = computed.color;
        probe.style.fontSize = computed.fontSize;
        for (const variable of shadow.match(/--[a-zA-Z0-9_-]+/g) || [])
          probe.style.setProperty(variable, computed.getPropertyValue(variable));
        probe.style.boxShadow = shadow;
        document.body.appendChild(probe);
        const shadows = parseResolvedShadows(getComputedStyle(probe).boxShadow);
        probe.remove();
        const radii = [computed.borderTopLeftRadius, computed.borderTopRightRadius,
          computed.borderBottomRightRadius, computed.borderBottomLeftRadius];
        resolved = { shadows, radius: radii.every(r => r === radii[0]) ? radii[0] : null };
      }
      const { shadows } = resolved;
      const rect = node.getBoundingClientRect();
      const lengths = resolved.radius?.split(" ");
      const radius = lengths?.every(r => /^\d+(?:\.\d+)?(?:px|%)$/.test(r)) ?
        [lengths[0], lengths[1] || lengths[0]].map((r, i) => parseFloat(r) * (r.endsWith("%") ? (i ? rect.height : rect.width) / 100 : 1)) : null;
      let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
      let stable = true;
      const background = [0, 0, 0, 0];
      for (let parent = node; parent; parent = parent.parentElement) {
        const computed = getComputedStyle(parent);
        const matrix = computed.transform && computed.transform !== "none" ? new DOMMatrix(computed.transform) : null;
        if (Number(computed.opacity) < 1 || (matrix && (!matrix.is2D || matrix.a !== 1 || matrix.d !== 1 || matrix.b !== 0 || matrix.c !== 0))) stable = false;
        if (parent === node) {
          // anchor() places the follower at the host's untransformed layout
          // box, so any own transform (even a translate) would leave it behind.
          if (matrix || [computed.translate, computed.scale, computed.rotate].some(v => v && v !== "none") ||
              computedMotion(computed)) stable = false;
          continue;
        }
        // Estimate contrast without capturing pixels. Average gradient stops
        // so a dark theme's brighter artwork doesn't receive excessive alpha noise.
        let color = parseSurfaceColor(computed.backgroundColor);
        const stops = /gradient\(/.test(computed.backgroundImage || "") ?
          computed.backgroundImage.match(/(?:rgba?|color)\([^()]*\)/g)?.map(parseSurfaceColor) : null;
        if (stops?.length && stops.every(Boolean)) {
          const average = [0, 1, 2, 3].map(i => stops.reduce((sum, stop) => sum + stop[i], 0) / stops.length);
          const underneath = color || [0, 0, 0, 0];
          const alpha = average[3] + underneath[3] * (1 - average[3]);
          color = [...average.slice(0, 3).map((c, i) => alpha ?
            (c * average[3] + underneath[i] * underneath[3] * (1 - average[3])) / alpha : 0), alpha];
        }
        if (color) {
          const alpha = (1 - background[3]) * color[3];
          for (let i = 0; i < 3; i++) background[i] += color[i] * alpha;
          background[3] += alpha;
        }
        if (computed.overflowX !== "visible" || computed.overflowY !== "visible") {
          const bounds = parent.getBoundingClientRect();
          if (computed.overflowX !== "visible") { left = Math.max(left, bounds.left + parent.clientLeft); right = Math.min(right, bounds.left + parent.clientLeft + parent.clientWidth); }
          if (computed.overflowY !== "visible") { top = Math.max(top, bounds.top + parent.clientTop); bottom = Math.min(bottom, bounds.top + parent.clientTop + parent.clientHeight); }
        }
      }
      const outer = shadows?.filter(s => !s.inset && s.rgba[3] > 0).map(s => path ? {
        ...s, blur: s.blur * 2, rgba: [...s.rgba.slice(0, 3), s.rgba[3] * (shadowShape.opacity ?? 1)],
      } : s);
      const fallback = parseSurfaceColor(theme?.semantic?.background) ||
        (onThemeMode === "dark_mode" ? [24 / 255, 24 / 255, 24 / 255, 1] : [1, 1, 1, 1]);
      for (let i = 0; i < 3; i++) background[i] += fallback[i] * (1 - background[3]);
      const contrast = Math.max(8 / 255, ...(outer || []).flatMap(s => s.rgba.slice(0, 3).map((c, i) => Math.abs(c - background[i]))));
      const pad = outer?.length ? Math.ceil(Math.max(...outer.map(s => Math.max(Math.abs(s.x), Math.abs(s.y)) + s.blur * 1.5 + Math.abs(s.spread))) + 2) : 0;
      const next = outer?.some(s => s.blur > 0) && (!path || outer.every(s => s.spread === 0)) && radius !== null && stable &&
        rect.width > 0 && rect.height > 0 && pad <= 512 ? {
          key: shadow, amplitude: 1 / (255 * contrast), width: rect.width, height: rect.height, radius, pad, outer,
          native: shadows.filter(s => s.inset).map(s => s.raw).join(", ") || "none",
          ratio: window.devicePixelRatio || 1,
          clip: [Math.max(0, top - rect.top + pad), Math.max(0, rect.right + pad - right),
            Math.max(0, rect.bottom + pad - bottom), Math.max(0, left - rect.left + pad)].map(v => `${v}px`).join(" "),
        } : null;
      // An element removed mid-transition never reports its end.
      for (const target of running)
        if (!target.isConnected || !target.contains(node) || target.getAnimations?.().length === 0) running.delete(target);
      const settled = running.size ? null : next;
      const current = painted.current;
      if (current && (!settled || ["width", "height", "radius", "pad", "outer", "native", "ratio", "amplitude"]
        .some(key => JSON.stringify(current[key]) !== JSON.stringify(settled[key])))) handOff();
      else if (current && settled.clip !== current.clip && follower.current) {
        follower.current.style.clipPath = `inset(${settled.clip})`;
        painted.current = settled;
      }
      setPaint(prev => JSON.stringify(prev) === JSON.stringify(settled) ? prev : settled);
    };
    read();
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => read(false)) : null;
    resize?.observe(node);
    const observer = new MutationObserver(() => read());
    for (let parent = node; parent; parent = parent.parentElement)
      observer.observe(parent, { attributes: true, attributeFilter: ["style", "class"] });
    let frame = 0;
    const geometry = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; read(false); });
    };
    let resolution;
    const scaleChanged = () => {
      resolution?.removeEventListener?.("change", scaleChanged);
      resolution = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution?.addEventListener?.("change", scaleChanged);
      geometry();
    };
    scaleChanged();
    window.addEventListener("resize", geometry);
    window.addEventListener("scroll", geometry, true);
    const affects = (event) => event.target instanceof Element && event.target.contains(node) &&
      (event.type.startsWith("animation") || !SHADOW_NEUTRAL_PROPERTY.test(event.propertyName || "all"));
    const started = (event) => {
      if (!affects(event)) return;
      running.add(event.target);
      handOff();
      setPaint(null);
    };
    const transitioned = (event) => {
      if (event && running.delete(event.target) && running.size) return;
      read();
    };
    const motionStart = ["transitionrun", "animationstart"];
    const motionEnd = ["transitionend", "transitioncancel", "animationend", "animationcancel"];
    for (const type of motionStart) window.addEventListener(type, started, true);
    for (const type of motionEnd) window.addEventListener(type, transitioned, true);
    return () => {
      resize?.disconnect(); observer.disconnect(); cancelAnimationFrame(frame);
      resolution?.removeEventListener?.("change", scaleChanged);
      window.removeEventListener("resize", geometry);
      window.removeEventListener("scroll", geometry, true);
      for (const type of motionStart) window.removeEventListener(type, started, true);
      for (const type of motionEnd) window.removeEventListener(type, transitioned, true);
      painted.current = null;
    };
  }, [Tag, eligible, shadow, props.className, style?.borderRadius, style?.borderTopLeftRadius,
    style?.borderTopRightRadius, style?.borderBottomLeftRadius, style?.borderBottomRightRadius, style?.transform, style?.opacity, style?.color, style?.fontSize, style?.filter, path, shadowShape?.opacity, onThemeMode, theme?.semantic?.background]);

  const active = eligible && paint?.key === shadow && !props.hidden && style?.display !== "none";
  // Re-arm the follower once React has drawn it for the current geometry. A
  // hand-off above wrote the native shadow outside React, and React will not
  // rewrite a style value it believes is unchanged.
  useLayoutEffect(() => {
    const node = element.current;
    if (!active || !node) { painted.current = null; return; }
    const rect = node.getBoundingClientRect();
    if (Math.abs(rect.width - paint.width) > 0.01 || Math.abs(rect.height - paint.height) > 0.01) {
      // The host moved on while React drew this shape: keep the native
      // shadow until the ResizeObserver reports the size it settled at.
      node.style.boxShadow = shadow;
      if (path) node.style.filter = style?.filter ?? "";
      if (follower.current) follower.current.style.display = "none";
      painted.current = null;
      return;
    }
    node.style.boxShadow = paint.native;
    if (path) node.style.filter = "none";
    if (follower.current) {
      follower.current.style.display = "";
      follower.current.style.clipPath = `inset(${paint.clip})`;
    }
    painted.current = paint;
  });
  const owner = <Tag {...props} ref={attachElement} style={active ? { ...style, boxShadow: paint.native, ...(path ? { filter: "none" } : {}), anchorName: `--${id}` } : style}>{children}</Tag>;
  if (!active) return owner;
  const { width, height, pad, radius, outer, ratio } = paint;
  const w = width + 2 * pad, h = height + 2 * pad;
  return <>
    {owner}
    <svg ref={follower} width={w} height={h} aria-hidden="true" focusable="false" style={{
      position: "fixed", clipPath: `inset(${paint.clip})`, positionAnchor: `--${id}`,
      left: `calc(anchor(left) - ${pad}px)`, top: `calc(anchor(top) - ${pad}px)`,
      width: `calc(anchor-size(width) + ${pad * 2}px)`, height: `calc(anchor-size(height) + ${pad * 2}px)`,
      pointerEvents: "none", zIndex: style?.zIndex, opacity: style?.opacity,
      visibility: style?.visibility,
    }}>
      <defs><filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        {outer.map((s, i) => <Fragment key={i}>
          <feImage href={shapeImage(width, height, pad, radius, s.spread, path, ratio)} width={w} height={h} preserveAspectRatio="none" result={`shape${i}`} />
          <feOffset in={`shape${i}`} dx={s.x} dy={s.y} result={`moved${i}`} />
          <feGaussianBlur in={`moved${i}`} stdDeviation={s.blur / 2} result={`blur${i}`} />
          <feFlood floodColor={`rgb(${s.rgba[0] * 255},${s.rgba[1] * 255},${s.rgba[2] * 255})`} floodOpacity={s.rgba[3]} result={`color${i}`} />
          <feComposite in={`color${i}`} in2={`blur${i}`} operator="in" result={`shade${i}`} />
        </Fragment>)}
        <feMerge result="shade">{outer.map((s, i) => <feMergeNode key={i} in={`shade${outer.length - i - 1}`} />)}</feMerge>
        <feComponentTransfer in="shade" result="solidColor"><feFuncA type="linear" slope="0" intercept="1" /></feComponentTransfer>
        <feFlood floodColor={`rgb(${paint.amplitude * 255},${paint.amplitude * 255},${paint.amplitude * 255})`} result="amount" />
        <feColorMatrix in="shade" values="0 0 0 2 0 0 0 0 2 0 0 0 0 2 0 0 0 0 0 1" result="capLow" />
        <feColorMatrix in="shade" values="0 0 0 -2 2 0 0 0 -2 2 0 0 0 -2 2 0 0 0 0 1" result="capHigh" />
        <feBlend in="amount" in2="capLow" mode="darken" result="low" /><feBlend in="low" in2="capHigh" mode="darken" result="bounded" />
        <feColorMatrix in="bounded" values={`${ZERO_RGB} 1 0 0 0 0`} result="amplitude" />
        <feImage href={THRESHOLDS} x="0" y="0" width={64 / ratio} height={64 / ratio} preserveAspectRatio="none" result="tile" />
        <feTile in="tile" result="thresholds" />
        <feColorMatrix in="thresholds" values={`${ZERO_RGB} 1 0 0 0 0`} result="random" />
        <feComposite in="random" in2="amplitude" operator="in" result="delta" />
        <feColorMatrix in="shade" values={`${ZERO_RGB} 0 0 0 1 0`} result="alpha" />
        <feComposite in="alpha" in2="amplitude" operator="arithmetic" k2="1" k3="-.5" result="base" />
        <feComposite in="base" in2="delta" operator="arithmetic" k2="1" k3="1" result="dithered" />
        <feComposite in="solidColor" in2="dithered" operator="in" result="colored" />
      </filter>
        {/* Cut the owner out after filtering. A vector mask avoids the half-pixel
            resampling fringe of an feImage hole on high-density displays. */}
        <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
          <rect width={w} height={h} fill="white" />
          {path ? <path d={path} transform={`translate(${pad} ${pad})`} fill="black" /> :
            <rect x={pad} y={pad} width={width} height={height} rx={radius[0]} ry={radius[1]} fill="black" />}
        </mask>
      </defs>
      <rect width={w} height={h} filter={`url(#${id})`} mask={`url(#${id}-mask)`} />
    </svg>
  </>;
});

export default ShadowSurface;
