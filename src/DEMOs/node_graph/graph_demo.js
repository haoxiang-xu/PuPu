import React, { useState, useRef, useEffect } from "react";

const NodeGraph = () => {
  const canvasRef = useRef(null);

  const [nodes, setNodes] = useState([
    { id: 1, x: 300, y: 300, width: 50, height: 50 },
    { id: 2, x: 300, y: 600, width: 50, height: 50 },
  ]);
  const [edges, setEdges] = useState([]);

  const [onNodeDragging, setOnNodeDragging] = useState(null);
  const handle_node_dragging = (e, node) => {
    if (onNodeDragging === node.id) {
      const newNodes = nodes.map((n) => {
        if (n.id === node.id) {
          return {
            ...n,
            x: e.clientX - n.width / 2,
            y: e.clientY - n.height / 2,
          };
        }
        return n;
      });
      setNodes(newNodes);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = 2000;
    canvas.height = 2000;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#007bff";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const [node1, node2] = nodes;
      const startX = node1.x + node1.width;
      const startY = node1.y + node1.height / 2;
      const endX = node2.x;
      const endY = node2.y + node2.height / 2;

      const cp1x = startX + 50;
      const cp1y = startY;
      const cp2x = endX - 50;
      const cp2y = endY;

      ctx.moveTo(startX, startY);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
      ctx.stroke();

      nodes.forEach((node) => {
        ctx.fillStyle = "#cccccc00";
        ctx.fillRect(node.x, node.y, node.width, node.height);
      });
    };

    draw();
  }, [nodes]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 2000,
          height: 2000,

          pointerEvents: "none",
        }}
      ></canvas>
      {nodes.map((node) => (
        <div
          key={node.id}
          onMouseDown={(e) => {
            setOnNodeDragging(node.id);
          }}
          onMouseUp={() => {
            setOnNodeDragging(null);
          }}
          onMouseLeave={() => {
            setOnNodeDragging(null);
          }}
          onMouseMove={(e) => {
            handle_node_dragging(e, node);
          }}
          style={{
            zIndex: onNodeDragging === node.id? 6 : -6,
            position: "absolute",
            width: node.width,
            height: node.height,
            backgroundColor: "#cccccc",
            top: node.y,
            left: node.x,
            cursor: "grab",
          }}
        ></div>
      ))}
    </>
  );
};

export default NodeGraph;
