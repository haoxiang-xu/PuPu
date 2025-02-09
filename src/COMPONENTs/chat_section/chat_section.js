import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
  use,
} from "react";
import { RootDataContexts } from "../../DATA_MANAGERs/root_data_contexts";
import { RootStatusContexts } from "../../DATA_MANAGERs/root_status_contexts";
import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import Input from "../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { LOADING_TAG } from "../../BUILTIN_COMPONENTs/markdown/const";
import PulseLoader from "react-spinners/PulseLoader";

const R = 30;
const G = 30;
const B = 30;

const default_forground_color_offset = 12;
const default_font_color_offset = 128;
const default_border_radius = 10;

const component_name = "chat_section";

const ChatSectionContexts = createContext("");

const Message_Bottom_Panel = ({ active, role, setPlainTextMode }) => {
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
          backgroundColor: `rgba(${R}, ${G}, ${B}, 0.16)`,
          opacity: active ? 1 : 0,
          pointerEvents: active ? "auto" : "none",
        }}
      >
        <Icon
          src="txt"
          style={{
            transition: "border 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            transform: "translate(0%, -50%)",
            top: "50%",
            width: 24,
            padding: 2,
            marginLeft: 1,
            opacity: onClick === "plainTextMode" ? 0.72 : 0.5,
            backgroundColor:
              onClick === "plainTextMode"
                ? `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.64)`
                : onHover === "plainTextMode"
                ? `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.64)`
                : `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0)`,
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
            transition: "border 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
            position: "absolute",
            transform: "translate(0%, -50%)",
            top: "50%",
            left: 32,
            width: 18,
            padding: 5,
            marginLeft: 1,
            opacity: onClick === "regenerate" ? 0.72 : 0.5,
            backgroundColor:
              onClick === "regenerate"
                ? `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.64)`
                : onHover === "regenerate"
                ? `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.64)`
                : `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0)`,
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
            setPlainTextMode((prev) => !prev);
          }}
        />
      </div>
    );
  } else {
    return null;
  }
};
const Message_Section = ({ index, role, message, is_last_index }) => {
  const { sectionData } = useContext(RootDataContexts);
  const { targetAddress } = useContext(RootStatusContexts);
  const [style, setStyle] = useState({
    backgroundColor: `rgba(${R}, ${G}, ${B}, 0)`,
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
        backgroundColor: `rgba(${R}, ${G}, ${B},0)`,
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
              color: `rgba(${R + default_font_color_offset}, ${
                G + default_font_color_offset
              }, ${B + default_font_color_offset}, 1)`,
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
            active={onHover}
            role={role}
            setPlainTextMode={setPlainTextMode}
          />
        </div>
      </div>
    </>
  );
};
const Scrolling_Section = ({ responseInComing }) => {
  const { sectionData, sectionStarted } = useContext(RootDataContexts);
  const { setComponentOnFocus } = useContext(RootStatusContexts);
  const { preLoadingCompleted, arrivedAtPosition, setArrivedAtPosition } =
    useContext(ChatSectionContexts);
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
    if (!isUserScrolling && scrollRef.current && responseInComing) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sectionData, responseInComing]);
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

  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
      .scrolling-space::-webkit-scrollbar {
        width: 12px; /* Custom width for the vertical scrollbar */
      }

      .scrolling-space::-webkit-scrollbar-track {
        background-color: rgba(${R}, ${G}, ${B}, 1); /* Scrollbar track color */
      }

      .scrolling-space::-webkit-scrollbar-thumb {
        background-color: rgba(${R + default_forground_color_offset}, ${
      G + default_forground_color_offset
    }, ${B + default_forground_color_offset}, 1);
        border-radius: 6px;
        border: 3px solid rgba(${R}, ${G}, ${B}, 1);
      }
      .scrolling-space::-webkit-scrollbar-thumb:hover {
        background-color: rgba(${R + default_forground_color_offset + 32}, ${
      G + default_forground_color_offset + 32
    }, ${B + default_forground_color_offset + 32}, 1);
      }
      .scrolling-space::-webkit-scrollbar:horizontal {
        display: none;
      }
    `;
    document.head.appendChild(styleElement);

    // Cleanup style when the component unmounts
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

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
const Input_Section = ({ inputValue, setInputValue, on_input_submit }) => {
  const [style, setStyle] = useState({
    colorOffset: 0,
    opacity: 0,
    border: "1px solid rgba(255, 255, 255, 0)",
  });
  const { componentOnFocus } = useContext(RootStatusContexts);
  const { responseInComing } = useContext(ChatSectionContexts);
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

          backgroundColor: `rgba(${R}, ${G}, ${B}, 1)`,
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
          backgroundColor: `rgba(${R + default_forground_color_offset}, ${
            G + default_forground_color_offset
          }, ${B + default_forground_color_offset}, 0.64)`,
          backdropFilter: "blur(24px)",
          boxShadow: `0px 4px 32px rgba(0, 0, 0, 0.64)`,
          border: "1px solid rgba(255, 255, 255, 0.16)",
        }}
      ></Input>
      {!responseInComing ? (
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
              R + default_forground_color_offset + style.colorOffset
            }, ${G + default_forground_color_offset + style.colorOffset}, ${
              B + default_forground_color_offset + style.colorOffset
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
        <PulseLoader
          style={{
            position: "fixed",
            bottom: 38,
            right: 30,
            opacity: 0.32,
          }}
          size={7}
          color={"#cccccc"}
          speedMultiplier={0.8}
        />
      )}
    </>
  );
};

const Chat_Section = () => {
  const {
    sectionData,
    append_message,
    chat_generation,
    chat_room_title_generation,
    reset_regenerate_title_count_down,
  } = useContext(RootDataContexts);
  const [inputValue, setInputValue] = useState("");
  const [responseInComing, setResponseInComing] = useState(false);

  /* { Target Address } ------------------------------------------------------------------------------ */
  const [targetAddress, setTargetAddress] = useState(sectionData.address || "");
  useEffect(() => {
    if (!responseInComing) {
      setTargetAddress(sectionData.address || "");
    }
  }, [sectionData, responseInComing]);
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

  const on_input_submit = useCallback(() => {
    if (inputValue.length > 0 && !responseInComing) {
      append_message(targetAddress, {
        role: "user",
        message: inputValue,
        content: inputValue,
      });
      setInputValue("");
    }
  }, [inputValue]);
  useEffect(() => {
    const messages = sectionData.messages || [];
    const address = targetAddress || "";
    if (address.length === 0) {
      return;
    }
    if (!responseInComing) {
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === "user"
      ) {
        setResponseInComing(true);
        append_message(address, {
          role: "assistant",
          message: LOADING_TAG,
          content: "",
          think_section_expanded: true,
        });
        chat_generation(address, messages)
          .then((response) => {
            setResponseInComing(false);
          })
          .finally(() => {
            if (sectionData.n_turns_to_regenerate_title === 0) {
              chat_room_title_generation(address, messages).then(
                (response) => {}
              );
              reset_regenerate_title_count_down();
            }
          });
      }
    }
  }, [sectionData, targetAddress, responseInComing]);

  return (
    <ChatSectionContexts.Provider
      value={{
        responseInComing,
        arrivedAtPosition,
        setArrivedAtPosition,
        preLoadingCompleted,
        setPreLoadingCompleted,
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
        <Scrolling_Section responseInComing={responseInComing} />
        <Input_Section
          inputValue={inputValue}
          setInputValue={setInputValue}
          on_input_submit={on_input_submit}
        />
      </div>
    </ChatSectionContexts.Provider>
  );
};

export default Chat_Section;
