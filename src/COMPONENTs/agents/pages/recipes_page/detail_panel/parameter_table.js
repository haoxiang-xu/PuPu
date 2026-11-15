import React from "react";
import { muted } from "./panel_style";

/* The detail panel's one table of named, typed values: Start's Parameters
   and a Workflow Call's Inputs are the same list seen from its two sides, so
   they share one measure — the column heads written once over the rows, the
   same padding, the same gap, the same row height. A table passes its own
   grid template; a column's head may be inset to sit over the text inside a
   control rather than over the control's edge. */

export const TABLE_GAP = 6;
export const TABLE_ROW_PAD = "6px 6px 6px 10px";
const TABLE_HEAD_PAD = "6px 6px 5px 10px";
/* The text inset of a panel control, for a head over a control's text. */
export const TABLE_CONTROL_INSET = 7;

/* `columns`: [{ label, inset }] in the order of `template`. */
export function TableHeads({ columns, template, isDark, testid }) {
  return (
    <div aria-hidden="true" data-testid={testid}
      style={{ display: "grid", gridTemplateColumns: template, columnGap: TABLE_GAP, alignItems: "center",
        padding: TABLE_HEAD_PAD, minWidth: 0 }}>
      {columns.map((column, index) => (
        <span key={index} style={{ fontSize: 11, lineHeight: "16px", color: muted(isDark), minWidth: 0,
          paddingLeft: column.inset || 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {column.label}
        </span>
      ))}
    </div>
  );
}

/* One row on the table's grid; what belongs under the row (its settings, what
   is wrong with it) comes after the grid, inside the same row. */
export function TableRow({ template, testid, children, below }) {
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: template, columnGap: TABLE_GAP, alignItems: "center",
        padding: TABLE_ROW_PAD, minHeight: 26, minWidth: 0 }}>
        {children}
      </div>
      {below}
    </div>
  );
}
