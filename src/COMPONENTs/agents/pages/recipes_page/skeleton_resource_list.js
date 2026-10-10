import React, { useCallback, useEffect, useState } from "react";
import { api } from "../../../../SERVICEs/api";

/* The Skeleton resources, beside the legacy recipes rather than mixed into
 * them.
 *
 * The two are addressed differently and must not be confused: a legacy recipe
 * is fetched BY NAME, a Skeleton resource BY ID. One list holding both would
 * make a name and an id interchangeable at the point of selection, and the
 * first collision would open the wrong thing — or create one. So they are two
 * lists with two callbacks, and nothing here ever hands an id to the recipe
 * path or a name to this one. */

const CAPTION = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: "#86868b",
  padding: "0 10px",
};

const ROW = (isDark, selected) => ({
  display: "flex",
  alignItems: "baseline",
  gap: 6,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 12,
  background: selected
    ? isDark
      ? "rgba(255,255,255,0.07)"
      : "rgba(0,0,0,0.05)"
    : "transparent",
});

const NOTE = { ...CAPTION, fontWeight: 400, letterSpacing: 0, textTransform: "none" };

export default function SkeletonResourceList({ activeId, onSelect, isDark }) {
  const [state, setState] = useState({ status: "loading", items: [], error: null });

  const load = useCallback(async () => {
    const method = api && api.unchain && api.unchain.listSkeletonResources;
    if (typeof method !== "function") {
      setState({ status: "unavailable", items: [], error: null });
      return;
    }
    try {
      const answer = await method(false);
      if (answer && answer.error) {
        setState({ status: "failed", items: [], error: answer.error });
        return;
      }
      const items = Array.isArray(answer)
        ? answer
        : (answer && answer.resources) || [];
      setState({ status: "ready", items, error: null });
    } catch (error) {
      setState({ status: "failed", items: [], error });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* Absent is not the same as empty: a build that cannot reach the store would
     otherwise look like an account with no Agents in it. */
  if (state.status === "unavailable") return null;

  return (
    <div
      data-testid="skeleton-resource-list"
      style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 8 }}
    >
      <span style={CAPTION}>Agents</span>
      {state.status === "loading" && <span style={NOTE}>Loading…</span>}
      {state.status === "failed" && (
        <span data-testid="skeleton-list-failed" style={NOTE}>
          {(state.error && state.error.message) || "Could not be listed."}
        </span>
      )}
      {state.status === "ready" && state.items.length === 0 && (
        <span style={NOTE}>None yet.</span>
      )}
      {state.items.map((item) => (
        <div
          key={item.id}
          data-testid={`skeleton-resource-${item.id}`}
          onClick={() => onSelect(item.id)}
          style={ROW(isDark, item.id === activeId)}
        >
          <span>{item.name || item.id}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#86868b" }}>
            {item.kind}
          </span>
        </div>
      ))}
    </div>
  );
}
