import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";

const SOURCE_DOT_COLOR = {
  start: "#4cbe8b",
  agent: "#6478f6",
  end: "#e06a9a",
};

export default function VariablePicker({ scope, onPick, onClose, position }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const search_ref = useRef(null);

  useEffect(() => {
    if (search_ref.current) search_ref.current.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scope;
    return scope.filter((v) =>
      `${v.node_id}.${v.field}`.toLowerCase().includes(q),
    );
  }, [scope, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((v) => {
      if (!map.has(v.node_id)) map.set(v.node_id, []);
      map.get(v.node_id).push(v);
    });
    return [...map.entries()];
  }, [filtered]);

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) onPick(filtered[active]);
    }
  }

  const pos_style = position ? { left: position.x, top: position.y } : {};

  return (
    <div
      style={{
        position: "absolute",
        ...pos_style,
        width: 280,
        background: isDark ? "#1c1c1e" : "#fff",
        border: `1px solid ${
          isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"
        }`,
        borderRadius: 10,
        boxShadow: isDark
          ? "0 12px 36px rgba(0,0,0,0.5)"
          : "0 12px 36px rgba(0,0,0,0.12)",
        zIndex: 1000,
        overflow: "hidden",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: 8,
          borderBottom: `1px solid ${
            isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"
          }`,
        }}
      >
        <input
          ref={search_ref}
          placeholder="Search variables…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 6,
            border: `1px solid ${
              isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
            }`,
            background: isDark ? "#141416" : "#f5f5f7",
            color: "inherit",
            fontSize: 12,
            fontFamily: "inherit",
          }}
        />
      </div>
      <div style={{ maxHeight: 280, overflow: "auto" }}>
        {grouped.map(([node_id, vars]) => (
          <div key={node_id} style={{ padding: "4px 0" }}>
            <div
              style={{
                padding: "6px 12px 4px",
                fontSize: 10,
                fontWeight: 600,
                color: "#86868b",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              From {node_id}
            </div>
            {vars.map((v) => {
              const flat_idx = filtered.indexOf(v);
              const is_active = flat_idx === active;
              return (
                <div
                  key={`${v.node_id}.${v.field}`}
                  onClick={() => onPick(v)}
                  onMouseEnter={() => setActive(flat_idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 12,
                    background: is_active
                      ? isDark
                        ? "rgba(165,180,252,0.12)"
                        : "rgba(99,102,241,0.1)"
                      : "transparent",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background:
                        SOURCE_DOT_COLOR[v.source_type] || "#6366f1",
                    }}
                  />
                  <span>{`${v.node_id}.${v.field}`}</span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 10,
                      color: "#86868b",
                      fontFamily: "-apple-system, sans-serif",
                    }}
                  >
                    {v.type}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 12, fontSize: 12, color: "#86868b" }}>
            No variables in scope.
          </div>
        )}
      </div>
    </div>
  );
}
