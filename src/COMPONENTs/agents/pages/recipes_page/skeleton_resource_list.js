import React, { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { subscribeSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { new_agent_document } from "./skeleton_graph_edits";

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

export default function SkeletonResourceList({ activeId, onSelect, onCreate, isDark }) {
  const [state, setState] = useState({ status: "loading", items: [], error: null });
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [creationError, setCreationError] = useState("");
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const method = api && api.unchain && api.unchain.listSkeletonResources;
    if (typeof method !== "function") {
      setState({ status: "unavailable", items: [], error: null });
      return;
    }
    setState((previous) => ({ ...previous, status: "loading", error: null }));
    try {
      const answer = await method(false);
      if (request !== requestRef.current) return;
      if (answer && answer.error) {
        setState({ status: "failed", items: [], error: answer.error });
        return;
      }
      const items = Array.isArray(answer)
        ? answer
        : (answer && answer.resources) || [];
      setState({ status: "ready", items, error: null });
    } catch (error) {
      if (request !== requestRef.current) return;
      setState({ status: "failed", items: [], error });
    }
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = subscribeSkeletonLibraryRefresh(load);
    return () => {
      requestRef.current += 1;
      unsubscribe();
    };
  }, [load]);

  const canCreate = state.status === "ready" && typeof onCreate === "function" &&
    typeof api?.unchain?.saveSkeletonResource === "function";
  const create = (event) => {
    event.preventDefault();
    if (!canCreate || !name.trim()) return;
    try {
      // Resource identity is independent of its editable display name. The
      // store remains the authority on collisions; first Save never replaces.
      const bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      const id = `agent-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      const args = { id, name: name.trim() };
      const result = new_agent_document(args);
      if (!result.ok) {
        setCreationError(result.problem.message);
        return;
      }
      onCreate(args);
      setNaming(false);
      setName("");
      setCreationError("");
    } catch (_error) {
      setCreationError("This Agent could not be created. Your name has been kept; please try again.");
    }
  };

  /* Absent is not the same as empty: a build that cannot reach the store would
     otherwise look like an account with no Agents in it. */
  if (state.status === "unavailable") return null;

  return (
    <div
      data-testid="skeleton-resource-list"
      style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: 8 }}
    >
      <span style={CAPTION}>Agents</span>
      {canCreate && !naming && (
        <Button label="New Agent" onClick={() => setNaming(true)}
          style={{ fontSize: 11, paddingVertical: 4, paddingHorizontal: 10 }} />
      )}
      {canCreate && naming && (
        <form onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 10px" }}>
          <label style={{ ...NOTE, padding: 0 }}>
            Agent name
            <input aria-label="Agent name" value={name} onChange={(event) => setName(event.target.value)}
              style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 4, padding: 6,
                borderRadius: 5, border: "1px solid rgba(128,128,128,0.3)", background: "transparent", color: "inherit" }} />
          </label>
          <div style={{ display: "flex", gap: 4 }}>
            <Button label="Create Agent" onClick={create} disabled={!name.trim()} style={{ fontSize: 11 }} />
            <Button label="Cancel" onClick={(event) => { event.preventDefault(); setNaming(false); setCreationError(""); }}
              style={{ fontSize: 11 }} />
          </div>
          {creationError && <span role="alert" style={{ ...NOTE, padding: 0 }}>{creationError}</span>}
        </form>
      )}
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
