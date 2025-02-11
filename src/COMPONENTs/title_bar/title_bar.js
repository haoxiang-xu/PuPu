import React, { useState, useRef, useEffect, useContext } from "react";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const Control_Panel = ({}) => {
  return (
    <div
      className="control_panel"
      style={{
        position: "absolute",
        top: 0,
        right: 0,

        width: 128,
        height: 40,

        WebkitAppRegion: "no-drag",
      }}
    >
      <Icon
        src="close"
        style={{
          position: "absolute",
          top: 3,
          right: 3,
          height: 20,

          opacity: 0.5,

          padding: 4,
          cursor: "pointer",
        }}
      />
      <Icon
        src="win32_maximize"
        style={{
          position: "absolute",
          top: 3,
          right: 26,
          height: 20,
          opacity: 0.5,
          padding: 4,
          cursor: "pointer",
        }}
      />
      <Icon
        src="win32_minimize"
        style={{
          position: "absolute",
          top: 3,
          right: 49,
          height: 20,
          opacity: 0.5,
          padding: 4,
          cursor: "pointer",
        }}
      />
    </div>
  );
};

const Title_Bar = ({}) => {
  return (
    <div
      className="title_bar"
      style={{
        position: "absolute",
        top: 0,
        left: 32,
        right: 0,
        height: 40,

        WebkitAppRegion: "drag",
      }}
    >
      <Control_Panel />
    </div>
  );
};

export default Title_Bar;
