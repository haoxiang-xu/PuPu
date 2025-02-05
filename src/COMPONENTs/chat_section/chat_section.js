import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
} from "react";
import { RootDataContexts } from "../root_data_contexts";
import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import Input from "../../BUILTIN_COMPONENTs/input/input";
import send_icon from "./send.svg";

const R = 30;
const G = 30;
const B = 30;

const MODEL = "deepseek-r1:14b";

const default_forground_color_offset = 12;
const default_font_color_offset = 128;
const default_border_radius = 10;

const Message_Section = ({ role, message, is_last_index }) => {
  const [style, setStyle] = useState({
    backgroundColor: `rgba(${R}, ${G}, ${B}, 0)`,
  });

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
    <div
      style={{
        transition: "margin-left 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
        transition: "width 0.32s cubic-bezier(0.32, 0, 0.32, 1)",
        position: "relative",
        maxWidth: role === "user" ? 328 : "100%",

        left: role === "user" ? "calc(100% - 328px)" : 0,
        marginBottom: is_last_index ? 64 : 16,
        borderRadius: default_border_radius,
        boxShadow:
          role === "user" ? `0px 4px 16px rgba(0, 0, 0, 0.16)` : "none",
      }}
    >
      <Markdown style={style}>{message}</Markdown>
    </div>
  );
};
const Scrolling_Section = ({ messages }) => {
  const { sectionStarted } = useContext(RootDataContexts);
  const scrollRef = useRef(null);

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
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div
      ref={scrollRef}
      className="scrolling-space"
      style={{
        position: "absolute",

        top: 0,
        left: 0,
        bottom: 4,

        width: "100%",

        padding: 32,
        overflowX: "hidden",
        overflowY: "overlay",
        boxSizing: "border-box",
        scrollBehavior: "smooth",

        opacity: sectionStarted ? 1 : 0,
      }}
    >
      {messages
        ? messages.map((msg, index) => (
            <Message_Section
              key={index}
              role={msg.role}
              message={msg.message}
              is_last_index={index === messages.length - 1 ? true : false}
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
  const [onHover, setOnHover] = useState(false);
  const [onClicked, setOnClicked] = useState(false);

  useEffect(() => {
    if (onClicked) {
      setStyle({
        colorOffset: 64,
        opacity: 1,
        border: "1px solid rgba(255, 255, 255, 0.32)",
      });
    } else if (onHover) {
      setStyle({
        colorOffset: 16,
        opacity: 1,
        border: "1px solid rgba(255, 255, 255, 0.32)",
      });
    } else {
      setStyle({
        colorOffset: 0,
        opacity: 0,
        border: "1px solid rgba(255, 255, 255, 0)",
      });
    }
  }, [onHover, onClicked]);

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
      <img
        src={send_icon}
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
    </>
  );
};

const Chat_Section = () => {
  const [inputValue, setInputValue] = useState("");
  const [responseInComing, setResponseInComing] = useState(false);
  const {
    chatRoomID,
    setChatRoomID,
    messages,
    setMessages,
    historicalMessages,
    setHistoricalMessages,
  } = useContext(RootDataContexts);

  const on_input_submit = useCallback(() => {
    if (inputValue !== "") {
      setMessages([
        ...messages,
        { role: "user", message: inputValue, content: inputValue },
      ]);
      setInputValue("");
    }
  }, [inputValue, messages]);
  const single_chat_mode = async (messages) => {
    const preprocess_messages = (messages, memory_length) => {
      let processed_messages = [];

      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === "system") {
          processed_messages.push({
            role: messages[i].role,
            content: messages[i].content,
          });
        } else if (messages.length - i <= memory_length) {
          processed_messages.push({
            role: messages[i].role,
            content: messages[i].content,
          });
        }
      }
      return processed_messages;
    };
    const processed_messages = preprocess_messages(messages, 8);

    try {
      const request = {
        model: MODEL,
        messages: processed_messages,
      };
      const response = await fetch(`http://localhost:11434/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      if (!response.body) {
        console.error("No response body received from Ollama.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedResponse = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        try {
          const jsonChunk = JSON.parse(chunk);
          if (jsonChunk.message && jsonChunk.message.content) {
            accumulatedResponse += jsonChunk.message.content;
            setMessages([
              ...messages,
              {
                role: "assistant",
                message: accumulatedResponse,
                content: accumulatedResponse,
              },
            ]);
          }
          if (jsonChunk.done) break;
        } catch (error) {
          console.error("Error parsing stream chunk:", error);
        }
      }
      return {
        role: "assistant",
        message: accumulatedResponse,
        content: accumulatedResponse
      };
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
    }
  };
  const save_historical_messages = useCallback((latest_message) => {
    setHistoricalMessages((prev) => {
      let newHistoricalMessages = { ...prev };
      newHistoricalMessages[chatRoomID] = [...messages, latest_message];
      localStorage.setItem(
        "AI_lounge_historical_messages",
        JSON.stringify(newHistoricalMessages)
      );
      return newHistoricalMessages;
    });
  }, [messages, chatRoomID, historicalMessages]);

  useEffect(() => {
    if (!responseInComing) {
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === "user"
      ) {
        setResponseInComing(true);
        single_chat_mode(messages)
          .then((response) => {
            setResponseInComing(false);
            save_historical_messages(response);
          })
      }
    }
  }, [messages, responseInComing]);

  return (
    <div
      style={{
        position: "absolute",
        top: "0",
        left: "0",

        width: "100%",
        height: "100%",
      }}
    >
      <Scrolling_Section messages={messages} />
      <Input_Section
        inputValue={inputValue}
        setInputValue={setInputValue}
        on_input_submit={on_input_submit}
      />
    </div>
  );
};

export default Chat_Section;
