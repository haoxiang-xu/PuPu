import React, { useEffect, useState, useContext } from "react";
import { RootDataContexts } from "../root_data_contexts";
import ollama from "./ollama.png";
import Chat_Section from "../chat_section/chat_section";
import Side_Menu from "../side_menu/side_menu";

const R = 30;
const G = 30;
const B = 30;

const Control_Panel = ({}) => {
  const [chatRoomID, setChatRoomID] = useState("");
  const [messages, setMessages] = useState([]);
  const [historicalMessages, setHistoricalMessages] = useState({});
  const [sectionStarted, setSectionStarted] = useState(true);

  const generateUniqueID = () => {
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
  useEffect(() => {
    const historical_messages = JSON.parse(
      localStorage.getItem("AI_lounge_historical_messages") || "{}"
    );
    let chat_room_id = "";
    setHistoricalMessages(historical_messages);
    if (Object.keys(historical_messages).length === 0) {
      setChatRoomID(generateUniqueID());
      setSectionStarted(false);
    } else {
      setChatRoomID(Object.keys(historical_messages)[0]);
      chat_room_id = Object.keys(historical_messages)[0];
      setMessages(historical_messages[chat_room_id] || []);
      setSectionStarted(true);
    }
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
        chatRoomID,
        setChatRoomID,
        generateUniqueID,
        messages,
        setMessages,
        historicalMessages,
        setHistoricalMessages,
        sectionStarted,
        setSectionStarted,
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

            width: "50%",
            minWidth: 512,
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
