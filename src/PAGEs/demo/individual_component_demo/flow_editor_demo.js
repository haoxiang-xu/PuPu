import { useState, useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import { FlowEditor } from "../../../BUILTIN_COMPONENTs/flow_editor";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const NODE_ACCENTS = {
  start: "#22c55e",
  agent: "#2563eb",
  tool: "#f59e0b",
  output: "#ec4899",
};

const FlowEditorDemo = () => {
  const { theme } = useContext(ConfigContext);

  const [nodes, setNodes] = useState([
    {
      id: "start",
      x: 60,
      y: 140,
      type: "start",
      label: "Start",
      ports: [{ id: "right", side: "right" }],
    },
    {
      id: "agent",
      x: 300,
      y: 80,
      type: "agent",
      label: "LLM Agent",
      ports: [
        { id: "left", side: "left" },
        { id: "right", side: "right" },
        { id: "bottom", side: "bottom" },
      ],
    },
    {
      id: "tool",
      x: 300,
      y: 260,
      type: "tool",
      label: "Tool Call",
      ports: [
        { id: "top", side: "top" },
        { id: "right", side: "right" },
      ],
    },
    {
      id: "output",
      x: 580,
      y: 140,
      type: "output",
      label: "Output",
      ports: [
        { id: "left_0", side: "left" },
        { id: "left_1", side: "left" },
      ],
    },
  ]);

  const [edges, setEdges] = useState([
    {
      id: "e1",
      source_node_id: "start",
      source_port_id: "right",
      target_node_id: "agent",
      target_port_id: "left",
    },
    {
      id: "e2",
      source_node_id: "agent",
      source_port_id: "bottom",
      target_node_id: "tool",
      target_port_id: "top",
    },
    {
      id: "e3",
      source_node_id: "agent",
      source_port_id: "right",
      target_node_id: "output",
      target_port_id: "left_0",
    },
    {
      id: "e4",
      source_node_id: "tool",
      source_port_id: "right",
      target_node_id: "output",
      target_port_id: "left_1",
    },
  ]);

  const handle_connect = (connection) => {
    const exists = edges.some(
      (e) =>
        e.source_node_id === connection.source_node_id &&
        e.source_port_id === connection.source_port_id &&
        e.target_node_id === connection.target_node_id &&
        e.target_port_id === connection.target_port_id,
    );
    if (exists) return;
    setEdges((prev) => [...prev, { id: `e-${Date.now()}`, ...connection }]);
  };

  const handle_edge_add_node = (edge, midpoint) => {
    const new_id = `node-${Date.now()}`;
    const new_node = {
      id: new_id,
      x: midpoint.x - 60,
      y: midpoint.y - 25,
      type: "agent",
      label: "New Node",
      ports: [
        { id: "left", side: "left" },
        { id: "right", side: "right" },
      ],
    };

    /* Remove the original edge and create two new edges wiring through the new node */
    setNodes((prev) => [...prev, new_node]);
    setEdges((prev) => [
      ...prev.filter((e) => e.id !== edge.id),
      {
        id: `e-${Date.now()}-a`,
        source_node_id: edge.source_node_id,
        source_port_id: edge.source_port_id,
        target_node_id: new_id,
        target_port_id: "left",
      },
      {
        id: `e-${Date.now()}-b`,
        source_node_id: new_id,
        source_port_id: "right",
        target_node_id: edge.target_node_id,
        target_port_id: edge.target_port_id,
      },
    ]);
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        gap: "24px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily: "Jost",
          color: theme?.color || "black",
          userSelect: "none",
          WebkitUserSelect: "none",
          MozUserSelect: "none",
          msUserSelect: "none",
        }}
      >
        Flow Editor
      </span>

      <div
        style={{
          width: "100%",
          height: 480,
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <FlowEditor
          nodes={nodes}
          edges={edges}
          on_nodes_change={setNodes}
          on_edges_change={setEdges}
          on_connect={handle_connect}
          on_edge_add_node={handle_edge_add_node}
          render_node={(node) => {
            const accent = NODE_ACCENTS[node.type] || theme?.color || "#888";
            return (
              <div
                style={{
                  padding: "14px 22px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: accent,
                    boxShadow: `0 0 6px ${accent}`,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "Jost, sans-serif",
                    fontSize: 14,
                    fontWeight: 500,
                    color: theme?.color || "black",
                    whiteSpace: "nowrap",
                  }}
                >
                  {node.label || node.id}
                </span>
              </div>
            );
          }}
        />
      </div>

      <div
        style={{
          width: "100%",
          fontFamily: "Jost, sans-serif",
          fontSize: 13,
          color: theme?.color || "black",
          opacity: 0.35,
          userSelect: "none",
          lineHeight: 1.6,
        }}
      >
        Drag nodes to move &nbsp;•&nbsp; Scroll to zoom &nbsp;•&nbsp; Drag
        background to pan &nbsp;•&nbsp; Drag from ports to connect &nbsp;•&nbsp;
        Hover edge to add node &nbsp;•&nbsp; Click edge or node + Delete to
        remove
      </div>
    </div>
  );
};

export { FlowEditorDemo as default };
