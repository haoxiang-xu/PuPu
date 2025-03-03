import React, { useContext, createContext, useEffect } from "react";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { StatusContexts } from "../../CONTAINERs/status/contexts";

const TitleBarContexts = createContext("");

const Control_Panel = ({}) => {
  const { windowIsMaximized } = useContext(StatusContexts);
  const { handleClose, handleMinimize, handleMaximize } =
    useContext(TitleBarContexts);
  const [onHover, setOnHover] = React.useState(false);

  return (
    <div
      className="control_panel"
      style={{
        position: "absolute",
        top: 0,
        right: 0,

        width: 83,
        height: 36,

        WebkitAppRegion: "no-drag",
      }}
      onMouseEnter={() => setOnHover(true)}
      onMouseLeave={() => setOnHover(false)}
    >
      <Icon
        src="close"
        style={{
          transition: "opacity 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 3,
          right: 3,
          height: 20,
          opacity: onHover ? 1 : 0.72,
          padding: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={handleClose}
      />
      <Icon
        src={windowIsMaximized ? "win32_restore" : "win32_maximize"}
        style={{
          transition: "opacity 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 3,
          right: 26,
          height: 20,
          opacity: onHover ? 1 : 0.72,
          padding: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={handleMaximize}
      />
      <Icon
        src="win32_minimize"
        style={{
          transition: "opacity 0.12s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 3,
          right: 51,
          height: 20,
          opacity: onHover ? 1 : 0.72,
          padding: 4,
          cursor: "pointer",
          userSelect: "none",
        }}
        onClick={handleMinimize}
      />
    </div>
  );
};

const Title_Bar = ({}) => {
  const handleClose = () => {
    window.windowStateAPI.windowStateEventHandler("close");
  };
  const handleMinimize = () => {
    window.windowStateAPI.windowStateEventHandler("minimize");
  };
  const handleMaximize = () => {
    window.windowStateAPI.windowStateEventHandler("maximize");
  };
  
  return (
    <div
      className="title_bar"
      style={{
        position: "absolute",
        top: 0,
        left: window.osInfo.platform === "darwin" ? 128 : 32,
        right: 0,
        height: 40,

        WebkitAppRegion: "drag",
      }}
    >
      <TitleBarContexts.Provider
        value={{ handleClose, handleMinimize, handleMaximize }}
      >
        {window.osInfo.platform !== "darwin" ? <Control_Panel /> : null}
      </TitleBarContexts.Provider>
    </div>
  );
};

export default Title_Bar;
