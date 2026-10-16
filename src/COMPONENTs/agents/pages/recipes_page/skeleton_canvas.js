import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import AgentNode from "./nodes/agent_node";
import EndNode from "./nodes/end_node";
import StartNode from "./nodes/start_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import { ports_for_type } from "./recipe_node_catalog";
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
 * Two gestures belong to the subagent drill-in: double-clicking a row on a
 * Subagent Pool opens that subagent's graph, and Escape goes back up. Both are
 * reported to the page, which owns the stack; a row that cannot be opened is
 * reported too, with the reason, because an inert row reads as the app being
 * broken. */

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

export default function SkeletonCanvas({
  resourceId,
  document: graph,
  onSelectNode,
  onOpenSubagent,
  onEscape,
  isDark,
}) {
  /* Read once per document identity: re-reading on every render would undo a
     drag the moment anything else re-rendered. */
  const [layoutKey] = useState(() => ({}));
  const stored = useMemo(
    () => readSkeletonLayout(resourceId, graph),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resourceId, graph, layoutKey],
  );
  const positions = useRef(stored.nodes);
  positions.current = { ...stored.nodes, ...positions.current };
  /* Bumped when a node is dropped. Without it the projection below would keep
     returning the positions it was memoized with, and the next re-render for
     any other reason would snap the node back to where it was dragged from. */
  const [moveTick, setMoveTick] = useState(0);
  /* Bumped by the Home control, which centers this graph's own Start. */
  const [resetToken, setResetToken] = useState(0);

  const nodes = useMemo(
    () =>
      ((graph && graph.nodes) || []).map((node) => {
        const at = positions.current[node.id] || { x: 0, y: 0 };
        return {
          ...node,
          x: at.x,
          y: at.y,
          ports: ports_for_type(node.type),
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
      const moved = {};
      (next || []).forEach((node) => {
        if (!node || !node.id) return;
        moved[node.id] = { x: node.x, y: node.y };
      });
      positions.current = { ...positions.current, ...moved };
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

  /* Escape goes up one drill level before it reaches the Agents modal.
     Registered on `document`, where a bubble listener still precedes the
     modal's `window` one, so stopping propagation here shadows it — the same
     mechanism the legacy canvas uses. With no drill open the page answers
     false and the key passes through untouched. */
  useEffect(() => {
    if (typeof onEscape !== "function") return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      const tag = window.document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (onEscape() === true) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [onEscape]);

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
