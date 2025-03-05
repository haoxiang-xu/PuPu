import React, { useState, useRef, useEffect, useContext } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import ollama_pupu from "./ollama_pupu.png";
import ollama_pupu_ from "./ollama_pupu_.png";

import Chat from "../../COMPONENTs/chat/chat";
import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";

const Chat_Page = ({}) => {
  const { RGB, theme } = useContext(ConfigContexts);
  const { sectionStarted } = useContext(DataContexts);

  /* { Title } ------------------------------------------------------------------------------ */
  const title_list = [
    "🧠 Ask me anything!",
    "🚀 Your AI assistant is ready!",
    "🌎 Exploring knowledge with AI",
    "🛸 Chatting with the future!",
    "Powered by Ollama",
  ];
  const [logo_title, setLogoTitle] = useState(title_list[0]);
  const logoTitleRef = useRef(logo_title);
  useEffect(() => {
    if (sectionStarted) return;
    if (title_list.includes(logo_title.trim())) {
      logoTitleRef.current = logo_title;
      const interval = setInterval(titleSwitch, 6000);
      return () => {
        clearInterval(interval);
      };
    }
  }, [logo_title, sectionStarted]);
  const titleSwitch = () => {
    if (title_list.includes(logo_title.trim())) {
      let currentIndex = title_list.indexOf(logo_title.trim());
      let nextIndex = 0;
      if (currentIndex === title_list.length - 1) {
        nextIndex = 0;
      } else {
        nextIndex = currentIndex + 1;
      }
      textSwitch(title_list[currentIndex], title_list[nextIndex]);
    }
  };
  const textSwitch = (switchFromText, switchToText) => {
    setLogoTitle(switchFromText);

    let character = [
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
      "k",
      "l",
      "m",
      "n",
      "o",
      "p",
      "q",
      "r",
      "s",
      "t",
      "u",
      "v",
      "w",
      "x",
      "y",
      "z",
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      " ",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      ".",
      ",",
      "?",
      "!",
      "@",
      "#",
      "$",
      "%",
      "^",
      "&",
      "*",
      "(",
      ")",
      "[",
      "]",
      "{",
      "}",
      "<",
      ">",
      "`",
      ":",
      ";",
      "'",
      '"',
      "-",
      "_",
      "+",
      "=",
      "/",
      "\\",
      "|",
    ];
    let currentText = "";

    //Makes the switchToText the same length as switchFromText
    if (switchFromText.length > switchToText.length) {
      let difference = switchFromText.length - switchToText.length;
      for (let i = 0; i < difference; i++) {
        switchToText += " ";
      }
    } else if (switchFromText.length < switchToText.length) {
      let difference = switchToText.length - switchFromText.length;
      for (let i = 0; i < difference; i++) {
        switchFromText += "_";
      }
    }
    currentText = switchFromText;

    let clockTime = 6;
    for (let c = 0; c <= switchToText.length; c++) {
      let c_from_index = character.indexOf(switchFromText[c]);
      let c_to_index = character.indexOf(switchToText[c]);

      let difference = 0;

      if (c_from_index < c_to_index) {
        difference = c_to_index - c_from_index;
        for (let d = 0; d <= difference; d++) {
          (function (currentText) {
            currentText = replaceCharAtIndex(
              currentText,
              c,
              character[c_from_index + d]
            );
            setTimeout(() => {
              setLogoTitle(currentText);
            }, clockTime);
          })(currentText);
          clockTime += 3;
        }
      } else {
        difference = c_from_index - c_to_index;
        for (let d = 0; d <= difference; d++) {
          (function (currentText) {
            currentText = replaceCharAtIndex(
              currentText,
              c,
              character[c_from_index + d]
            );
            setTimeout(() => {
              setLogoTitle(currentText);
            }, clockTime);
          })(currentText); // Pass the currentText to the IIFE
          clockTime += 3;
        }
      }
      currentText = replaceCharAtIndex(currentText, c, switchToText[c]).trim();
    }
  };
  const replaceCharAtIndex = (originalString, index, newChar) => {
    if (index < 0 || index >= originalString.length) {
      return originalString;
    }

    const stringArray = originalString.split("");
    stringArray[index] = newChar;
    const newString = stringArray.join("");

    return newString;
  };
  /* { Title } ------------------------------------------------------------------------------ */

  return (
    <div
      className="control-panel"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,

        overflow: "hidden",
        backgroundColor: `rgb(${RGB.R}, ${RGB.G}, ${RGB.B})`,
      }}
    >
      <img
        src={theme === "dark_theme" ? ollama_pupu : ollama_pupu_}
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
          userSelect: "none",
        }}
      />
      {!sectionStarted ? (
        <div
          style={{
            transition: "all 0.5s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            transform: "translate(-50%, -50%)",

            top: "calc(50% - 2px)",
            left: "50%",
            width: "100%",
            textAlign: "center",
            fontSize: 32,
            color: sectionStarted
              ? `rgba(255, 255, 255, 0)`
              : `rgba(${RGB.R + 72}, ${RGB.G + 72}, ${RGB.B + 72}, 1)`,
          }}
        >
          <Markdown
            style={{
              backgroundColor: "rgba(0, 0, 0, 0)",
            }}
          >
            {logo_title}
          </Markdown>
        </div>
      ) : null}
      <div
        className="chat-section-wrapper"
        style={{
          transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",

          top: 6,
          left: 6,
          right: 6,
          bottom: 2,
        }}
      >
        <Chat />
      </div>
    </div>
  );
};

export default Chat_Page;
