import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import useReducedMotion from "../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import {
  MODEL_CHIP_LIMIT,
  useRotatingModelChips,
} from "./hooks/use_rotating_model_chips";

const FADE_MS = 500;
const MOVE_MS = 600;
const GAP = 8;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Centered, wrapping row layout (what `flex-wrap` + `justify-content: center`
 * would produce), computed here so every chip can be moved with a transform.
 * Letting the browser wrap made a chip that changed rows teleport; with
 * explicit coordinates it glides to its new row like any other move.
 *
 * @param {Array<{w:number,h:number}|undefined>} sizes  in slot order
 * @returns {{positions: Array<{x:number,y:number}>, height:number} | null}
 */
export const layoutChipRows = (sizes, containerWidth, gap = GAP) => {
  if (!containerWidth || sizes.some((size) => !size)) return null;
  const rows = [];
  let row = null;
  sizes.forEach((size, index) => {
    if (!row || (row.items.length > 0 && row.width + gap + size.w > containerWidth)) {
      row = { items: [], width: 0, height: 0 };
      rows.push(row);
    }
    row.width += (row.items.length > 0 ? gap : 0) + size.w;
    row.height = Math.max(row.height, size.h);
    row.items.push(index);
  });

  const positions = [];
  let y = 0;
  rows.forEach((current, rowIndex) => {
    let x = Math.max(0, (containerWidth - current.width) / 2);
    current.items.forEach((index) => {
      const size = sizes[index];
      positions[index] = { x, y: y + (current.height - size.h) / 2 };
      x += size.w + gap;
    });
    y += current.height + (rowIndex < rows.length - 1 ? gap : 0);
  });
  return { positions, height: y };
};

/**
 * One chip position in the row. When it is handed a different chip it fades
 * the old one out, swaps the content while invisible (the row then re-lays out
 * and every chip glides to its new place), then fades the new chip in.
 * A slot that mounts with a `from` position (a chip that just moved between
 * the pinned group and the rotating group) starts there and glides over.
 */
const ChipSlot = ({
  slotKey,
  chip,
  position,
  from,
  pinned,
  renderChip,
  reducedMotion,
  onHoverChange,
  onTogglePin,
  onSize,
}) => {
  const [shown, setShown] = useState(chip);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  /* Until placed, sit at `from` (or the target) without a transition, so the
     first placement never animates in from the container's corner. */
  const [placed, setPlaced] = useState(false);
  const contentRef = useRef(null);
  const pendingRef = useRef([]);

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return undefined;
    /* offsetWidth/Height ignore the fade's scale transform */
    const report = () => onSize(slotKey, node.offsetWidth, node.offsetHeight);
    report();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [slotKey, shown, onSize]);

  useLayoutEffect(() => {
    if (!position || placed) return undefined;
    const frame = requestAnimationFrame(() => setPlaced(true));
    return () => cancelAnimationFrame(frame);
  }, [position, placed]);

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
        timers.push(setTimeout(() => setVisible(true), MOVE_MS));
      }, FADE_MS),
    );
    return undefined;
  }, [chip, shown, reducedMotion]);

  useLayoutEffect(() => {
    const timers = pendingRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const animate = placed && !reducedMotion;
  const at = !placed && from ? from : position;
  const x = at?.x ?? 0;
  const y = at?.y ?? 0;

  return (
    <span
      onMouseEnter={() => {
        setHovered(true);
        onHoverChange(shown.id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        onHoverChange(null);
      }}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        display: "inline-flex",
        visibility: position ? "visible" : "hidden",
        opacity: visible ? 1 : 0,
        transform: `translate(${x}px, ${y}px) scale(${visible ? 1 : 0.94})`,
        transition: animate
          ? `opacity ${FADE_MS}ms ${EASE}, transform ${MOVE_MS}ms ${EASE}`
          : "none",
        /* the fading chip must not take clicks for a model it no longer shows */
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <span ref={contentRef} style={{ display: "inline-flex", whiteSpace: "nowrap" }}>
        {renderChip(shown, {
          pinned,
          hovered,
          onTogglePin: () => onTogglePin(shown.id),
        })}
      </span>
    </span>
  );
};

/**
 * The model chips under the new-chat composer. Pinned chips come first, in
 * pin order, and never rotate. The remaining room (up to 16 chips in all) is
 * filled by models that rotate a few at a time.
 *
 * `renderChip(chip, { pinned, hovered, onTogglePin })` draws one chip.
 */
const ModelChipRow = ({
  chips,
  selectedModelId,
  pinnedIds = [],
  onTogglePin,
  renderChip,
}) => {
  const reducedMotion = useReducedMotion();
  /* Only the chip under the pointer is held still; everything else keeps
     rotating. */
  const [heldId, setHeldId] = useState(null);

  const pinnedChips = useMemo(() => {
    const byId = new Map(chips.map((chip) => [chip.id, chip]));
    return pinnedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [chips, pinnedIds]);
  const rotatingChips = useMemo(() => {
    const pinnedSet = new Set(pinnedIds);
    return chips.filter((chip) => !pinnedSet.has(chip.id));
  }, [chips, pinnedIds]);

  const rotating = useRotatingModelChips(rotatingChips, {
    limit: Math.max(0, MODEL_CHIP_LIMIT - pinnedChips.length),
    selectedModelId,
    heldId,
  });

  const entries = useMemo(
    () => [
      ...pinnedChips.map((chip) => ({ key: `pin:${chip.id}`, chip, pinned: true })),
      ...rotating.map(({ slot, chip }) => ({ key: `slot:${slot}`, chip, pinned: false })),
    ],
    [pinnedChips, rotating],
  );

  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const read = () => setContainerWidth(node.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const [sizes, setSizes] = useState({});
  const onSize = useCallback((key, w, h) => {
    setSizes((previous) =>
      previous[key]?.w === w && previous[key]?.h === h
        ? previous
        : { ...previous, [key]: { w, h } },
    );
  }, []);

  const layout = useMemo(
    () => layoutChipRows(entries.map(({ key }) => sizes[key]), containerWidth),
    [entries, sizes, containerWidth],
  );

  /* Where each model was last drawn, so a chip that changes group (pin /
     unpin) starts from its old spot instead of popping in. */
  const lastPositionByIdRef = useRef(new Map());
  const previousPositions = lastPositionByIdRef.current;
  useLayoutEffect(() => {
    if (!layout) return;
    const next = new Map();
    entries.forEach(({ chip }, index) => next.set(chip.id, layout.positions[index]));
    lastPositionByIdRef.current = next;
  }, [entries, layout]);

  /* like the chips, the row's height only animates after its first layout */
  const [settled, setSettled] = useState(false);
  useLayoutEffect(() => {
    if (!layout || settled) return undefined;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [layout, settled]);

  return (
    <div
      ref={containerRef}
      data-testid="model-chip-row"
      style={{
        position: "relative",
        width: "100%",
        height: layout ? layout.height : 0,
        transition:
          settled && !reducedMotion ? `height ${MOVE_MS}ms ${EASE}` : "none",
      }}
    >
      {entries.map(({ key, chip, pinned }, index) => (
        <ChipSlot
          key={key}
          slotKey={key}
          chip={chip}
          pinned={pinned}
          position={layout ? layout.positions[index] : null}
          from={previousPositions.get(chip.id) || null}
          renderChip={renderChip}
          reducedMotion={reducedMotion}
          onHoverChange={setHeldId}
          onTogglePin={onTogglePin}
          onSize={onSize}
        />
      ))}
    </div>
  );
};

export default ModelChipRow;
