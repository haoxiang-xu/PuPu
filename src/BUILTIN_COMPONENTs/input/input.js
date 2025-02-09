import React, { useEffect, useRef, useState, useContext } from "react";
import { RootDataContexts } from "../../DATA_MANAGERs/root_data_manager/root_data_contexts";
import { RootStatusContexts } from "../../DATA_MANAGERs/root_data_manager/root_status_contexts";
import TextareaAutosize from "react-textarea-autosize";

const default_font_size = 14;
const default_padding = default_font_size;

const R = 30;
const G = 30;
const B = 30;
const default_forground_color_offset = 12;

const default_max_rows = 16;

const Input = ({
  value,
  setValue,
  onSubmit,
  onFocus,
  setOnFocus,
  ...props
}) => {
  const { modelOnTask } = useContext(RootStatusContexts);
  const inputRef = useRef(null);
  const [height, setHeight] = useState(0);

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

    // Cleanup style when the component unmounts
    return () => {
      document.head.removeChild(styleElement);
    };
  }, []);

  /* { Placeholder } --------------------------------------------------------- */
  const [placeholder, setPlaceholder] = useState("Ask Ollama");
  useEffect(() => {
    if (modelOnTask === "generating") {
      setPlaceholder("Generating...");
    } else if (modelOnTask === "naming the chat room") {
      setPlaceholder("Naming the chat room...");
    } else {
      setPlaceholder("Ask ");
    }
  }, [modelOnTask]);
  /* { Placeholder } --------------------------------------------------------- */

  /* { Model Menu } ========================================================== */
  /* { Model Menu } ========================================================== */

  useEffect(() => {
    if (onFocus) {
      inputRef.current.focus();
      setOnFocus(false);
    }
  }, [onFocus]);
  useEffect(() => {
    if (inputRef.current) {
      setHeight(inputRef.current.clientHeight + 12);
    }
  }, [value, window.innerWidth, window.innerHeight]);

  return (
    <div
      style={{
        ...props.style,
        height: height,
        minHeight: default_font_size * 3.5,
        overflow: "hidden",
      }}
    >
      <TextareaAutosize
        ref={inputRef}
        className="scrolling-space"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        minRows={1}
        maxRows={default_max_rows}
        style={{
          position: "absolute",

          top: "50%",
          left: default_padding,
          right: 5,

          transform: "translateY(-50%)",

          color:
            props && props.style && props.style.color
              ? props.style.color
              : `#FFFFFF`,
          textAlign: "left",
          backgroundColor: `rgba(0, 0, 0, 0)`,
          padding: "0px 36px 0px 0px",
          fontSize:
            props && props.style && props.style.fontSize
              ? props.style.fontSize
              : default_font_size,
          fontFamily: "inherit",
          borderRadius: 0,
          opacity: "1",
          outline: "none",
          border: "none",
          resize: "none",
        }}
      />
      {props.children}
      <span
        style={{
          transition: "left 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 13,
          left: value.length !== 0 ? default_padding * 2 : default_padding,

          fontSize: default_font_size + 2,
          fontFamily: "inherit",
          fontWeight: 100,

          opacity: value.length !== 0 ? 0 : 0.32,
          pointerEvents: "none",
        }}
      >
        {placeholder}
      </span>
    </div>
  );
};

export default Input;
