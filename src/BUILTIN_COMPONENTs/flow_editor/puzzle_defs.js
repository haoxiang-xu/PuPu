import React from "react";

/* Goo filter used to smoothly merge puzzle tabs into the node body.
 * Render once per canvas (FlowEditor renders it at the viewport root). */
export default function PuzzleDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute", pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <filter id="flow-editor-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -11"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
  );
}
