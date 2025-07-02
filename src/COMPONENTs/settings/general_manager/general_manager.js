import { useState, useContext, useEffect } from "react";
import { ConfigContexts } from "../../../CONTAINERs/config/contexts";

const GeneralManager = () => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const [position, setPosition] = useState({
    title_left: -32,
  });

  useEffect(() => {
    setPosition({
      title_left: 2,
    });
  }, []);  
                

  return (
    <div
      className="scrolling-space"
      style={{
        position: "absolute",
        top: 6,
        left: 0,
        right: 6,
        bottom: 6,
        overflowX: "hidden",
      }}
    >
      <span
        style={{
          transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 6,
          left: position.title_left,
          fontSize: 32,
          fontFamily: "inherit",
          color: `rgb(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font})`,
          userSelect: "none",
          pointerEvents: "none",
          border: "1px solid rgba(0, 0, 0, 0)",
          padding: "1px 0px",
        }}
      >
        Theme
      </span>
    </div>
  );
};

export default GeneralManager;
