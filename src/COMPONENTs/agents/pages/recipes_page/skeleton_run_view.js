import { renderAgentMessage } from "./agents_i18n";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useState } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import { AGENTS_MODAL_Z } from "../../top_strip";
import SkeletonCanvas from "./skeleton_canvas";
import { overlay_tokens } from "./canvas_chrome";
import { run_status_caption } from "./nodes/run_node_status";
import useSkeletonRunObservation from "./use_skeleton_run_observation";
import { TOP_BAR_HEIGHT } from "../../../../BUILTIN_COMPONENTs/electron/title_bar";
import { windowStateBridge } from "../../../../SERVICEs/bridges/window_state_bridge";

const NO_SOURCES = Object.freeze({});

/* This view owns no editable resource or actor operation. A graph is selected
 * by invocation identity, never by a definition/node label shared by siblings.
 * Managed source text is deliberately absent: the editor may already hold B
 * while this immutable run uses A. The frozen source path/digest is still shown. */
export default function SkeletonRunView({ scope, isDark, onClose, leftInset = 14 }) {
  const { t } = useTranslation();
  const observed = useSkeletonRunObservation(scope);
  const [graphId, setGraphId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [homeToken, setHomeToken] = useState(0);
  const graphs = observed.run?.graphs || [];
  const graph = graphs.find((item) => item.graph_id === graphId) || graphs[0] || null;
  const node = selected && graph && selected.graph_id === graph.graph_id ? graph.nodes.find((item) => item.node_id === selected.node_id) : null;
  const tokens = overlay_tokens(isDark);
  const titleBarInset = typeof window !== "undefined" && window.runtime?.isElectron === true && windowStateBridge.isActionAvailable() ? TOP_BAR_HEIGHT : 0;
  const layoutKey = graph ? JSON.stringify(["run-observation", scope.owner_chat_id, scope.execution_id,
    observed.run.generation_id, observed.run.root_run_id, graph.graph_id]) : null;
  /* The ids that name this run are for a bug report, not for reading: they
     sit on the title's tooltip. */
  const identity = observed.run
    ? t("agents.run_view.identity_with_root", { chat: scope.owner_chat_id, execution: scope.execution_id, root: observed.run.root_run_id })
    : t("agents.run_view.identity", { chat: scope.owner_chat_id, execution: scope.execution_id });
  const small = { fontSize: 11, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6 };
  return (
    /* The graph takes the whole page, as the editor's canvas does; the card
       floats over its top-left, past the open side menu, so nothing of it is
       hidden underneath. */
    <div data-testid="skeleton-run-observation-view" style={{ position: "absolute", inset: 0 }}>
      {graph && <div style={{ position: "absolute", inset: 0, display: "flex" }}><SkeletonCanvas resourceId={layoutKey} commandScope="run-observation" document={graph.document}
        readOnly observation={graph} isDark={isDark} managedSources={NO_SOURCES} homeToken={homeToken}
        onSelectNode={(node_id) => setSelected({ graph_id: graph.graph_id, node_id })} /></div>}
      <div data-testid="run-observation-card" style={{ position: "absolute", top: 0, left: leftInset, margin: `${titleBarInset + 16}px 0 0`,
        width: 380, maxWidth: "calc(100% - 28px)", maxHeight: "45%", overflowY: "auto", zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
        display: "flex", flexDirection: "column", gap: 7, padding: 12, borderRadius: 10, boxSizing: "border-box",
        background: tokens.background, border: tokens.border, backdropFilter: tokens.backdrop, boxShadow: tokens.shadow }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Button label={t("agents.run_view.back_to_editor")} prefix_icon="arrow_left" onClick={onClose}
            style={{ fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 9, borderRadius: 6 }} />
          <strong title={identity} style={{ fontSize: 12.5, flex: 1, minWidth: 0 }}>{t("agents.run_view.title")}</strong>
          {graph && <Button ariaLabel={t("agents.run_view.center_graph")} title={t("agents.run_view.center_graph")} prefix_icon="target"
            onClick={() => setHomeToken((v) => v + 1)} style={small} />}
          <Button ariaLabel={observed.refreshing ? t("agents.run_view.reading") : t("agents.run_view.refresh")}
            title={t("agents.run_view.refresh")} prefix_icon="refresh" disabled={observed.refreshing} onClick={observed.refresh} style={small} />
        </div>
        <span style={{ fontSize: 11.5, lineHeight: 1.5 }}>{t("agents.run_view.explain")}</span>
        {observed.error && <div data-testid="run-observation-error" role="alert" style={{ fontSize: 11, lineHeight: 1.45 }}>
          {renderAgentMessage(observed.errorCaption || observed.error, t)}{graph ? t("agents.run_view.last_snapshot_notice") : ""}
        </div>}
        {observed.phase === "loading" && <span role="status" style={{ fontSize: 11 }}>{t("agents.run_view.reading_run")}</span>}
        {observed.phase === "empty" && <span role="status" style={{ fontSize: 11 }}>{t("agents.run_view.no_matching_run")}</span>}
        {graph && <>
          {/* Only a run that went into a subagent or a called Workflow has
              more than one graph to choose from. */}
          {graphs.length > 1 && <div data-testid="run-observation-graph-picker" style={{ width: "100%" }}>
            <Select value={graph.graph_id} set_value={(id) => { if (graphs.some((item) => item.graph_id === id)) { setGraphId(id); setSelected(null); } }}
              filterable={false} placeholder={t("agents.run_view.graph_invocation")} options={graphs.map((item) => ({ value: item.graph_id,
                label: item.caller_node_id === null
                  ? t("agents.run_view.graph_root_option", { name: item.document.name, graph: item.graph_id })
                  : t("agents.run_view.graph_child_option", { name: item.document.name, caller: item.caller_node_id, graph: item.graph_id }) }))}
              style={{ height: 28, fontSize: 11 }} />
          </div>}
          {graph.error && <span role="alert" style={{ fontSize: 11 }}>{graph.error.code} · {graph.error.path.join(".")}</span>}
          {graph.skipped_edges.length > 0 && <span data-testid="run-observation-skipped" style={{ fontSize: 11, opacity: 0.65 }}>
            {t("agents.run_view.skipped_paths", { paths: graph.skipped_edges.join(", ") })}
          </span>}
          {node && <span data-testid="run-observation-selected-node" style={{ fontSize: 11 }}>
            {node.node_id}: {run_status_caption(node, t)}{node.reason ? ` · ${node.reason}` : ""}
          </span>}
        </>}
      </div>
    </div>
  );
}
