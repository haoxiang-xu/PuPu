import React, { useEffect, useContext } from "react";
import { ConfigContexts } from "../../CONTAINERs/config/contexts";

const ScrollingSpace = ({}) => {
  const { scrollingSapce } = useContext(ConfigContexts);

  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
    .scrolling-space::-webkit-scrollbar {
      width: 8px;
    }
    .scrolling-space::-webkit-scrollbar-track {
      background-color: rgb(225, 225, 225, 0);
    }
    .scrolling-space::-webkit-scrollbar-thumb {
      background-color: ${scrollingSapce.backgroundColor};
      border-radius: 6px;
      border: ${scrollingSapce.border};
    }
    .scrolling-space::-webkit-scrollbar-thumb:hover {
    }
    .scrolling-space::-webkit-scrollbar:horizontal {
      display: none;
    }
  `;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [scrollingSapce]);
};

export default ScrollingSpace;
