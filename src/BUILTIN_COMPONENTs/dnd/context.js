import React, { useState, useCallback } from "react";
import {
  DndContext as DndKitContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  MeasuringStrategy,
  MeasuringFrequency,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  DndContext – wraps @dnd-kit/core DndContext with sensible defaults                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const MEASURING = {
  droppable: {
    strategy: MeasuringStrategy.WhileDragging,
    frequency: MeasuringFrequency.Optimized,
  },
};

const DndContext = ({
  children,
  on_drag_start,
  on_drag_over,
  on_drag_end,
  on_drag_cancel,
  overlay, // (activeId) => ReactNode – content rendered inside DragOverlay
  collision_detection, // optional override
  modifiers, // dnd-kit modifier array, e.g. [restrictToParentElement]
  activation_distance = 5, // px pointer must move before drag begins
}) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: activation_distance },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  /* ── track active id for overlay ──────────────────── */
  const [activeId, setActiveId] = useState(null);

  const handleDragStart = useCallback(
    (event) => {
      setActiveId(event.active.id);
      if (on_drag_start) on_drag_start(event);
    },
    [on_drag_start],
  );

  const handleDragOver = useCallback(
    (event) => {
      if (on_drag_over) on_drag_over(event);
    },
    [on_drag_over],
  );

  const handleDragEnd = useCallback(
    (event) => {
      setActiveId(null);
      if (on_drag_end) on_drag_end(event);
    },
    [on_drag_end],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    if (on_drag_cancel) on_drag_cancel();
  }, [on_drag_cancel]);

  return (
    <DndKitContext
      sensors={sensors}
      collisionDetection={collision_detection || closestCorners}
      measuring={MEASURING}
      modifiers={modifiers}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}

      <DragOverlay
        dropAnimation={{
          duration: 240,
          easing: "cubic-bezier(0.32, 1, 0.32, 1)",
        }}
      >
        {activeId != null && overlay ? overlay(activeId) : null}
      </DragOverlay>
    </DndKitContext>
  );
};

export { DndContext as default, DndContext };
