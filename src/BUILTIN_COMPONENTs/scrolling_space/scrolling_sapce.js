import React, { useEffect } from "react";

const ScrollingSpace = ({}) => {
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
              .scrolling-space::-webkit-scrollbar {
                width: 8px; /* Custom width for the vertical scrollbar */
              }
              .scrolling-space::-webkit-scrollbar-track {
                background-color: rgb(225, 225, 225, 0); /* Scrollbar track color */
              }
              .scrolling-space::-webkit-scrollbar-thumb {
                background-color: rgb(225, 225, 225, 0.02);
                border-radius: 6px;
                border: 1px solid rgb(225, 225, 225, 0.16);
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
  }, []);
};

export default ScrollingSpace;
