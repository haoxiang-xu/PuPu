import { useState, useRef, useEffect } from "react";

const NodeGraph = () => {
  const canvasRef = useRef(null);
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const [nodes, setNodes] = useState([
    { id: 1, x: 300, y: 300, width: 50, height: 50 },
    { id: 2, x: 300, y: 600, width: 50, height: 50 },
  ]);
  const [edges, setEdges] = useState([
    {
      from: { id: 1, position: { x: 25, y: 0, direction: "top" } },
      to: { id: 2, position: { x: 25, y: 50, direction: "bottom" } },
    },
  ]);

  const [onNodeDragging, setOnNodeDragging] = useState(null);
  const handle_node_dragging = (e) => {
    if (onNodeDragging) {
      const newNodes = nodes.map((n) => {
        if (n.id === onNodeDragging) {
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
    canvas.width = windowSize.width;
    canvas.height = windowSize.height;

    edges.forEach((edge) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "#007bff";
      ctx.lineWidth = 2;
      ctx.beginPath();

      const node1 = nodes.find((n) => n.id === edge.from.id);
      const node2 = nodes.find((n) => n.id === edge.to.id);

      const startX = node1.x + edge.from.position.x;
      const startY = node1.y + edge.from.position.y;
      const endX = node2.x + edge.to.position.x;
      const endY = node2.y + edge.to.position.y;

      const dx = endX - startX;
      const dy = endY - startY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const curve_percentage = distance / 2;

      let cp1x = startX;
      let cp1y = startY + curve_percentage;
      let cp2x = endX;
      let cp2y = endY - curve_percentage;

      ctx.moveTo(startX, startY);

      if (distance < 50) {
        ctx.lineTo(endX, endY);
      } else {
        switch (edge.from.position.direction) {
          case "bottom":
            cp1x = startX;
            cp1y = startY + curve_percentage;
            break;
          case "top":
            cp1x = startX;
            cp1y = startY - curve_percentage;
            break;
          case "left":
            cp1x = startX - curve_percentage;
            cp1y = startY;
            break;
          case "right":
            cp1x = startX + curve_percentage;
            cp1y = startY;
            break;
          default:
            break;
        }
        switch (edge.to.position.direction) {
          case "bottom":
            cp2x = endX;
            cp2y = endY + curve_percentage;
            break;
          case "top":
            cp2x = endX;
            cp2y = endY - curve_percentage;
            break;
          case "left":
            cp2x = endX - curve_percentage;
            cp2y = endY;
            break;
          case "right":
            cp2x = endX + curve_percentage;
            cp2y = endY;
            break;
          default:
            break;
        }
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
      }
      ctx.stroke();
    });
  }, [nodes, edges, windowSize]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",

          pointerEvents: "none",
          overflow: "hidden",
        }}
      ></canvas>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
        onMouseMove={(e) => {
          handle_node_dragging(e);
        }}
        onMouseLeave={() => {
          setOnNodeDragging(null);
        }}
      >
        {nodes.map((node) => (
          <div
            key={node.id}
            onMouseDown={(e) => {
              setOnNodeDragging(node.id);
            }}
            onMouseUp={() => {
              setOnNodeDragging(null);
            }}
            style={{
              zIndex: onNodeDragging === node.id ? 12 : 6,
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
      </div>
    </>
  );
};

export default NodeGraph;
