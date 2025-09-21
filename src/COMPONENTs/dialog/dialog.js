import { useState, useContext, useEffect } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import ScrollingSpace from "../../BUILTIN_COMPONENTs/scrolling_space/scrolling_sapce";
import Language_Model_Manager from "../settings/language_model_manager/language_model_manager";
import Settings from "../settings/settings";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

import { await_Ollama_setup_warning } from "./default_dialogs";
import { available_large_language_models } from "../../COMPONENTs/settings/ollama";

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

/* { image_viewer } -------------------------------------------------------------------------------------------------------------- */
const Image_Viewer = ({}) => {
  const { RGB, colorOffset, dialog } = useContext(ConfigContexts);
  const { onDialog, setOnDialog } = useContext(StatusContexts);

  const [isLoaded, setIsLoaded] = useState(false);
  const [imageBase64, setImageBase64] = useState(null);
  useEffect(() => {
    if (onDialog.split("|")[1] !== undefined) {
      setImageBase64(onDialog.split("|")[1]);
    }
  }, [onDialog]);

  return (
    <div
      style={{
        position: "absolute",
        alignItems: "center",

        margin: 64,

        width: "100%",
        height: "100%",

        backgroundColor: dialog.blurBackgroundColor,
        backdropFilter: "blur(16px)",
      }}
      onClick={(e) => {
        setOnDialog("");
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",

          transform: "translate(-50%, -50%)",

          width: "calc(100% - 128px)",
          height: "calc(100% - 128px)",
        }}
      >
        <img
          src={imageBase64}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",

            transform: "translate(-50%, -50%)",

            maxHeight: "100%",
            maxWidth: "100%",
            objectFit: "contain",
            opacity: isLoaded ? 1 : 0,
          }}
          onLoad={() => {
            setIsLoaded(true);
          }}
        />
      </div>
    </div>
  );
};
/* { image_viewer } -------------------------------------------------------------------------------------------------------------- */

/* { pdf_viewer } --------------------------------------------------------------------------------------------------------------- */
const Pdf_Viewer = ({}) => {
  const { RGB, colorOffset, dialog } = useContext(ConfigContexts);
  const { onDialog, setOnDialog } = useContext(StatusContexts);

  const [pdfPayload, setPdfPayload] = useState(null);
  useEffect(() => {
    const payload = onDialog.split("|")[1];
    if (payload !== undefined) {
      try {
        const decoded = decodeURIComponent(payload);
        const parsed = JSON.parse(decoded);
        setPdfPayload(parsed);
      } catch (error) {
        console.error("Failed to parse pdf payload", error);
        setPdfPayload(null);
      }
    }
  }, [onDialog]);

  if (!pdfPayload) {
    return null;
  }

  const handleDownload = (event) => {
    event.stopPropagation();
    if (!pdfPayload.data) {
      return;
    }
    const link = document.createElement("a");
    link.href = pdfPayload.data;
    link.download = pdfPayload.name || "document.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      style={{
        position: "absolute",
        alignItems: "center",

        margin: 64,

        width: "100%",
        height: "100%",

        backgroundColor: dialog.blurBackgroundColor,
        backdropFilter: "blur(16px)",
      }}
      onClick={(e) => {
        setOnDialog("");
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",

          transform: "translate(-50%, -50%)",

          width: "calc(100% - 128px)",
          height: "calc(100% - 128px)",
          borderRadius: dialog.borderRadius,
          border: dialog.border,
          backgroundColor: dialog.backgroundColor,
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: dialog.border,
            color: `rgba(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 1)`,
          }}
        >
          <span
            style={{
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginRight: 12,
            }}
            title={pdfPayload.name}
          >
            {pdfPayload.name || "PDF Document"}
          </span>
          <Icon
            src="download"
            style={{
              width: 18,
              height: 18,
              cursor: "pointer",
            }}
            onClick={handleDownload}
          />
        </div>
        <iframe
          src={pdfPayload.data}
          title={pdfPayload.name || "PDF preview"}
          style={{
            flex: 1,
            border: "none",
            borderBottomLeftRadius: dialog.borderRadius,
            borderBottomRightRadius: dialog.borderRadius,
            backgroundColor: "#ffffff",
          }}
        />
      </div>
    </div>
  );
};
/* { pdf_viewer } --------------------------------------------------------------------------------------------------------------- */

/* { setting } ------------------------------------------------------------------------------------------------------------------- */
const Setting = ({}) => {
  const { RGB, colorOffset, dialog } = useContext(ConfigContexts);
  return (
    <div
      style={{
        position: "absolute",
        alignItems: "center",

        padding: 6,
        margin: 64,

        width: 460,
        height: 460,

        borderRadius: 10,
        border: dialog.border,

        backgroundColor: dialog.backgroundColor,
        backdropFilter: "blur(16px)",
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <Settings />
    </div>
  );
};
/* { setting } ------------------------------------------------------------------------------------------------------------------- */

/* { down_load_ollama_model } ---------------------------------------------------------------------------------------------------- */
const Ollama_Model_Manager = ({}) => {
  const { RGB, colorOffset, dialog } = useContext(ConfigContexts);
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
        border: dialog.border,

        backgroundColor: dialog.backgroundColor,
        backdropFilter: "blur(16px)",
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <Language_Model_Manager
        available_models={available_large_language_models}
      />
    </div>
  );
};
/* { down_load_ollama_model } ---------------------------------------------------------------------------------------------------- */

/* { await_Ollama_setup } -------------------------------------------------------------------------------------------------------- */
const AwaitOllamaSetup = ({}) => {
  const { RGB, colorOffset, dialog } = useContext(ConfigContexts);
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
        height: 460,

        borderRadius: 10,
        border: dialog.border,

        backgroundColor: dialog.backgroundColor,
        backdropFilter: "blur(16px)",
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="scrolling-space"
        style={{
          maxHeight: "100%",
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
/* { await_Ollama_setup } -------------------------------------------------------------------------------------------------------- */

const Dialog = () => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { onDialog, setOnDialog } = useContext(StatusContexts);

  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    switch (onDialog.split("|")[0]) {
      case "await_ollama_setup_warning":
        setDialog(<AwaitOllamaSetup />);
        break;
      case "download_ollama_model":
        setDialog(<Ollama_Model_Manager />);
        break;
      case "settings":
        setDialog(<Setting />);
        break;
      case "image_viewer":
        setDialog(<Image_Viewer />);
        break;
      case "pdf_viewer":
        setDialog(<Pdf_Viewer />);
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
        transition: "top 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "absolute",
        top: onDialog !== "" ? 0 : -100,
        left: 0,
        right: 0,
        bottom: 0,

        backgroundColor: "rgba(0, 0, 0, 0.32)",

        opacity: onDialog !== "" ? 1 : 0,
        pointerEvents: onDialog !== "" ? "auto" : "none",
      }}
      onClick={() => {
        if (onDialog !== "await_ollama_setup_warning") {
          setOnDialog("");
        }
      }}
    >
      <div
        className="dialog-container"
        style={{
          position: "absolute",
          top: 0,
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
