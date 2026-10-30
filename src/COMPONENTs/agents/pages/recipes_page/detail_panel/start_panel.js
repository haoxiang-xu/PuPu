import React from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import {
  is_valid_output_row,
  output_source,
  output_sources_for,
  unused_output_sources,
} from "./output_sources";

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export default function StartPanel({ node, recipe, onChange, isDark }) {
  function update_outputs(next) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, outputs: next } : n,
      ),
    });
  }

  const rows = node.outputs || [];
  const sources = output_sources_for(node);
  const available = unused_output_sources(node);

  /* A row is a pick, so changing it means taking that source's type with it —
   * the type is never chosen separately, and never typed by hand. */
  function set_row(i, name) {
    const src = output_source(node, name);
    if (!src) return;
    update_outputs(
      rows.map((o, idx) =>
        idx === i ? { name: src.name, type: src.type } : o,
      ),
    );
  }
  function add_row() {
    const next = available[0];
    if (!next) return;
    update_outputs([...rows, { name: next.name, type: next.type }]);
  }
  function remove_row(i) {
    update_outputs(rows.filter((_, idx) => idx !== i));
  }

  const muted = "#86868b";

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Input Variables</span>
        <span style={{ fontSize: 10.5, color: muted, lineHeight: 1.45 }}>
          Fixed by how the graph is entered — a chat turn fills these, so they
          cannot be added to or renamed here.
        </span>
        {sources.map((s) => (
          <div
            key={s.name}
            data-testid={`start-input-${s.name}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 10px",
              borderRadius: 6,
              background: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.025)",
              opacity: 0.75,
            }}
          >
            <span
              style={{
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 11.5,
              }}
            >
              {s.name}
            </span>
            <span
              style={{
                fontSize: 10,
                color: muted,
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            >
              {s.type}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                color: muted,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.description}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={SECTION_LABEL}>Output Variables</span>
          <Button
            label="+ Add output"
            onClick={add_row}
            disabled={available.length === 0}
            style={{
              fontSize: 11,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 5,
              color: available.length === 0 ? muted : "#4a5bd8",
            }}
          />
        </div>

        {rows.length === 0 && (
          <span style={{ fontSize: 11, color: muted }}>
            Nothing exported yet.
          </span>
        )}

        {rows.map((o, i) => {
          const valid = is_valid_output_row(node, o);
          /* A row loaded from an older definition can name something this node
           * never produces. Keep it visible and marked rather than silently
           * dropping the author's data. */
          const options = [
            ...unused_output_sources(node).map((s) => ({
              value: s.name,
              label: s.name,
            })),
            ...(valid ? [{ value: o.name, label: o.name }] : []),
          ].sort((a, b) => a.label.localeCompare(b.label));

          return (
            <div
              key={i}
              data-testid={`start-output-row-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              {valid ? (
                <Select
                  options={options}
                  value={o.name}
                  set_value={(v) => set_row(i, v)}
                  filterable={false}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11.5,
                    paddingVertical: 4,
                    paddingHorizontal: 6,
                    borderRadius: 5,
                    gap: 4,
                    fontFamily: "ui-monospace, Menlo, monospace",
                  }}
                />
              ) : (
                <span
                  data-testid={`start-output-invalid-${i}`}
                  title="Start does not produce this. The runtime would leave it empty."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 11.5,
                    fontFamily: "ui-monospace, Menlo, monospace",
                    color: isDark
                      ? "rgba(255,100,100,0.9)"
                      : "rgba(180,30,30,0.9)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {o.name || "(unnamed)"} — not produced here
                </span>
              )}
              <span
                style={{
                  fontSize: 10,
                  color: muted,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  flexShrink: 0,
                }}
              >
                {o.type}
              </span>
              <Button
                prefix_icon="close"
                onClick={() => remove_row(i)}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  content: { icon: { width: 11, height: 11 } },
                }}
              />
            </div>
          );
        })}

        <span style={{ fontSize: 10.5, color: muted, lineHeight: 1.45 }}>
          An output is picked from what this node already has, and carries that
          source's type — nothing is invented here.
        </span>
      </div>
    </>
  );
}
