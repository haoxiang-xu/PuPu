import React, { useState, useContext, useEffect, useRef, use } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import ScrollingSpace from "../../BUILTIN_COMPONENTs/scrolling_space/scrolling_sapce";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

import { await_Ollama_setup_warning } from "./default_dialogs";
import { available_models } from "../../CONTAINERs/consts/ollama";

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

/* { down_load_ollama_model } ---------------------------------------------------------------------------------------------------- */
const OptionTab = ({
  option,
  onExpand,
  setOnExpand,
  selectedOption,
  setSelectedOption,
}) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const [onHover, setOnHover] = useState(false);

  return (
    <div
      style={{
        transition: "all 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",

        width: "100%",
        height: 24,
        border: onExpand
          ? onHover
            ? `1px solid rgba(225, 225, 225, 0.16)`
            : `1px solid rgba(225, 225, 225, 0)`
          : `1px solid rgba(225, 225, 225, 0.16)`,
        boxSizing: "border-box",

        alignContent: "center",
        justifyContent: "center",
        display: "flex",

        borderRadius: 5,
      }}
      onMouseEnter={() => {
        setOnHover(true);
      }}
      onMouseLeave={() => {
        setOnHover(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        setOnExpand(!onExpand);
        if (onExpand) {
          setSelectedOption(option);
        }
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,

          fontSize: 14,
          color: `rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,

          userSelect: "none",
        }}
      >
        {onExpand ? option.name : selectedOption.name}
      </span>
    </div>
  );
};
const ModelTab = ({ model, modelOnSelect, setModelOnSelect }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);

  const [isLoaded, setIsLoaded] = useState(false);
  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const spanRef = useRef(null);
  const [spanWidth, setSpanWidth] = useState(0);
  useEffect(() => {
    if (spanRef.current) {
      setSpanWidth(spanRef.current.offsetWidth);
    }
  }, [isLoaded]);

  const [panelOnHover, setPanelOnHover] = useState(false);
  const [onClick, setOnClick] = useState(false);

  const [onExpand, setOnExpand] = useState(false);

  const [options, setOptions] = useState(model.available_options);
  const [selectedOption, setSelectedOption] = useState(
    model.available_options[0]
  );
  useEffect(() => {
    if (onExpand) {
      setOptions(model.available_options);
      setModelOnSelect(model.name);
    } else {
      setOptions([model.available_options[0]]);
      setModelOnSelect(null);
    }
  }, [onExpand]);
  useEffect(() => {
    if (modelOnSelect === null || modelOnSelect !== model.name) {
      setOnExpand(false);
    }
  }, [modelOnSelect]);

  return (
    <div
      style={{
        transition: "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",

        width: "calc(100% - 12px)",
        height: 32,

        zIndex: onExpand ? 1 : 0,

        margin: 5,
        border: panelOnHover
          ? `1px solid rgba(225, 225, 225, 0.16)`
          : `1px solid rgba(225, 225, 225, 0)`,
        backgroundColor: panelOnHover
          ? `rgba(${RGB.R + colorOffset.middle_ground}, ${
              RGB.G + colorOffset.middle_ground
            }, ${RGB.B + colorOffset.middle_ground}, 0.64)`
          : `rgba(${RGB.R + colorOffset.middle_ground}, ${
              RGB.G + colorOffset.middle_ground
            }, ${RGB.B + colorOffset.middle_ground}, 0)`,
        borderRadius: 4,
      }}
      onMouseEnter={() => {
        setPanelOnHover(true);
      }}
      onMouseLeave={() => {
        setPanelOnHover(false);
        setOnClick(false);
      }}
      onMouseDown={() => {
        setOnClick(true);
      }}
      onMouseUp={() => {
        setOnClick(false);
      }}
      onClick={() => {
        setOnExpand(false);
      }}
    >
      <div
        style={{
          position: "relative",

          width: "calc(100% - 36px)",
          height: 32,

          borderRadius: 4,
        }}
      >
        <span
          ref={spanRef}
          style={{
            position: "absolute",
            transform: "translate(0, -50%)",
            top: "50%",
            left: 12,
            fontSize: 18,
            color: `rgba(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 1)`,
            userSelect: "none",
          }}
        >
          {model.name}
        </span>
      </div>
      <Icon
        src={"download"}
        style={{
          position: "absolute",
          transform: "translate(0, -50%)",
          top: "50%",
          right: 7,
          width: 20,

          opacity: 0.5,

          userSelect: "none",
        }}
      />
      <div
        className="scrolling-space"
        style={{
          transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",

          zIndex: 1,
          top: 1,
          left: spanWidth + 13,

          width: 42,
          padding: 2,
          borderRadius: 7,
          border: onExpand
            ? `1px solid rgba(225, 225, 225, 0.16)`
            : `1px solid rgba(225, 225, 225, 0)`,
          backgroundColor: onExpand
            ? `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`
            : `rgba(${RGB.R + colorOffset.middle_ground}, ${
                RGB.G + colorOffset.middle_ground
              }, ${RGB.B + colorOffset.middle_ground}, 0)`,

          overflow: "hidden",
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOnExpand(!onExpand);
        }}
      >
        {options.map((option, index) => {
          return (
            <OptionTab
              option={option}
              key={index}
              index={index}
              onExpand={onExpand}
              setOnExpand={setOnExpand}
              selectedOption={selectedOption}
              setSelectedOption={setSelectedOption}
            />
          );
        })}
      </div>
    </div>
  );
};
const FamilyTab = ({ family, modelOnSelect, setModelOnSelect }) => {
  return (
    <div
      style={{
        transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",

        width: "100%",

        borderRadius: 6,
        boxSizing: "border-box",
      }}
    >
      {family.models.map((model, index) => {
        return (
          <ModelTab
            key={index}
            model={model}
            modelOnSelect={modelOnSelect}
            setModelOnSelect={setModelOnSelect}
          />
        );
      })}
    </div>
  );
};
const AvailableModels = ({ available_models }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const [modelOnSelect, setModelOnSelect] = useState(null);

  return (
    <div
      className="scrolling-space"
      style={{
        position: "absolute",

        top: 0,
        left: 0,

        margin: 6,

        width: "calc(100% - 12px)",
        height: "calc(100% - 12px)",

        boxSizing: "border-box",

        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      {available_models.map((family, index) => {
        return (
          <FamilyTab
            key={index}
            family={family}
            modelOnSelect={modelOnSelect}
            setModelOnSelect={setModelOnSelect}
          />
        );
      })}
    </div>
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
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <AvailableModels available_models={available_models} />
    </div>
  );
};
/* { down_load_ollama_model } ---------------------------------------------------------------------------------------------------- */

/* { await_Ollama_setup } -------------------------------------------------------------------------------------------------------- */
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
      onClick={(e) => {
        e.stopPropagation();
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
/* { await_Ollama_setup } -------------------------------------------------------------------------------------------------------- */

const Dialog = () => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { onDialog, setOnDialog } = useContext(StatusContexts);

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
