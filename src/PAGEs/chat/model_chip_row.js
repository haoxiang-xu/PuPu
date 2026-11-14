import { useLayoutEffect, useRef, useState } from "react";
import useReducedMotion from "../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { useRotatingModelChips } from "./hooks/use_rotating_model_chips";

const FADE_MS = 500;
const RESIZE_MS = 600;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * One fixed position in the chip row. When the slot is handed a different
 * chip it fades the old one out, eases its width to the new chip's measured
 * width (so neighbours slide instead of jumping), then fades the new one in.
 */
const ChipSlot = ({ chip, renderChip, reducedMotion, onHoverChange }) => {
  const [shown, setShown] = useState(chip);
  const [visible, setVisible] = useState(true);
  const [width, setWidth] = useState(null);
  const contentRef = useRef(null);
  const pendingRef = useRef([]);

  /* Measure the chip on screen so the slot always has an explicit width to
     ease from. Runs before paint, so no frame is drawn at a stale width. */
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    /* offsetWidth, not getBoundingClientRect: the slot is scaled while it
       fades, and the measurement must be the chip's untransformed size */
    const next = node.offsetWidth;
    setWidth((previous) => (previous === next ? previous : next));
  }, [shown]);

  /* fade out → swap content while invisible (its width then eases to the new
     chip) → fade back in once the width has settled */
  useLayoutEffect(() => {
    if (chip.id === shown.id) {
      /* label/provider of the same model may refresh in place */
      if (chip !== shown) setShown(chip);
      return undefined;
    }
    if (reducedMotion) {
      setShown(chip);
      setVisible(true);
      return undefined;
    }
    setVisible(false);
    const timers = pendingRef.current;
    timers.push(
      setTimeout(() => {
        setShown(chip);
        timers.push(setTimeout(() => setVisible(true), RESIZE_MS));
      }, FADE_MS),
    );
    return undefined;
  }, [chip, shown, reducedMotion]);

  useLayoutEffect(() => {
    const timers = pendingRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const transition = reducedMotion
    ? "none"
    : `opacity ${FADE_MS}ms ${EASE}, transform ${FADE_MS}ms ${EASE}, width ${RESIZE_MS}ms ${EASE}`;

  return (
    <span
      onMouseEnter={() => onHoverChange(shown.id)}
      onMouseLeave={() => onHoverChange(null)}
      style={{
        display: "inline-flex",
        width: width == null ? "auto" : width,
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.94)",
        transition,
        /* the fading chip must not take clicks for a model it no longer shows */
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <span ref={contentRef} style={{ display: "inline-flex", flexShrink: 0 }}>
        {renderChip(shown)}
      </span>
    </span>
  );
};

/**
 * The model chips under the new-chat composer: at most `limit` on screen,
 * with a few swapped for others at random every so often.
 */
const ModelChipRow = ({ chips, selectedModelId, renderChip, style }) => {
  const reducedMotion = useReducedMotion();
  /* Only the chip under the pointer is held still; everything else keeps
     rotating. (Pausing the whole row on hover froze it whenever the pointer
     rested anywhere in the row's full-width band.) */
  const [heldId, setHeldId] = useState(null);
  const slots = useRotatingModelChips(chips, { selectedModelId, heldId });

  return (
    <div
      data-testid="model-chip-row"
      style={style}
    >
      {slots.map(({ slot, chip }) => (
        <ChipSlot
          key={slot}
          chip={chip}
          renderChip={renderChip}
          reducedMotion={reducedMotion}
          onHoverChange={setHeldId}
        />
      ))}
    </div>
  );
};

export default ModelChipRow;
