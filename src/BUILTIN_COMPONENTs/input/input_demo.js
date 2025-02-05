import React, { useState, useEffect } from "react";
import Input from "./input";

const R = 200;
const G = 200;
const B = 200;

const default_forground_color_offset = 12;
const default_font_color_offset = 128;
const default_border_radius = 8;

const InputDemo = ({}) => {
  const [inputValue, setInputValue] = useState("");
  const [style, setStyle] = useState({
    colorOffset: 0,
  });
  const [onHover, setOnHover] = useState(false);
  const [onClicked, setOnClicked] = useState(false);

  const on_input_submit = () => {
    console.log(inputValue);
    setInputValue("");
  };

  useEffect(() => {
    if (onClicked) {
      setStyle({
        colorOffset: 64,
      });
    } else if (onHover) {
      setStyle({
        colorOffset: 16,
      });
    } else {
      setStyle({
        colorOffset: 0,
      });
    }
  }, [onHover, onClicked]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,

        backgroundColor: "rgba(0, 0, 0, 0.16)",
      }}
    >
      <Input
        value={inputValue}
        setValue={setInputValue}
        onSubmit={on_input_submit}
        style={{
          transition: "height 0.04s cubic-bezier(0.32, 1, 0.32, 1)",
          position: "fixed",

          bottom: "50%",
          left: "50%",
          width: "40%",
          transform: "translate(-50%, 0%)",

          padding: 4,

          color: "rgba(30, 30, 30, 1)",
          borderRadius: default_border_radius,
          backgroundColor: `rgba(${R + default_forground_color_offset}, ${
            G + default_forground_color_offset
          }, ${B + default_forground_color_offset}, 1)`,
          boxShadow: `0px 4px 32px rgba(0, 0, 0, 0.32)`,
        }}
      />
    </div>
  );
};

export default InputDemo;
