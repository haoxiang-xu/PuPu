import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
  use,
} from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { RequestContexts } from "../../CONTAINERs/requests/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import Input from "../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import PulseLoader from "react-spinners/PulseLoader";

const default_border_radius = 10;
const default_font_size = 14;
const default_padding = default_font_size;

const component_name = "message_list";

const ChatSectionContexts = createContext("");

const Message_Bottom_Panel = ({ index, active, role, setPlainTextMode }) => {
  const { RGB } = useContext(ConfigContexts);
  const { sectionData } = useContext(DataContexts);
  const { update_message } = useContext(ChatSectionContexts);

  const [onHover, setOnHover] = useState(null);
  const [onClick, setOnClick] = useState(null);

  if (role === "assistant") {
    return (
      <div
        style={{
          transition: "opacity 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 32,
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.16)`,
          opacity: active ? 1 : 0,
          pointerEvents: active ? "auto" : "none",
        }}
      >
        <Icon
          src="txt"
          style={{
            transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            transform: "translate(0%, -50%)",
            top: "50%",
            width: 24,
            padding: 2,
            marginLeft: 1,
            opacity: onClick === "plainTextMode" ? 0.72 : 0.5,
            backgroundColor:
              onClick === "plainTextMode"
                ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.64)`
                : onHover === "plainTextMode"
                ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.64)`
                : `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0)`,
            borderRadius: default_border_radius - 1,
            border:
              onClick === "plainTextMode"
                ? "1px solid rgba(255, 255, 255, 0.64)"
                : onHover === "plainTextMode"
                ? "1px solid rgba(255, 255, 255, 0.32)"
                : "1px solid rgba(255, 255, 255, 0)",
          }}
          onMouseEnter={() => {
            setOnHover("plainTextMode");
          }}
          onMouseLeave={() => {
            setOnHover(null);
            setOnClick(null);
          }}
          onMouseDown={() => {
            setOnClick("plainTextMode");
          }}
          onMouseUp={() => {
            setOnClick(null);
          }}
          onClick={() => {
            setPlainTextMode((prev) => !prev);
          }}
        />
        <Icon
          src="update"
          style={{
            transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            transform: "translate(0%, -50%)",
            top: "50%",
            left: 24,
            width: 18,
            padding: 5,
            marginLeft: 1,
            opacity: onClick === "regenerate" ? 0.72 : 0.5,
            backgroundColor:
              onClick === "regenerate"
                ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.64)`
                : onHover === "regenerate"
                ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.64)`
                : `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0)`,
            borderRadius: default_border_radius - 1,
            border:
              onClick === "regenerate"
                ? "1px solid rgba(255, 255, 255, 0.64)"
                : onHover === "regenerate"
                ? "1px solid rgba(255, 255, 255, 0.32)"
                : "1px solid rgba(255, 255, 255, 0)",
          }}
          onMouseEnter={() => {
            setOnHover("regenerate");
          }}
          onMouseLeave={() => {
            setOnHover(null);
            setOnClick(null);
          }}
          onMouseDown={() => {
            setOnClick("regenerate");
          }}
          onMouseUp={() => {
            setOnClick(null);
          }}
          onClick={() => {
            update_message(sectionData.address, sectionData.messages, index);
          }}
        />
      </div>
    );
  } else {
    return null;
  }
};
const Message_Section = ({ index, role, message, is_last_index }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { sectionData } = useContext(DataContexts);
  const { targetAddress } = useContext(StatusContexts);
  const { awaitResponse } = useContext(ChatSectionContexts);
  const [style, setStyle] = useState({
    backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0)`,
  });
  const [onHover, setOnHover] = useState(false);
  const [plainTextMode, setPlainTextMode] = useState(false);

  useEffect(() => {
    if (sectionData.address !== targetAddress) {
      setPlainTextMode(false);
    }
  }, [sectionData, targetAddress]);
  useEffect(() => {
    if (role === "assistant") {
      setStyle({
        backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B},0)`,
      });
    } else if (role === "terminal") {
      setStyle({
        backgroundColor: `#b45200`,
      });
    } else {
      setStyle({
        plainText: true,
      });
    }
  }, [role]);

  return (
    <>
      <div
        style={{
          transition: "margin-left 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
          transition: "width 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
          position: "relative",
          width: role === "user" ? "none" : "100%",
          maxWidth: role === "user" ? 328 : "100%",

          float: role === "user" ? "right" : "left",
          marginTop: index === 0 ? 32 : 0,
          marginBottom: is_last_index ? 128 : 36,
          borderRadius: default_border_radius,
          boxShadow:
            role === "user" ? `0px 4px 16px rgba(0, 0, 0, 0.16)` : "none",
        }}
        onMouseEnter={(e) => {
          setOnHover(true);
        }}
        onMouseLeave={(e) => {
          setOnHover(false);
        }}
      >
        {!plainTextMode ? (
          <Markdown index={index} style={style}>
            {message}
          </Markdown>
        ) : (
          <span
            style={{
              color: `rgba(${RGB.R + colorOffset.font}, ${
                RGB.G + colorOffset.font
              }, ${RGB.B + colorOffset.font}, 1)`,
            }}
          >
            {message}
          </span>
        )}

        <div
          className="message-bottom-panel"
          style={{
            transition: "opacity 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            width: "100%",
            height: 32,
          }}
        >
          <Message_Bottom_Panel
            index={index}
            active={onHover && awaitResponse === null}
            role={role}
            setPlainTextMode={setPlainTextMode}
          />
        </div>
      </div>
    </>
  );
};
const Scrolling_Section = () => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { sectionData, sectionStarted } = useContext(DataContexts);
  const { setComponentOnFocus } = useContext(StatusContexts);
  const {
    awaitResponse,
    preLoadingCompleted,
    arrivedAtPosition,
    setArrivedAtPosition,
  } = useContext(ChatSectionContexts);
  /* { Scrolling } ----------------------------------------------------------- */
  const scrollRef = useRef(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef(null);
  useEffect(() => {
    const handleScroll = () => {
      setIsUserScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 3000);
    };
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
    }
    return () => {
      if (scrollElement) {
        scrollElement.removeEventListener("scroll", handleScroll);
      }
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    if (
      !isUserScrolling &&
      scrollRef.current &&
      awaitResponse !== null &&
      awaitResponse === -1
    ) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sectionData, awaitResponse, awaitResponse]);
  useEffect(() => {
    if (!preLoadingCompleted && !arrivedAtPosition) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setTimeout(() => {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }, 16);
      setTimeout(() => {
        setArrivedAtPosition(true);
      }, 32);
    }
  }, [preLoadingCompleted, arrivedAtPosition]);
  /* { Scrolling } ----------------------------------------------------------- */

  return (
    <div
      ref={scrollRef}
      className="scrolling-space"
      style={{
        transition: preLoadingCompleted
          ? "opacity 0.64s cubic-bezier(0.32, 0, 0.32, 1)"
          : "none",
        position: "absolute",

        top: 0,
        left: 0,
        bottom: 4,

        width: "100%",

        padding: 32,
        overflowX: "hidden",
        overflowY: "overlay",
        boxSizing: "border-box",
        scrollBehavior: preLoadingCompleted ? "smooth" : "auto",

        opacity: sectionStarted && preLoadingCompleted ? 1 : 0,
      }}
      onClick={(e) => {
        e.stopPropagation();
        setComponentOnFocus(component_name);
      }}
    >
      {sectionData && sectionData.messages
        ? sectionData.messages.map((msg, index) => (
            <Message_Section
              key={index}
              index={index}
              role={msg.role}
              message={msg.message}
              is_last_index={
                index === sectionData.messages.length - 1 ? true : false
              }
            />
          ))
        : null}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 64,
        }}
      ></div>
    </div>
  );
};
const Model_list_Item = ({ model, setModelOnTask }) => {
  const { RGB } = useContext(ConfigContexts);
  const { selectedModel, setSelectedModel, setAvaliableModels } =
    useContext(DataContexts);
  const { ollama_list_available_models } = useContext(RequestContexts);
  const { setComponentOnFocus } = useContext(StatusContexts);
  const [onHover, setOnHover] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        top: 0,

        width: 180,
        margin: 5,
        padding: "2px 6px",

        color: `rgba(225, 225, 225, 0.64)`,

        border:
          selectedModel === model
            ? "1px solid rgba(255, 255, 255, 0.16)"
            : onHover
            ? "1px solid rgba(255, 255, 255, 0.08)"
            : "1px solid rgba(255, 255, 255, 0)",
        borderRadius: 4,
        backgroundColor:
          selectedModel === model
            ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.84)`
            : onHover
            ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.4)`
            : `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0)`,
        boxShadow:
          selectedModel === model ? "0px 4px 16px rgba(0, 0, 0, 0.16)" : "none",
      }}
      onMouseEnter={(e) => {
        setOnHover(true);
      }}
      onMouseLeave={(e) => {
        setOnHover(false);
      }}
      onMouseDown={(e) => {
        setSelectedModel(model);
      }}
      onClick={(e) => {
        setComponentOnFocus(component_name);
        ollama_list_available_models().then((response) => {
          setAvaliableModels(response);
        });
      }}
    >
      {model}
    </div>
  );
};
const Add_Model_Button = () => {
  const { RGB } = useContext(ConfigContexts);
  const { setComponentOnFocus, setOnDialog } = useContext(StatusContexts);

  const [onHover, setOnHover] = useState(false);
  const [onClick, setOnClick] = useState(false);

  return (
    <div
      style={{
        transition: "border 0.16s cubic-bezier(0.32, 0, 0.32, 1)",
        position: "relative",

        width: "calc(100% - 12px)",
        height: 40,
        margin: 5,
        border: onHover
          ? "1px solid rgba(255, 255, 255, 0.16)"
          : "1px solid rgba(255, 255, 255, 0)",
        borderRadius: 4,
        backgroundColor: onClick
          ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.84)`
          : onHover
          ? `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.4)`
          : `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0)`,
      }}
      onMouseEnter={(e) => {
        setOnHover(true);
      }}
      onMouseLeave={(e) => {
        setOnHover(false);
        setOnClick(false);
      }}
      onMouseDown={(e) => {
        setOnClick(true);
      }}
      onMouseUp={(e) => {
        setOnClick(false);
      }}
      onClick={(e) => {
        setComponentOnFocus(component_name);
        setOnDialog("download_ollama_model");
      }}
    >
      <Icon
        src="add"
        alt="add"
        style={{
          position: "absolute",
          transform: "translate(-50%, -50%)",
          left: "50%",
          top: "50%",
        }}
      />
    </div>
  );
};
const Model_Menu = ({ value }) => {
  const sub_component_name = component_name + "_" + "model_menu";

  const { RGB } = useContext(ConfigContexts);
  const { selectedModel, avaliableModels, setAvaliableModels } =
    useContext(DataContexts);
  const { ollamaOnTask, componentOnFocus, setComponentOnFocus } =
    useContext(StatusContexts);
  const { ollama_list_available_models } = useContext(RequestContexts);

  const [onHover, setOnHover] = useState(false);
  useEffect(() => {
    if (componentOnFocus !== sub_component_name) {
      setOnHover(false);
    }
  }, [componentOnFocus]);

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
  useEffect(() => {
    ollama_list_available_models().then((response) => {
      setAvaliableModels(response);
    });
  }, []);

  return (
    <div
      style={{
        userSelect: "none",
        transition:
          "left 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " opacity 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " border 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)," +
          " padding 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "absolute",
        bottom: 35,
        left:
          value.length !== 0 || ollamaOnTask !== null
            ? 60 + default_padding
            : 60,

        fontSize: default_font_size + 2,
        fontFamily: "inherit",
        fontWeight: 500,

        opacity:
          value.length !== 0 || ollamaOnTask !== null
            ? 0
            : componentOnFocus === sub_component_name
            ? 1
            : onHover
            ? 0.5
            : 0.32,
        padding: componentOnFocus === sub_component_name ? "5px" : "2px 6px",

        borderRadius: componentOnFocus === sub_component_name ? 8 : 4,
        color:
          componentOnFocus === sub_component_name
            ? `rgba(225, 225, 225, 0.32)`
            : `rgba(225, 225, 225, 0.72)`,
        border:
          componentOnFocus === sub_component_name
            ? `1px solid rgba(255, 255, 255, 0.12)`
            : onHover
            ? `1px solid rgba(225, 225, 225, 0.64)`
            : `1px solid rgba(225, 225, 225, 0.5)`,
        backgroundColor:
          componentOnFocus === sub_component_name
            ? `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.64)`
            : onHover
            ? `rgba(225, 225, 225, 0.08)`
            : `rgba(225, 225, 225, 0)`,
        boxShadow:
          onHover || componentOnFocus === sub_component_name
            ? `0px 4px 16px rgba(0, 0, 0, 0.32)`
            : "none",
        cursor: "pointer",
        backdropFilter:
          componentOnFocus === sub_component_name ? "blur(16px)" : "none",
        pointerEvents: value.length !== 0 ? "none" : "auto",
      }}
      onMouseEnter={(e) => {
        setOnHover(true);
      }}
      onMouseLeave={(e) => {
        setOnHover(false);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        setComponentOnFocus(sub_component_name);
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="scrolling-space"
        style={{
          maxHeight: 111,
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        {componentOnFocus === sub_component_name ? (
          avaliableModels.map((model, index) => (
            <Model_list_Item key={index} model={model} />
          ))
        ) : (
          <div
            style={{
              position: "relative",
              top: 0,
            }}
          >
            {selectedModel}
          </div>
        )}
        {componentOnFocus === sub_component_name ? <Add_Model_Button /> : null}
      </div>
    </div>
  );
};
const Input_Section = ({ inputValue, setInputValue, on_input_submit }) => {
  const { RGB, colorOffset } = useContext(ConfigContexts);
  const { componentOnFocus } = useContext(StatusContexts);
  const { force_stop_ollama } = useContext(RequestContexts);
  const { awaitResponse } = useContext(ChatSectionContexts);
  const [style, setStyle] = useState({
    colorOffset: 0,
    opacity: 0,
    border: "1px solid rgba(255, 255, 255, 0)",
  });
  const [onHover, setOnHover] = useState(false);
  const [onClicked, setOnClicked] = useState(false);
  const [onFocus, setOnFocus] = useState(false);

  useEffect(() => {
    if (onClicked) {
      setStyle({
        colorOffset: 64,
        opacity: 1,
        border: "1px solid rgba(255, 255, 255, 0.16)",
      });
    } else if (onHover) {
      setStyle({
        colorOffset: 16,
        opacity: 1,
        border: "1px solid rgba(255, 255, 255, 0.16)",
      });
    } else {
      setStyle({
        colorOffset: 0,
        opacity: 0,
        border: "1px solid rgba(255, 255, 255, 0)",
      });
    }
  }, [onHover, onClicked]);
  useEffect(() => {
    if (componentOnFocus === component_name) {
      setOnFocus(true);
    }
  }, [componentOnFocus]);

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 16,
          right: 16,
          height: 32,

          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
        }}
      ></div>
      <Input
        value={inputValue}
        setValue={setInputValue}
        onSubmit={on_input_submit}
        onFocus={onFocus}
        setOnFocus={setOnFocus}
        style={{
          transition: "height 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "fixed",

          bottom: 24,
          left: 16,
          right: 16,
          padding: 0,
          margin: 0,

          fontSize: 16,
          color: `rgba(255, 255, 255, 0.64)`,

          borderRadius: default_border_radius,
          backgroundColor: `rgba(${RGB.R + colorOffset.middle_ground}, ${
            RGB.G + colorOffset.middle_ground
          }, ${RGB.B + colorOffset.middle_ground}, 0.64)`,
          backdropFilter: "blur(24px)",
          boxShadow: `0px 4px 32px rgba(0, 0, 0, 0.64)`,
          border: "1px solid rgba(255, 255, 255, 0.16)",
        }}
      ></Input>
      {awaitResponse === null ? (
        <Icon
          src="send"
          alt="send"
          style={{
            transition:
              "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), bottom 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",

            userSelect: "none",
            draggable: "false",
            position: "fixed",
            transform: "translate(-50%, -50%)",

            bottom: onClicked ? 14 : 16,
            right: 7,
            width: 16,
            height: 16,
            cursor: "pointer",

            padding: 8,
            borderRadius: default_border_radius - 4,
            backgroundColor: `rgba(${
              RGB.R + colorOffset.middle_ground + style.colorOffset
            }, ${RGB.G + colorOffset.middle_ground + style.colorOffset}, ${
              RGB.B + colorOffset.middle_ground + style.colorOffset
            }, ${style.opacity})`,
            border: style.border,
          }}
          onMouseEnter={() => {
            setOnHover(true);
          }}
          onMouseLeave={() => {
            setOnHover(false);
            setOnClicked(false);
          }}
          onMouseDown={() => {
            setOnClicked(true);
          }}
          onMouseUp={() => {
            setOnClicked(false);
          }}
          onClick={on_input_submit}
        />
      ) : (
        <Icon
          src="stop"
          alt="stop"
          style={{
            transition:
              "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), bottom 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",

            userSelect: "none",
            draggable: "false",
            position: "fixed",
            transform: "translate(-50%, -50%)",

            bottom: onClicked ? 14 : 16,
            right: 7,
            width: 16,
            height: 16,
            cursor: "pointer",

            padding: 8,
            borderRadius: default_border_radius - 4,
            backgroundColor: `rgba(${
              RGB.R + colorOffset.middle_ground + style.colorOffset
            }, ${RGB.G + colorOffset.middle_ground + style.colorOffset}, ${
              RGB.B + colorOffset.middle_ground + style.colorOffset
            }, ${style.opacity})`,
            border: style.border,
          }}
          onMouseEnter={() => {
            setOnHover(true);
          }}
          onMouseLeave={() => {
            setOnHover(false);
            setOnClicked(false);
          }}
          onMouseDown={() => {
            setOnClicked(true);
          }}
          onMouseUp={() => {
            setOnClicked(false);
          }}
          onClick={() => {
            force_stop_ollama();
          }}
        />
      )}
      <Model_Menu value={inputValue} />
    </>
  );
};

const Message_List = () => {
  const { RGB } = useContext(ConfigContexts);
  const {
    selectedModel,
    sectionData,
    update_title,
    update_message_on_index,
    append_message,
    reset_regenerate_title_count_down,
  } = useContext(DataContexts);
  const { ollama_chat_completion_streaming, ollama_update_title_no_streaming } =
    useContext(RequestContexts);

  const [inputValue, setInputValue] = useState("");
  const [awaitResponse, setAwaitResponse] = useState(null);

  /* { Target Address } ------------------------------------------------------------------------------ */
  const [targetAddress, setTargetAddress] = useState(sectionData.address || "");
  useEffect(() => {
    if (awaitResponse === null) {
      setTargetAddress(sectionData.address || "");
    }
  }, [sectionData, awaitResponse]);
  /* { Target Address } ------------------------------------------------------------------------------ */

  /* { PreLoading } ================================================================================== */
  const [arrivedAtPosition, setArrivedAtPosition] = useState(false);
  const [preLoadingCompleted, setPreLoadingCompleted] = useState(false);
  useEffect(() => {
    if (arrivedAtPosition) {
      setPreLoadingCompleted(true);
    }
  }, [arrivedAtPosition]);
  useEffect(() => {
    if (targetAddress !== sectionData.address) {
      setPreLoadingCompleted(false);
      setArrivedAtPosition(false);
    }
  }, [targetAddress, sectionData]);
  /* { PreLoading } ================================================================================== */

  /* { Input Section } ------------------------------------------------------------------------------- */
  const on_input_submit = useCallback(() => {
    if (inputValue.length > 0 && awaitResponse === null) {
      append_message(targetAddress, {
        role: "user",
        message: inputValue,
        content: inputValue,
      });
      setInputValue("");
    }
  }, [inputValue, awaitResponse]);
  const update_message = useCallback(
    (address, messages, index) => {
      setAwaitResponse(index);
      ollama_chat_completion_streaming(
        selectedModel,
        address,
        messages,
        index,
        append_message,
        update_message_on_index
      )
        .then((response) => {
          setAwaitResponse(null);
        })
        .finally(() => {
          if (sectionData.n_turns_to_regenerate_title === 0) {
            ollama_update_title_no_streaming(
              selectedModel,
              address,
              messages,
              update_title
            );
            reset_regenerate_title_count_down();
          }
        });
    },
    [inputValue, selectedModel]
  );
  useEffect(() => {
    const messages = sectionData.messages || [];
    const address = targetAddress || "";
    if (address.length === 0) {
      return;
    }
    if (
      awaitResponse === null &&
      messages.length > 0 &&
      messages[messages.length - 1].role === "user"
    ) {
      update_message(address, messages, -1);
    }
  }, [sectionData, targetAddress, awaitResponse]);
  /* { Input Section } ------------------------------------------------------------------------------- */

  return (
    <ChatSectionContexts.Provider
      value={{
        awaitResponse,
        setAwaitResponse,
        arrivedAtPosition,
        setArrivedAtPosition,
        preLoadingCompleted,
        setPreLoadingCompleted,

        update_message,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "0",
          left: "0",

          width: "100%",
          height: "100%",
        }}
      >
        <Scrolling_Section />
        <Input_Section
          inputValue={inputValue}
          setInputValue={setInputValue}
          on_input_submit={on_input_submit}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: -9,
          left: 9,
          right: 9,

          height: 96,
          background: `linear-gradient(to bottom,  rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1) 0%, rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.9) 32%, rgba(0, 0, 0, 0)) 100%`,
        }}
      ></div>
    </ChatSectionContexts.Provider>
  );
};

export default Message_List;
