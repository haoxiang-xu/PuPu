import React, { useEffect, useState } from "react";
import ollama from "./ollama.png";
import Chat_Section from "../chat_section/chat_section";
import Side_Menu from "../side_menu/side_menu";

const R = 30;
const G = 30;
const B = 30;

const Control_Panel = ({}) => {
  const [messages, setMessages] = useState([]);
  const [sectionStarted, setSectionStarted] = useState(false);

  useEffect(() => {
    if (messages.length > 0) {
      setSectionStarted(true);
    }
  }, [messages]);

  return (
    <div
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

          bottom: sectionStarted ? "-3px" : "12px",
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
          color: sectionStarted ? `rgba(255, 255, 255, 0)` : `rgba(255, 255, 255, 0.32)`,
        }}
      >
        power by Ollama
      </span>
      <div
        className="chat-section-wrapper"
        style={{
          position: "absolute",
          transform: "translate(-50%, 0%)",
          top: 6,
          left: "50%",
          bottom: 6,
          
          width: "50%",
          minWidth: 512,
        }}
      >
        <Chat_Section messages={messages} setMessages={setMessages} />
      </div>
      <Side_Menu />
    </div>
  );
};

export default Control_Panel;
