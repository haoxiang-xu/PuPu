import React, { useEffect, useState } from "react";
import { RootStatusContexts } from "../root_status_contexts";
import RootRequestManager from "../root_request_manager/root_request_manager";
import Control_Panel from "../../COMPONENTs/control_panel/control_panel";

const RootDataManager = () => {
  const [componentOnFocus, setComponentOnFocus] = useState("");
  const [modelOnTask, setModelOnTask] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  /* { Event Listener } ------------------------------------------------------------------------------- */
  /* { window size listener } */
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
  /* { Event Listener } ------------------------------------------------------------------------------- */

  return (
    <RootStatusContexts.Provider
      value={{
        componentOnFocus,
        setComponentOnFocus,
        modelOnTask,
        setModelOnTask,
        windowWidth,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        onClick={() => {
          setComponentOnFocus("");
        }}
      >
        <RootRequestManager>
          <Control_Panel />
        </RootRequestManager>
      </div>
    </RootStatusContexts.Provider>
  );
};

export default RootDataManager;
