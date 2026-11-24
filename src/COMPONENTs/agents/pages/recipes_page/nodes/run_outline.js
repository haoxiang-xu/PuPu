import React, { createContext, useMemo } from "react";
import { puzzle_outline_halves, puzzle_outline_path } from "./puzzle_outline";

/* A run state drawn on the node's own puzzle outline (design "B3, in on the
 * left, out on the right"). RunNodeStatus says which line; PuzzleShape, which
 * knows the node's bumps and notches, draws it.
 *
 *   pass   — running: a faint line all round, and light that comes in at the
 *            in-port and runs over the top and under the bottom at once to
 *            the out-port, the way the data goes.
 *   march  — waiting on a person: a dashed line that keeps moving.
 *   solid  — failed.
 *   dotted — outcome unknown.
 *   dashed — suspended: still, so it never reads as a wait owed by a person. */
export const RunOutlineContext = createContext(null);

export const RUN_PASS_MS = 1500;
export const RUN_MARCH_MS = 1200;
const STYLE_ID = "pupu-run-outline-style";
/* the outline sits 1px outside the body; the box leaves room for the bumps */
const MARGIN = 14;
const PASS_DASH = 34;

const ensureStyle = () => {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    @keyframes pupu-run-pass { from { stroke-dashoffset: ${PASS_DASH}; } to { stroke-dashoffset: -100; } }
    @keyframes pupu-run-march { to { stroke-dashoffset: -11; } }
    @media (prefers-reduced-motion: reduce) {
      [data-run-outline] path { animation: none !important; }
      [data-run-outline] [data-run-pass] { stroke-dasharray: none !important; opacity: 0.6; }
    }
  `;
  document.head.appendChild(el);
};

export default function RunOutline({ run, width, height, tabs, cutouts, anchor, isDark }) {
  const shape = useMemo(() => ({ tabs, cutouts, anchor }), [tabs, cutouts, anchor]);
  const d = useMemo(() => (width > 0 && height > 0 ? puzzle_outline_path(width, height, shape) : ""), [width, height, shape]);
  const halves = useMemo(() => (run?.line === "pass" && d ? puzzle_outline_halves(width, height, shape) : null),
    [run, d, width, height, shape]);
  if (!run || !run.line || !d) return null;
  ensureStyle();
  const { line, color } = run;
  const base = { fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  return (
    <svg data-run-outline={line} aria-hidden width={width + MARGIN * 2} height={height + MARGIN * 2}
      style={{ position: "absolute", left: -MARGIN, top: -MARGIN, overflow: "visible", pointerEvents: "none", zIndex: 1 }}>
      <g transform={`translate(${MARGIN} ${MARGIN})`}>
        {line === "pass" && (
          <>
            <path d={d} style={{ ...base, opacity: 0.16 }} />
            {halves.filter(Boolean).map((half, i) => (
              <path key={i} data-run-pass="" d={half} pathLength={100} style={{ ...base,
                strokeDasharray: `${PASS_DASH} 200`, animation: `pupu-run-pass ${RUN_PASS_MS}ms cubic-bezier(.5,0,.3,1) infinite`,
                filter: isDark ? `drop-shadow(0 0 3px ${color})` : "none" }} />
            ))}
          </>
        )}
        {line === "march" && <path d={d} style={{ ...base, strokeDasharray: "6 5", animation: `pupu-run-march ${RUN_MARCH_MS}ms linear infinite` }} />}
        {line === "solid" && <path d={d} style={base} />}
        {line === "dotted" && <path d={d} style={{ ...base, strokeWidth: 2.2, strokeDasharray: "1 4" }} />}
        {line === "dashed" && <path d={d} style={{ ...base, strokeWidth: 1.5, strokeDasharray: "4 4", opacity: 0.9 }} />}
      </g>
    </svg>
  );
}
