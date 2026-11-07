import { useSurfaceComposite } from "./surface_composite";
import { SURFACE_DITHER_LAYER_STYLE } from "./surface_dither";

/** Ambient artwork over an opaque, matching page colour. Keep the source blur
 * native (including its transparent edges), then composite its strength with
 * the page colour and final thresholds in one pass. Never filter foreground UI.
 */
export default function CompositedBackground({
  backgroundColor,
  opacity = 1,
  blur = 0,
  dither = true,
  overlayStyle,
  children,
}) {
  const strength = Math.min(1, Math.max(0, opacity));
  const surface = useSurfaceComposite({
    backgroundColor: `color-mix(in srgb, ${backgroundColor} ${(1 - strength) * 100}%, transparent)`,
    enabled: dither && strength > 0 && strength < 1 && !!backgroundColor,
  });
  const active = !!surface.style.backdropFilter;

  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{
        position: "absolute",
        inset: 0,
        filter: blur ? `blur(${blur}px)` : undefined,
        transition: "filter .2s",
        opacity: active ? 1 : strength,
      }}>
        {children}
      </div>
      {dither && strength > 0 && (
        <div style={{
          ...SURFACE_DITHER_LAYER_STYLE,
          ...overlayStyle,
          ...surface.style,
          // The source already fades. Fading its tint a second time would
          // brighten the artwork midway through the entrance transition.
          ...(active ? { opacity: 1, transition: "none" } : {}),
        }} />
      )}
      {surface.definition}
    </div>
  );
}
