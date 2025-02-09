import React, { useEffect, useState, useCallback, useContext } from "react";

import { RootDataContexts } from "../../DATA_MANAGERs/root_data_manager/root_data_contexts";
import { RootConfigContexts } from "../../DATA_MANAGERs/root_config_manager/root_config_contexts";

import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";

import { await_Ollama_setup_warning } from "./default_warnings";

const AwaitOllamaSetup = ({}) => {
  const { RGB, colorOffset } = useContext(RootConfigContexts);
  const { app_initialization, setIsOllamaRunning } =
    useContext(RootDataContexts);

  const [onHover, setOnHover] = useState(false);
  const [onClick, setOnClick] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        alignItems: "center",

        padding: 6,
        margin: 64,

        maxWidth: 512,
        height: "calc(100% - 128px)",

        borderRadius: 10,
        border: `1px solid rgba(225, 225, 225, 0.16)`,

        backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
      }}
    >
      <div
        className="scrolling-space"
        style={{
          maxHeight: "100%",
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        <Markdown
          style={{
            backgroundColor: `rgba(0, 0, 0, 0)`,
          }}
        >
          {await_Ollama_setup_warning}
        </Markdown>
        <span
          style={{
            transition: "border 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            userSelect: "none",
            display: "block",
            padding: 8,
            margin: 8,
            textAlign: "center",
            borderRadius: 6,
            backgroundColor: onClick
              ? `rgba(${RGB.R + colorOffset.middle_ground}, ${
                  RGB.G + colorOffset.middle_ground
                }, ${RGB.B + colorOffset.middle_ground}, 1)`
              : onHover
              ? `rgba(${RGB.R + colorOffset.middle_ground}, ${
                  RGB.G + colorOffset.middle_ground
                }, ${RGB.B + colorOffset.middle_ground}, 0.64)`
              : `rgba(${RGB.R + colorOffset.middle_ground}, ${
                  RGB.G + colorOffset.middle_ground
                }, ${RGB.B + colorOffset.middle_ground}, 0.64)`,

            border: onClick
              ? `1px solid rgba(225, 225, 225, 0.32)`
              : onHover
              ? `1px solid rgba(225, 225, 225, 0.16)`
              : `1px solid rgba(225, 225, 225, 0)`,
            color: `rgba(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 1)`,
          }}
          onMouseEnter={() => {
            setOnHover(true);
          }}
          onMouseLeave={() => {
            setOnHover(false);
            setOnClick(false);
          }}
          onMouseDown={() => {
            setOnClick(true);
          }}
          onMouseUp={() => {
            setOnClick(false);
          }}
          onClick={() => {
            setIsOllamaRunning(null);
            app_initialization();
          }}
        >
          I am ready!
        </span>
      </div>
    </div>
  );
};

const WarningScreen = ({ display }) => {
  const { RGB, colorOffset } = useContext(RootConfigContexts);

  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
          .scrolling-space::-webkit-scrollbar {
            width: 12px; /* Custom width for the vertical scrollbar */
          }
    
          .scrolling-space::-webkit-scrollbar-track {
            background-color: rgba(${RGB.R}, ${RGB.G}, ${
      RGB.B
    }, 1); /* Scrollbar track color */
          }
    
          .scrolling-space::-webkit-scrollbar-thumb {
            background-color: rgba(${RGB.R + colorOffset.middle_ground}, ${
      RGB.G + colorOffset.middle_ground
    }, ${RGB.B + colorOffset.middle_ground}, 1);
            border-radius: 6px;
            border: 3px solid rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1);
          }
          .scrolling-space::-webkit-scrollbar-thumb:hover {
            background-color: rgba(${RGB.R + colorOffset.middle_ground + 32}, ${
      RGB.G + colorOffset.middle_ground + 32
    }, ${RGB.B + colorOffset.middle_ground + 32}, 1);
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

  return (
    <div
      className="scrolling-space"
      style={{
        transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",

        backgroundColor: "rgba(0, 0, 0, 0.32)",
        backdropFilter: "blur(3px)",

        opacity: display ? 1 : 0,
        pointerEvents: display ? "auto" : "none",
      }}
    >
      <AwaitOllamaSetup />
    </div>
  );
};

export default WarningScreen;
