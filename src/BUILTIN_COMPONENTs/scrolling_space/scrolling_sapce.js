import React, { useEffect, useContext } from "react";
import { ConfigContexts } from "../../CONTAINERs/config/contexts";

const ScrollingSpace = ({}) => {
  const { scrollingSapce, theme } = useContext(ConfigContexts);

  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
    .scrolling-space::-webkit-scrollbar {
      width: ${theme === "dark_theme" ? "8px" : "7px"};
    }
    .scrolling-space::-webkit-scrollbar-track {
      background-color: rgb(225, 225, 225, 0);
    }
    .scrolling-space::-webkit-scrollbar-thumb {
      background-color: ${scrollingSapce.vertical.backgroundColor};
      border-radius: 6px;
      border: ${scrollingSapce.vertical.border};
    }
    .scrolling-space::-webkit-scrollbar-thumb:hover {
    }
    .scrolling-space::-webkit-scrollbar:horizontal {
      display: none;
    }
    .horizontal-scrolling-space::-webkit-scrollbar {
      height: 7px;
    }
    .horizontal-scrolling-space::-webkit-scrollbar-track {
      background-color: rgb(225, 225, 225, 0);
    }
    .horizontal-scrolling-space::-webkit-scrollbar-thumb {
      background-color: ${scrollingSapce.horizontal.backgroundColor};
      border-radius: 8px;
    }
    .horizontal-scrolling-space::-webkit-scrollbar-thumb:hover {
    }
    .horizontal-scrolling-space::-webkit-scrollbar:vertical {
      display: none;
    }
    .h_2_scrolling-space::-webkit-scrollbar {
      height: ${theme === "dark_theme" ? "8px" : "7px"};
    }
    .h_2_scrolling-space::-webkit-scrollbar-track {
      background-color: rgb(225, 225, 225, 0);
    }
    .h_2_scrolling-space::-webkit-scrollbar-thumb {
      background-color: ${scrollingSapce.vertical.backgroundColor};
      border-radius: 6px;
      border: ${scrollingSapce.vertical.border};
    }
    .h_2_scrolling-space::-webkit-scrollbar-thumb:hover {
    }
    .h_2_scrolling-space::-webkit-scrollbar:vertical {
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
