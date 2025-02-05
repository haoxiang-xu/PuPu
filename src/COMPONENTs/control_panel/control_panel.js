import React, { useEffect, useState, useContext, useCallback } from "react";
import { RootDataContexts } from "../root_data_contexts";
import ollama from "./ollama.png";
import Chat_Section from "../chat_section/chat_section";
import Side_Menu from "../side_menu/side_menu";

const R = 30;
const G = 30;
const B = 30;

const Control_Panel = ({}) => {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  const [chatRoomID, setChatRoomID] = useState("");
  const [modelSelected, setModelSelected] = useState("deepseek-r1:14b");
  const [messages, setMessages] = useState([]);

  const [historicalMessages, setHistoricalMessages] = useState({});

  const [sectionStarted, setSectionStarted] = useState(true);

  const generate_unique_room_ID = () => {
    let id = "";
    while (true) {
      id =
        Math.random().toString(36).substring(2) +
        new Date().getTime().toString(36);
      if (!historicalMessages[id]) {
        break;
      }
    }
    return id;
  };
  const start_new_section = () => {
    setChatRoomID(generate_unique_room_ID());
    setSectionStarted(false);
  };
  const save_after_new_message = useCallback(
    (latest_message) => {
      setHistoricalMessages((prev) => {
        let newHistoricalMessages = { ...prev };
        let messages_to_save = [...messages, latest_message];
        newHistoricalMessages[chatRoomID] = {
          ...newHistoricalMessages[chatRoomID],
          messages: messages_to_save,
        };
        localStorage.setItem(
          "AI_lounge_historical_messages",
          JSON.stringify(newHistoricalMessages)
        );
        return newHistoricalMessages;
      });
    },
    [chatRoomID, messages, historicalMessages]
  );
  const save_after_new_title = useCallback(
    (title) => {
      setHistoricalMessages((prev) => {
        let newHistoricalMessages = { ...prev };
        newHistoricalMessages[chatRoomID] = {
          ...newHistoricalMessages[chatRoomID],
          title: title,
        };
        localStorage.setItem(
          "AI_lounge_historical_messages",
          JSON.stringify(newHistoricalMessages)
        );
        return newHistoricalMessages;
      });
    },
    [chatRoomID, historicalMessages]
  );
  const save_after_deleted = useCallback(
    (chat_room_id) => {
      setHistoricalMessages((prev) => {
        const newHistoricalMessages = { ...prev };
        delete newHistoricalMessages[chat_room_id];
        localStorage.setItem(
          "AI_lounge_historical_messages",
          JSON.stringify(newHistoricalMessages)
        );
        return newHistoricalMessages;
      });
      if (chatRoomID === chat_room_id) {
        setChatRoomID(generate_unique_room_ID());
      }
    },
    [chatRoomID, historicalMessages]
  );

  /* { Ollama APIs } --------------------------------------------------------------------------------- */
  const chat_generation = async (messages) => {
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
        model: modelSelected,
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
        content: accumulatedResponse,
      };
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
    }
  };
  const chat_room_title_generation = async (messages) => {
    const preprocess_messages = (messages, memory_length) => {
      let processed_messages =
        "Analyze the following conversation between the user and assistant, and generate a concise, descriptive title for the chat room in no more than 10 words.\n\n\n";

      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === "user") {
          processed_messages +=
            messages[i].role + ": " + messages[i].content + "\n\n\n";
        }
      }
      return processed_messages;
    };
    const extract_title = (response) => {
      const end_think_tag = "</think>";

      const content_after_thinking = response.split(end_think_tag)[1];
      let title = content_after_thinking.replace(/(\r\n|\n|\r|\t)/gm, "");
      title = title.replace(/[^a-zA-Z0-9 ]/g, "");
      return title;
    };
    const instruction = {
      role: "system",
      content:
        "Your task is to analyze a set of conversations between a user and an AI, then generate a concise and descriptive chat room title summarizing the overall topic or purpose of the conversation. The title must be clear, relevant, and contain fewer than 10 words.",
    };
    let processed_messages = preprocess_messages(messages, 7);
    processed_messages = [
      instruction,
      {
        role: "user",
        content: processed_messages,
      },
    ];

    try {
      const request = {
        model: modelSelected,
        messages: processed_messages,
        stream: false,
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
      const stringifiedResponse = await response.json();
      return extract_title(stringifiedResponse.message.content);
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
    }
  };
  /* { Ollama APIs } --------------------------------------------------------------------------------- */

  /* { load from storage if avaliable else open new section } */
  useEffect(() => {
    const historical_messages = JSON.parse(
      localStorage.getItem("AI_lounge_historical_messages") || "{}"
    );
    let chat_room_id = "";
    setHistoricalMessages(historical_messages);
    if (Object.keys(historical_messages).length === 0) {
      start_new_section();
    } else {
      setChatRoomID(Object.keys(historical_messages)[0]);
      chat_room_id = Object.keys(historical_messages)[0];
      setMessages(historical_messages[chat_room_id]["messages"] || []);
      setSectionStarted(true);
    }
  }, []);
  /* { assign window size listener } */
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);
  useEffect(() => {
    if (messages.length > 0) {
      setSectionStarted(true);
    } else {
      setSectionStarted(false);
    }
  }, [messages]);
  useEffect(() => {
    if (
      historicalMessages[chatRoomID] &&
      historicalMessages[chatRoomID]["messages"]
    ) {
      setMessages(historicalMessages[chatRoomID]["messages"]);
    } else {
      setMessages([]);
    }
  }, [chatRoomID, historicalMessages]);

  return (
    <RootDataContexts.Provider
      value={{
        windowWidth,
        setWindowWidth,
        chatRoomID,
        setChatRoomID,
        generate_unique_room_ID,
        messages,
        setMessages,
        historicalMessages,
        setHistoricalMessages,
        save_after_new_message,
        save_after_new_title,
        save_after_deleted,
        sectionStarted,
        setSectionStarted,
        start_new_section,

        chat_generation,
        chat_room_title_generation,
      }}
    >
      <div
        className="control-panel"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,

          overflow: "hidden",
          backgroundColor: `rgb(${R}, ${G}, ${B})`,
        }}
      >
        <img
          src={ollama}
          alt="ollama"
          style={{
            transition: "all 0.4s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            transform: "translate(-50%, -50%)",
            position: "fixed",

            bottom: sectionStarted ? "-3px" : "24px",
            left: "50%",

            width: 72,

            padding: 8,
            borderRadius: 8,
            opacity: sectionStarted ? 0 : 0.32,
          }}
        />
        <span
          style={{
            transition: "all 0.5s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "fixed",
            transform: "translate(-50%, -50%)",

            top: "calc(50% - 2px)",
            left: "50%",
            fontSize: 32,
            color: sectionStarted
              ? `rgba(255, 255, 255, 0)`
              : `rgba(255, 255, 255, 0.32)`,
          }}
        >
          power by Ollama
        </span>
        <div
          className="chat-section-wrapper"
          style={{
            transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            transform: "translate(-50%, 0%)",
            top: 6,
            left: "50%",
            bottom: 6,

            width: windowWidth <= 612 ? "calc(100% - 12px)" : 600,
          }}
        >
          <Chat_Section />
        </div>
        <Side_Menu />
      </div>
    </RootDataContexts.Provider>
  );
};

export default Control_Panel;
