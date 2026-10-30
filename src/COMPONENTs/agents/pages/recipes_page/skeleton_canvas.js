import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
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
 * positions to the layout service and nothing else, and the caller is given no
 * node-change callback to mistake for one.
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
  if (node.type === "toolkit_pool") return <ToolPoolNode node={node} isDark={isDark} />;
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
  return <GraphDrawing key={props.resourceId} {...props} />;
}

function GraphDrawing({
  resourceId,
  document: graph,
  onSelectNode,
  onOpenSubagent,
  isDark,
}) {
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
          ports: NODE_TYPES.includes(node.type) ? ports_for_type(node.type) : [],
          /* Nothing on this canvas edits the graph, so the Delete key has no
             node to act on. */
          deletable: false,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, moveTick],
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
      data-testid="skeleton-canvas"
      style={{ position: "relative", flex: 1, minHeight: 0 }}
      onMouseUp={rememberViewport}
      onWheel={rememberViewport}
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
        render_node={(node) => renderNode(node, isDark, onOpenSubagent)}
        viewport_out_ref={viewportRef}
        restore_viewport={
          stored.viewport ? { ...stored.viewport, token: resourceId } : undefined
        }
        reset_token={resetToken}
        reset_focus_node_id={startNodeId}
      />
      <span
        title="Center"
        style={{ position: "absolute", top: 8, right: 8, display: "inline-flex" }}
      >
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
