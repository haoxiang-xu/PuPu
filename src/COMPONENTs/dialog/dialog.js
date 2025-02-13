import React, { useState, useContext, useEffect } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import ScrollingSpace from "../../BUILTIN_COMPONENTs/scrolling_space/scrolling_sapce";

import { await_Ollama_setup_warning } from "./default_dialogs";

const Button = ({ handle_button_click, label }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const [onHover, setOnHover] = useState(false);
  const [onClick, setOnClick] = useState(false);
  return (
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
        handle_button_click();
      }}
    >
      {label}
    </span>
  );
};
const DownloadOllamaModel = ({}) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  return (
    <div
      style={{
        position: "absolute",
        alignItems: "center",

        padding: 6,
        margin: 64,

        width: 460,
        height: 284,

        borderRadius: 10,
        border: `1px solid rgba(225, 225, 225, 0.16)`,

        backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.64)`,
        backdropFilter: "blur(16px)",
      }}
    >

    </div>
  );
};
const AwaitOllamaSetup = ({}) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { app_initialization } = useContext(DataContexts);
  const { setOllamaServerStatus } = useContext(StatusContexts);

  const [onHover, setOnHover] = useState(false);
  const [onClick, setOnClick] = useState(false);

  const handle_button_click = () => {
    setOllamaServerStatus(null);
    app_initialization();
  };

  return (
    <div
      style={{
        position: "absolute",
        alignItems: "center",

        padding: 6,
        margin: 64,

        height: "calc(100% - 128px)",
        width: 460,
        height: 284,

        borderRadius: 10,
        border: `1px solid rgba(225, 225, 225, 0.16)`,

        backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.64)`,
        backdropFilter: "blur(16px)",
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
        <Button
          handle_button_click={handle_button_click}
          label={"I am ready! ✔️"}
        />
      </div>
    </div>
  );
};

const Dialog = () => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { onDialog } = useContext(StatusContexts);

  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    switch (onDialog) {
      case "await_ollama_setup_warning":
        setDialog(<AwaitOllamaSetup />);
        break;
      case "download_ollama_model":
        setDialog(<DownloadOllamaModel />);
        break;
      default:
        setDialog(null);
        break;
    }
  }, [onDialog]);

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

        backgroundColor: "rgba(0, 0, 0, 0.32)",

        opacity: onDialog !== "" ? 1 : 0,
        pointerEvents: onDialog !== "" ? "auto" : "none",
      }}
    >
      <div
        className="dialog-container"
        style={{
          transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: onDialog !== "" ? 0 : -64,
          left: 0,

          height: "100%",
          width: "100%",

          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {dialog}
      </div>
      <ScrollingSpace />
    </div>
  );
};

export default Dialog;
