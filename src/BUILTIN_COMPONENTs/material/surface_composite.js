import { useId, useLayoutEffect, useRef, useState } from "react";

// Uniform thresholds, not visible grain: 0.75 of an 8-bit step peak-to-peak, applied
// before the final tint is rounded. Keep this module identical in PuPu/Mini UI.
const THRESHOLDS = "data:image/png;base64,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";

export function parseSurfaceColor(value) {
  if (typeof value !== "string") return null;
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  const srgb = value.match(/^color\(srgb\s+([^)]+)\)$/);
  if (!rgb && !srgb) return null;
  const parts = (rgb || srgb)[1].trim().split(/[\s,/]+/);
  if (parts.length < 3 || parts.length > 4 || parts.some((part) => !/^(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(part))) return null;
  const channels = parts.map((part, index) => {
    const number = Number(part.replace(/%$/, ""));
    return part.endsWith("%") ? number / 100 : number / (rgb && index < 3 ? 255 : 1);
  });
  if (channels.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) return null;
  if (channels.length === 3) channels.push(1);
  return channels;
}

export function parseSurfaceFilter(value) {
  if (!value || value === "none") return { blur: 0, saturation: 1 };
  if (typeof value !== "string") return null;
  const match = value.match(/^blur\(([\d.]+)px\)(?:\s+saturate\(([\d.]+)(%)?\))?$/);
  if (!match) return null;
  const blur = Number(match[1]);
  const saturation = match[2] == null ? 1 : Number(match[2]) / (match[3] ? 100 : 1);
  return Number.isFinite(blur) && Number.isFinite(saturation) ? { blur, saturation } : null;
}

function supportsSurfaceComposite() {
  // WebKit/Gecko accept parts of this syntax without rendering SVG backdrop
  // filters. Keep their existing native blur + tiny texture fallback intact.
  return typeof navigator !== "undefined" && /(?:Chrome|Chromium)\//.test(navigator.userAgent) &&
    typeof CSS !== "undefined" && CSS.supports("backdrop-filter", "url(#surface-composite)");
}

/**
 * A background-only compositing pass for translucent surfaces on an opaque app
 * canvas. It does not filter text, add a wrapper/backdrop root, or change focus.
 * Unsupported colours/filter chains/engines retain the caller's original CSS.
 */
export function useSurfaceComposite({ backgroundColor, backdropFilter, enabled = true, tintLayers = 1 }) {
  const id = `surface-composite-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const probe = useRef(null);
  const [paint, setPaint] = useState(null);
  const filter = parseSurfaceFilter(backdropFilter);
  const supported = enabled && (tintLayers === 1 || tintLayers === 2) && Boolean(filter) && supportsSurfaceComposite();

  useLayoutEffect(() => {
    if (!supported || !probe.current) return undefined;
    const element = probe.current;
    const read = () => {
      const color = getComputedStyle(element).color;
      const ratio = window.devicePixelRatio || 1;
      setPaint((previous) => previous?.color === color && previous?.ratio === ratio
        ? previous : { color, ratio });
    };
    read();
    // Theme editor previews update CSS variables before ConfigContext commits.
    // Watch only this element's ancestors, never the whole document subtree.
    const observer = new MutationObserver(read);
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ["style", "class"] });
    }
    let resolution;
    const watchResolution = () => {
      resolution?.removeEventListener("change", onResolutionChange);
      resolution = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      resolution?.addEventListener("change", onResolutionChange);
    };
    const onResolutionChange = () => { read(); watchResolution(); };
    watchResolution();
    window.addEventListener("resize", read);
    return () => {
      observer.disconnect();
      resolution?.removeEventListener("change", onResolutionChange);
      window.removeEventListener("resize", read);
    };
  }, [supported, backgroundColor]);

  const rgba = paint && parseSurfaceColor(paint.color);
  // Solid fills have no translucent quantization to correct. Transparent fills
  // without a blur need no extra compositing pass either.
  const active = supported && rgba && rgba[3] < 1 && (rgba[3] > 0 || filter.blur > 0);
  // Mini UI historically paints the same tint on both wrapper and field.
  // Collapse those layers algebraically while preserving their combined alpha.
  const alpha = 1 - (1 - (rgba?.[3] || 0)) ** tintLayers;
  const through = 1 - alpha;
  const matrix = rgba ? [
    through, 0, 0, 0, rgba[0] * alpha,
    0, through, 0, 0, rgba[1] * alpha,
    0, 0, through, 0, rgba[2] * alpha,
    0, 0, 0, 1, 0,
  ].join(" ") : "";
  const tileSize = 64 / (paint?.ratio || 1);

  return {
    style: active ? {
      backgroundColor: "transparent",
      backgroundImage: "none",
      backdropFilter: `url(#${id})`,
      WebkitBackdropFilter: `url(#${id})`,
    } : {},
    definition: supported ? (
      <svg ref={probe} width="0" height="0" aria-hidden="true" focusable="false"
        style={{ position: "absolute", pointerEvents: "none", color: backgroundColor }}>
        {active && <defs>
          <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation={filter.blur} edgeMode="duplicate" result="blurred" />
            <feColorMatrix in="blurred" type="saturate" values={filter.saturation} result="saturated" />
            <feColorMatrix in="saturated" type="matrix" values={matrix} result="tinted" />
            <feImage href={THRESHOLDS} x="0" y="0" width={tileSize} height={tileSize} preserveAspectRatio="none" result="tile" />
            <feTile in="tile" result="thresholds" />
            <feColorMatrix in="thresholds" type="matrix"
              values="0.002941176 0 0 0 0 0 0.002941176 0 0 0 0 0 0.002941176 0 0 0 0 0 0 1" result="thresholds" />
            <feComposite in="tinted" in2="thresholds" operator="arithmetic" k2="1" k3="1" k4={-0.375 / 255} />
          </filter>
        </defs>}
      </svg>
    ) : null,
  };
}

export { THRESHOLDS };
