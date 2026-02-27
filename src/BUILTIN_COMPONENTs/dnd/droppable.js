import React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Droppable – a sortable container powered by @dnd-kit                                                                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STRATEGIES = {
  vertical: verticalListSortingStrategy,
  horizontal: horizontalListSortingStrategy,
  grid: rectSortingStrategy,
};

const Droppable = ({
  id,
  items, // string[] — item ids for SortableContext
  children,
  direction = "vertical", // "vertical" | "horizontal" | "grid"
  gap = 8,
  wrap = false,
  style,
  disabled = false,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id,
    disabled,
  });

  const strategy = STRATEGIES[direction] || verticalListSortingStrategy;

  return (
    <SortableContext items={items} strategy={strategy}>
      <div
        ref={setNodeRef}
        style={{
          display: "flex",
          flexDirection:
            direction === "horizontal" || direction === "grid"
              ? "row"
              : "column",
          flexWrap: wrap || direction === "grid" ? "wrap" : "nowrap",
          gap,
          position: "relative",
          minHeight: 40,
          transition: "background-color 0.2s ease",
          ...style,
          ...(isOver
            ? {
                backgroundColor: "rgba(100, 149, 237, 0.06)",
              }
            : {}),
        }}
      >
        {children}
      </div>
    </SortableContext>
  );
};

export { Droppable as default, Droppable };
