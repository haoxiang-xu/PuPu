import React, { useState } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import { AGENTS_MODAL_Z } from "../../top_strip";
import SkeletonCanvas from "./skeleton_canvas";
import { overlay_tokens } from "./canvas_chrome";
import { run_status_caption } from "./nodes/run_node_status";
import useSkeletonRunObservation from "./use_skeleton_run_observation";

const NO_SOURCES = Object.freeze({});

/* This view owns no editable resource or actor operation. A graph is selected
 * by invocation identity, never by a definition/node label shared by siblings.
 * Managed source text is deliberately absent: the editor may already hold B
 * while this immutable run uses A. The frozen source path/digest is still shown. */
export default function SkeletonRunView({ scope, isDark, onClose }) {
  const observed = useSkeletonRunObservation(scope);
  const [graphId, setGraphId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [homeToken, setHomeToken] = useState(0);
  const graphs = observed.run?.graphs || [];
  const graph = graphs.find((item) => item.graph_id === graphId) || graphs[0] || null;
  const node = selected && graph && selected.graph_id === graph.graph_id ? graph.nodes.find((item) => item.node_id === selected.node_id) : null;
  const tokens = overlay_tokens(isDark);
  const layoutKey = graph ? JSON.stringify(["run-observation", scope.owner_chat_id, scope.execution_id,
    observed.run.generation_id, observed.run.root_run_id, graph.graph_id]) : null;
  return (
    <div data-testid="skeleton-run-observation-view" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      {graph && <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", order: 1 }}><SkeletonCanvas resourceId={layoutKey} commandScope="run-observation" document={graph.document}
        readOnly observation={graph} isDark={isDark} managedSources={NO_SOURCES} homeToken={homeToken}
        onSelectNode={(node_id) => setSelected({ graph_id: graph.graph_id, node_id })} /></div>}
      <div style={{ position: "relative", margin: "16px 14px 8px", maxHeight: "45%", overflowY: "auto", flexShrink: 0, order: 0, zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
        display: "flex", flexDirection: "column", gap: 7, padding: 12, borderRadius: 10,
        background: tokens.background, border: tokens.border, backdropFilter: tokens.backdrop, boxShadow: tokens.shadow }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Button label="Back to editor" prefix_icon="arrow_left" onClick={onClose}
            style={{ fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 6 }} />
          <strong style={{ fontSize: 12 }}>Read-only run snapshot</strong>
          <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {graph && <Button label="Center graph" prefix_icon="target" onClick={() => setHomeToken((v) => v + 1)}
              style={{ fontSize: 11, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }} />}
            <Button label={observed.refreshing ? "Reading…" : "Refresh recorded state"} prefix_icon="refresh"
              disabled={observed.refreshing} onClick={observed.refresh}
              style={{ fontSize: 11, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 }} />
          </span>
        </div>
        <span style={{ fontSize: 11, lineHeight: 1.45 }}>Recorded state; live activity is unconfirmed. Approve, resume or cancel in chat.</span>
        <span style={{ fontSize: 10.5, color: "var(--pupu-text-muted)", overflowWrap: "anywhere" }}>
          Chat {scope.owner_chat_id} · execution {scope.execution_id}{observed.run ? ` · root ${observed.run.root_run_id}` : ""}
        </span>
        {observed.error && <div data-testid="run-observation-error" role="alert" style={{ fontSize: 11, lineHeight: 1.45 }}>
          {observed.error}{graph ? " The last recorded snapshot remains on screen; it is not confirmed current." : ""}
        </div>}
        {observed.phase === "loading" && <span role="status">Reading the recorded run…</span>}
        {observed.phase === "empty" && <span role="status">No matching run for this resource in the current chat.</span>}
        {graph && <>
          <div data-testid="run-observation-graph-picker" style={{ maxWidth: 560, width: "100%" }}>
            <Select value={graph.graph_id} set_value={(id) => { if (graphs.some((item) => item.graph_id === id)) { setGraphId(id); setSelected(null); } }}
              filterable={false} placeholder="Recorded graph invocation" options={graphs.map((item) => ({ value: item.graph_id,
                label: `${item.document.name} · ${item.caller_node_id === null ? "root" : `from ${item.caller_node_id}`} · ${item.graph_id}` }))}
              style={{ height: 28, fontSize: 11 }} />
          </div>
          <span data-testid="run-observation-graph-state" style={{ fontSize: 11 }}>
            {graph.status} · revision {graph.revision} · journal {observed.run.high_watermark}
            {graph.parent_graph_id === null ? graph.root_committed ? " · root committed" : " · root not committed" : ""}
          </span>
          <span style={{ fontSize: 10.5, color: "var(--pupu-text-muted)" }}>Code previews show the frozen path only; the editor’s source text is not used.</span>
          {graph.error && <span role="alert" style={{ fontSize: 11 }}>{graph.error.code} · {graph.error.path.join(".")}</span>}
          {graph.skipped_edges.length > 0 && <span data-testid="run-observation-skipped" style={{ fontSize: 11, opacity: 0.65 }}>
            Skipped paths (dashed): {graph.skipped_edges.join(", ")}. Unvisited nodes remain pending.
          </span>}
          {node && <span data-testid="run-observation-selected-node" style={{ fontSize: 11 }}>
            {node.node_id}: {run_status_caption(node)}{node.reason ? ` · ${node.reason}` : ""}
          </span>}
        </>}
      </div>
    </div>
  );
}
