import React, { useEffect, useRef, useState, useContext } from "react";
import { DataContexts } from "../../CONTAINERs/data/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import TextareaAutosize from "react-textarea-autosize";

const default_font_size = 14;
const default_padding = default_font_size;

const default_max_rows = 16;

const Input = ({
  value,
  setValue,
  onSubmit,
  onFocus,
  setOnFocus,
  setInputHeight,
  ...props
}) => {
  const { ollamaOnTask } = useContext(StatusContexts);
  const { sectionData } = useContext(DataContexts);
  const inputRef = useRef(null);
  const [height, setHeight] = useState(0);

  /* { Placeholder } --------------------------------------------------------- */
  const [placeholder, setPlaceholder] = useState("Ask Ollama");
  useEffect(() => {
    const extract_status = (status) => {
      let result = status.match(/\[(.*?)\]/);
      if (result) {
        return result[1];
      } else {
        return null;
      }
    };
    if (sectionData.language_model_using) {
      if (ollamaOnTask) {
        setPlaceholder(extract_status(ollamaOnTask));
      } else {
        setPlaceholder("Ask ");
      }
    } else {
      setPlaceholder("Pick");
    }
  }, [ollamaOnTask, sectionData.language_model_using]);
  /* { Placeholder } --------------------------------------------------------- */

  useEffect(() => {
    if (onFocus) {
      inputRef.current.focus();
      setOnFocus(false);
    }
  }, [onFocus]);
  useEffect(() => {
    if (inputRef.current) {
      setHeight(inputRef.current.clientHeight + 12);
      setInputHeight(inputRef.current.clientHeight + 12);
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

          top: "50%",
          transform: "translate(0%, -50%)",
          left: value.length !== 0 ? default_padding * 2 : default_padding,

          fontSize: default_font_size + 2,
          fontFamily: "inherit",
          fontWeight: 100,
          color:
            props && props.style && props.style.color
              ? props.style.color
              : `#FFFFFF`,

          opacity: value.length !== 0 ? 0 : 0.5,
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        {placeholder}
      </span>
    </div>
  );
};

export default Input;
