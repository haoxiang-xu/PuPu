import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import RecipeNodePalette from "./recipe_node_palette";
import { ADDABLE_NODE_TYPES } from "./skeleton_graph_edits";
import { node_toolkit_refs } from "./toolkit_pool_config";
import { branch_ports, branch_summary, is_branch_type } from "./skeleton_branch_config";
import { NATIVE_PALETTE_ENTRIES } from "./skeleton_node_catalog";
import BranchNode from "./nodes/branch_node";
import AgentNode from "./nodes/agent_node";
import EndNode from "./nodes/end_node";
import StartNode from "./nodes/start_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import { ports_for_type } from "./recipe_node_catalog";
import { own } from "./document_values";
import { NODE_TYPES, drawn_node } from "./skeleton_document";
import { pool_entry_rows } from "./skeleton_drill";
import {
  readSkeletonLayout,
  writeSkeletonNodePositions,
  writeSkeletonViewport,
} from "../../../../SERVICEs/skeleton_layout";

/* The graph, drawn.
 *
 * A Skeleton node carries no coordinate and the store refuses one, so the
 * picture comes from two places that are deliberately kept apart: the document
 * says what the graph IS, and `skeleton_layout` says where it is drawn. The
 * projection below is the only place they meet, and it only reads.
 *
 * So dragging a node cannot change execution — not because the handler is
 * careful, but because the handler has no route to the document. It writes
 * positions to the layout service and nothing else. Semantic edits use the
 * separate command callback; no drawing array can become a document.
 *
 * Which node is open is the page's business, not the canvas's: FlowEditor
 * keeps its own highlight, and `on_select` is what tells the page to open the
 * detail panel.
 *
 * Double-clicking a row on a Subagent Pool opens that subagent's graph. It is
 * reported to the page, which owns the drill stack; a row that cannot be
 * opened is reported too, with the reason, because an inert row reads as the
 * app being broken. Escape belongs to the page for the same reason, and
 * because it has to keep working while this canvas is not on screen — a
 * drilled-in resource whose re-read failed still has a breadcrumb. */

/* A table whose keys are node ids. Without a prototype, for the reason in
   `SERVICEs/skeleton_layout`: every id the envelope allows is then an own key
   of its own, and nothing can be read out of `Object.prototype` instead. */
const node_table = (from) => Object.assign(Object.create(null), from || undefined);

function renderNode(node, isDark, onOpenSubagent) {
  if (node.type === "agent") return <AgentNode node={node} isDark={isDark} />;
  if (node.type === "toolkit_pool") return <ToolPoolNode node={node} isDark={isDark} native toolkits={node_toolkit_refs(node)} />;
  if (node.type === "subagent_pool") {
    return (
      <SubagentPoolNode
        node={node}
        isDark={isDark}
        /* A Skeleton pool carries its entries in `config`, and a legacy one in
           `config.legacy_fields`; the legacy recipe canvas passes a node whose
           entries sit on `node.subagents`. The rows are resolved here rather
           than inside the node so the two shapes stay one drawing. */
        rows={pool_entry_rows(node)}
        onOpenRow={
          typeof onOpenSubagent === "function"
            ? (row) =>
                onOpenSubagent({
                  pool_node_id: node.id,
                  entry_id: row.entry_id,
                  /* Which row it was, as well as which entry it names: a
                     draft the store accepts can hold two entries with one
                     id, and the row the author clicked is the graph that
                     opens. */
                  entry_index: row.index,
                  reason: row.reason,
                })
            : undefined
        }
      />
    );
  }
  if (is_branch_type(node.type) && node.branch) {
    return <BranchNode node={node} rows={node.branch.rows} summary={node.branch.summary} isDark={isDark} />;
  }
  if (node.type === "start") return <StartNode isDark={isDark} />;
  if (node.type === "end") return <EndNode isDark={isDark} />;
  /* A type this build has no drawing for still has to appear: a graph that
     silently omitted a node would read as a graph that does not have it. */
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 11.5,
        fontFamily: "ui-monospace, Menlo, monospace",
        border: isDark ? "1px dashed rgba(255,255,255,0.25)" : "1px dashed rgba(0,0,0,0.2)",
      }}
    >
      {node.type}
    </div>
  );
}

/* One drawing per graph.
 *
 * Everything below holds state for the graph it is drawing: the positions it
 * has handed out, the viewport it was left at, the editor's own panning and
 * selection inside FlowEditor. The page keeps this component in place and
 * changes which graph it draws — drilling in and out — so that state has to
 * belong to the graph's identity rather than to the component's lifetime.
 *
 * It did not, and a parent and an embedded child with a node id in common
 * drew each other's positions: the child opened at the parent's coordinates,
 * dragging it moved the parent's node too, and the next drag in the parent
 * wrote the child's coordinate into the parent's layout. Nothing about either
 * Agent changed — a position never reaches the document — but two graphs lost
 * their own drawings.
 *
 * Being a separate component keyed by that identity is what makes this true
 * of FlowEditor's own state as well, which no prop of ours can reset; and the
 * viewport is written back on the way out by the instance that was panned, so
 * it lands under the graph it belonged to rather than the one now open. */
export default function SkeletonCanvas(props) {
  return <GraphDrawing key={JSON.stringify([props.resourceId, props.commandScope])} {...props} />;
}

function GraphDrawing({
  resourceId,
  document: graph,
  onSelectNode,
  onOpenSubagent,
  onGraphCommand,
  isDark,
}) {
  const canEdit = typeof onGraphCommand === "function" && graph?.kind === "agent" && graph?.schema_version === 1;
  const containerRef = useRef(null);
  const [palette, setPalette] = useState(null);
  const [menu, setMenu] = useState(null);
  const [problem, setProblem] = useState(null);
  const [fitToken, setFitToken] = useState(undefined);
  const [zoomToken, setZoomToken] = useState(undefined);
  const [selectToken, setSelectToken] = useState(undefined);
  /* Read once per document identity: re-reading on every render would undo a
     drag the moment anything else re-rendered. The graph's identity is this
     component's, so what is read here is only ever this graph's. */
  const [layoutKey] = useState(() => ({}));
  const stored = useMemo(
    () => readSkeletonLayout(resourceId, graph),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resourceId, graph, layoutKey],
  );
  /* Kept in a table with no prototype, because its keys are node ids and a
     node id is data: `__proto__` is a legal id the real store runs, and on a
     plain object the read answered with an inherited member and the write set
     a prototype instead of storing the drag. The layout service's own note
     has the measurements. */
  const positions = useRef(node_table(stored.nodes));
  positions.current = node_table({ ...stored.nodes, ...positions.current });
  /* Bumped when a node is dropped. Without it the projection below would keep
     returning the positions it was memoized with, and the next re-render for
     any other reason would snap the node back to where it was dragged from. */
  const [moveTick, setMoveTick] = useState(0);
  /* Bumped by the Home control, which centers this graph's own Start. */
  const [resetToken, setResetToken] = useState(0);

  const nodes = useMemo(
    () =>
      ((graph && graph.nodes) || []).map((node) => {
        const at = own(positions.current, node.id) || { x: 0, y: 0 };
        /* A branch's ports are its outlets, read from its own config (and from
           any edge still leaving through an outlet it no longer declares), so
           they cannot come from the per-type catalog. The rows travel with the
           drawing only; nothing here reaches the document. */
        const branch = is_branch_type(node && node.type) ? branch_ports(graph, node) : null;
        return {
          /* The node the store defines, not everything the JSON happens to
             hold beside it: the drawings below read a node's own `label` and
             `model`, which a Skeleton node does not have — see `drawn_node`.
             The three fields added here are this canvas's, and the document
             has no route to them. */
          ...drawn_node(node),
          x: at.x,
          y: at.y,
          /* Asked only about a type the schema names.
             `ports_for_type` reads a plain table with it, and a draft can
             hold `type: "__proto__"` — the real store saves that and reads it
             back verbatim, and refuses it at Run with `unknown_variant` — for
             which the table answers `Object.prototype`: an object, so it is
             handed over as the port list, and the editor's `ports.forEach`
             then throws. A type this build has no drawing for has no ports
             here either way, and it is still drawn by its own type.
             The catalog's own read is shared with the legacy canvas and is
             not this slice's to change. */
          ports: branch ? branch.ports : NODE_TYPES.includes(node.type) ? ports_for_type(node.type) : [],
          ...(branch ? { branch: { rows: branch.rows, readable: branch.readable, summary: branch_summary(node) } } : {}),
          deletable: canEdit && node.type !== "start" && node.type !== "end",
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, moveTick, canEdit],
  );

  const edges = useMemo(() => (graph && graph.edges) || [], [graph]);

  /* The only write this component makes, and it goes to the layout service. */
  const handleNodesChange = useCallback(
    (next) => {
      const moved = node_table();
      (next || []).forEach((node) => {
        if (!node || !node.id) return;
        moved[node.id] = { x: node.x, y: node.y };
      });
      positions.current = node_table({ ...positions.current, ...moved });
      writeSkeletonNodePositions(resourceId, moved);
      setMoveTick((tick) => tick + 1);
    },
    [resourceId],
  );

  const viewportRef = useRef(stored.viewport || { x: 0, y: 0, zoom: 1 });
  const rememberViewport = useCallback(() => {
    writeSkeletonViewport(resourceId, viewportRef.current);
  }, [resourceId]);

  const perform = useCallback((command) => {
    const result = onGraphCommand(command);
    setProblem(result.ok ? null : result.problem?.message || "This edit was refused.");
    if (result.ok && command.type === "delete" && command.node_ids.length) onSelectNode?.(null);
    return result;
  }, [onGraphCommand, onSelectNode]);

  const openPalette = useCallback((point) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const clientX = point?.client_x ?? (rect?.left || 0) + 180;
    const clientY = point?.client_y ?? (rect?.top || 0) + 100;
    const vp = viewportRef.current;
    setMenu(null);
    setPalette({ x: clientX, y: clientY,
      canvas_x: point?.canvas_x ?? (clientX - (rect?.left || 0) - vp.x) / vp.zoom,
      canvas_y: point?.canvas_y ?? (clientY - (rect?.top || 0) - vp.y) / vp.zoom });
  }, []);
  const pickNode = useCallback((type) => {
    const result = perform({ type: "add_node", node_type: type });
    if (result.ok) {
      const node = result.document.nodes[result.document.nodes.length - 1];
      const at = { x: palette.canvas_x, y: palette.canvas_y };
      positions.current[node.id] = at;
      writeSkeletonNodePositions(resourceId, { [node.id]: at });
      setMoveTick((tick) => tick + 1);
      onSelectNode?.(node.id);
      setPalette(null);
    }
  }, [onSelectNode, palette, perform, resourceId]);

  const contextItems = useMemo(() => {
    if (!menu) return [];
    const target = menu.target;
    if (target.kind === "node") {
      const node = nodes.find((entry) => entry.id === target.id);
      const attached = edges.some((edge) => edge.source_node_id === target.id || edge.target_node_id === target.id);
      return [
        { id: "open", label: "Open details", onClick: () => onSelectNode?.(target.id) },
        { id: "disconnect", label: "Disconnect node", disabled: !attached, onClick: () => perform({ type: "disconnect", node_id: target.id }) },
        { type: "separator" },
        { id: "delete", label: node?.deletable ? "Delete node" : "Required node", disabled: !node?.deletable, danger: true,
          onClick: () => perform({ type: "delete", node_ids: [target.id], edge_ids: [] }) },
      ];
    }
    if (target.kind === "edge") return [{ id: "delete", label: "Delete connection", danger: true,
      onClick: () => perform({ type: "delete", node_ids: [], edge_ids: [target.id] }) }];
    return [
      { id: "add", label: "Add node…", onClick: () => openPalette(menu) },
      { type: "separator" },
      { id: "select", label: "Select all", onClick: () => setSelectToken((t) => (t || 0) + 1) },
      { id: "fit", label: "Fit graph", onClick: () => setFitToken((t) => (t || 0) + 1) },
      { id: "zoom", label: "Reset zoom", onClick: () => setZoomToken((t) => (t || 0) + 1) },
    ];
  }, [edges, menu, nodes, onSelectNode, openPalette, perform]);

  /* A zoom is a wheel gesture and produces no mouseup, so remembering on
     mouseup alone kept every pan and lost every zoom. Both gestures are
     watched, and leaving is the last chance for whatever the final one was. */
  const resourceRef = useRef(resourceId);
  resourceRef.current = resourceId;
  useEffect(
    () => () => {
      writeSkeletonViewport(resourceRef.current, viewportRef.current);
    },
    [],
  );

  /* Home centers this graph's own Start — a sub-graph opened by drilling in
     need not name its start node `start`, so it is found by type. The key is
     bound here as well as the control: the acceptance names Home, and the
     legacy canvas's Home has only ever been a button. */
  const startNodeId = useMemo(
    () => ((graph && graph.nodes) || []).find((node) => node.type === "start")?.id,
    [graph],
  );
  const center = useCallback(() => setResetToken((token) => token + 1), []);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Home") return;
      const tag = window.document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      event.preventDefault();
      center();
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [center]);

  return (
    <div
      ref={containerRef}
      data-testid="skeleton-canvas"
      style={{ position: "relative", flex: 1, minHeight: 0 }}
      onMouseUp={rememberViewport}
      onWheel={rememberViewport}
      onDoubleClick={canEdit ? (event) => {
        if (event.target.closest?.("[data-flow-node-id], [data-flow-edge-id], button")) return;
        openPalette({ client_x: event.clientX, client_y: event.clientY });
      } : undefined}
    >
      <FlowEditor
        style={{ width: "100%", height: "100%", borderRadius: 0 }}
        theme={{
          canvasBackground: "var(--pupu-background)",
          gridColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
          nodeBackground: "transparent",
          nodeShadow: "none",
          nodeShadowHover: "none",
          nodeSelectedBorder: "transparent",
          portShape: "puzzle",
          portColor: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.22)",
          edgeColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)",
          edgeActiveColor: "#4a5bd8",
          edgeWidth: 1.6,
        }}
        nodes={nodes}
        edges={edges}
        on_select={onSelectNode}
        on_nodes_change={handleNodesChange}
        on_connect={canEdit ? (connection) => perform({ type: "connect", connection }) : undefined}
        on_delete={canEdit ? (selection) => perform({ type: "delete", ...selection }) : undefined}
        on_reconnect={canEdit ? (selection) => perform({ type: "reconnect", ...selection }) : undefined}
        on_context_menu={canEdit ? (info) => { setPalette(null); setMenu(info); } : undefined}
        render_node={(node) => renderNode(node, isDark, onOpenSubagent)}
        viewport_out_ref={viewportRef}
        restore_viewport={
          stored.viewport ? { ...stored.viewport, token: resourceId } : undefined
        }
        reset_token={resetToken}
        reset_focus_node_id={startNodeId}
        fit_token={fitToken}
        zoom_reset_token={zoomToken}
        select_all_token={selectToken}
      />
      {problem && <div data-testid="skeleton-graph-problem" role="alert" style={{ position: "absolute", bottom: 8, left: 8, right: 8, padding: "8px 12px", borderRadius: 8, background: "var(--pupu-surface)", fontSize: 12 }}>{problem}</div>}
      <RecipeNodePalette visible={canEdit && !!palette} x={palette?.x || 0} y={palette?.y || 0}
        allowedTypes={ADDABLE_NODE_TYPES} entries={NATIVE_PALETTE_ENTRIES} onPick={pickNode} onClose={() => setPalette(null)} isDark={isDark} />
      <ContextMenu visible={canEdit && !!menu} x={menu?.client_x || 0} y={menu?.client_y || 0}
        items={contextItems} onClose={() => setMenu(null)} isDark={isDark} />
      <span
        style={{ position: "absolute", top: 8, right: 8, display: "inline-flex", gap: 6 }}
      >
        {canEdit && <Button label="Add node…" ariaLabel="Add node" onClick={() => openPalette()} />}
        <Button label="Fit" ariaLabel="Fit graph" onClick={() => setFitToken((t) => (t || 0) + 1)} />
        <Button
          prefix_icon="home"
          ariaLabel="Center this graph"
          onClick={center}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 8,
            borderRadius: 7,
            opacity: 0.7,
            content: { icon: { width: 13, height: 13 } },
          }}
        />
      </span>
    </div>
  );
}
