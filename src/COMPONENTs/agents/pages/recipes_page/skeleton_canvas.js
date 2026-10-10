import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import AgentNode from "./nodes/agent_node";
import EndNode from "./nodes/end_node";
import StartNode from "./nodes/start_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import { ports_for_type } from "./recipe_node_catalog";
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
 * detail panel. */

function renderNode(node, isDark) {
  if (node.type === "agent") return <AgentNode node={node} isDark={isDark} />;
  if (node.type === "toolkit_pool") return <ToolPoolNode node={node} isDark={isDark} />;
  if (node.type === "subagent_pool") return <SubagentPoolNode node={node} isDark={isDark} />;
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
  document,
  onSelectNode,
  isDark,
}) {
  /* Read once per document identity: re-reading on every render would undo a
     drag the moment anything else re-rendered. */
  const [layoutKey] = useState(() => ({}));
  const stored = useMemo(
    () => readSkeletonLayout(resourceId, document),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resourceId, document, layoutKey],
  );
  const positions = useRef(stored.nodes);
  positions.current = { ...stored.nodes, ...positions.current };
  /* Bumped when a node is dropped. Without it the projection below would keep
     returning the positions it was memoized with, and the next re-render for
     any other reason would snap the node back to where it was dragged from. */
  const [moveTick, setMoveTick] = useState(0);

  const nodes = useMemo(
    () =>
      ((document && document.nodes) || []).map((node) => {
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
    [document, moveTick],
  );

  const edges = useMemo(() => (document && document.edges) || [], [document]);

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

  return (
    <div
      data-testid="skeleton-canvas"
      style={{ position: "relative", flex: 1, minHeight: 0 }}
      onMouseUp={rememberViewport}
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
        render_node={(node) => renderNode(node, isDark)}
        viewport_out_ref={viewportRef}
        restore_viewport={
          stored.viewport ? { ...stored.viewport, token: resourceId } : undefined
        }
        reset_focus_node_id={
          ((document && document.nodes) || []).find((n) => n.type === "start")?.id
        }
      />
    </div>
  );
}
