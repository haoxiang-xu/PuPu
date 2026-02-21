import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Draggable – a sortable item powered by @dnd-kit/sortable                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Draggable = ({
  id,
  children,
  disabled = false,
  style,
  dragging_style, // extra styles applied while dragging
  as: Component = "div", // wrapper element type
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const baseStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: "none",
    cursor: disabled ? "default" : isDragging ? "grabbing" : "grab",
    userSelect: "none",
    WebkitUserSelect: "none",
    ...style,
    ...(isDragging
      ? {
          opacity: 0.35,
          zIndex: 1,
          ...dragging_style,
        }
      : {}),
  };

  return (
    <Component
      ref={setNodeRef}
      style={baseStyle}
      {...attributes}
      {...listeners}
    >
      {children}
    </Component>
  );
};

export { Draggable as default, Draggable };
