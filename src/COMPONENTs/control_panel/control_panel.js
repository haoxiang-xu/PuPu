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
        newHistoricalMessages[chatRoomID] = { messages: messages_to_save };
        localStorage.setItem(
          "AI_lounge_historical_messages",
          JSON.stringify(newHistoricalMessages)
        );
        return newHistoricalMessages;
      });
    },
    [chatRoomID, messages, historicalMessages]
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
    setMessages(historicalMessages[chatRoomID] || []);
  }, [chatRoomID]);

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
        save_after_deleted,
        sectionStarted,
        setSectionStarted,
        start_new_section,
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
