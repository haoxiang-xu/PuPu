import React, { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

const default_font_size = 14;
const default_padding = default_font_size;

const R = 30;
const G = 30;
const B = 30;

const default_max_rows = 16;

const Input = ({ value, setValue, onSubmit, ...props }) => {
  const inputRef = useRef(null);
  const [height, setHeight] = useState(0);

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
        overflow: "hidden",
      }}
    >
      <TextareaAutosize
        ref={inputRef}
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
          right: default_padding,

          transform: "translateY(-50%)",

          color:
            props && props.style && props.style.color
              ? props.style.color
              : `#FFFFFF`,
          textAlign: "left",
          backgroundColor: `rgba(0, 0, 0, 0)`,
          padding: 0,
          fontSize: props && props.style && props.style.fontSize ? props.style.fontSize : default_font_size,
          fontFamily: "inherit",
          borderRadius: 0,
          opacity: "1",
          outline: "none",
          border: "none",
          resize: "none",
        }}
      />
    </div>
  );
};

export default Input;
