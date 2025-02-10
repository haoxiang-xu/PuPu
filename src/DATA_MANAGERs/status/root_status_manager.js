import React, { useState, useEffect } from "react";

import { StatusContexts } from "./contexts";

const RootStatusManager = ({ children }) => {
  const [componentOnFocus, setComponentOnFocus] = useState("");

  /* { API Status } =================================================================================== */
  /* 
    null: ---------------------------------- await for response
    false: ------------------------------------ response failed
    true: ------------------------------------ response success
  */
  const [ollamaServerStatus, setOllamaServerStatus] = useState(null);
  /* { API Status } =================================================================================== */

  /* { Event Listener } ------------------------------------------------------------------------------- */
  /* { window size listener } */
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
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

  /* { Model Related } ------------------------------------------------------------------------------- */
  const [modelOnTask, setModelOnTask] = useState(null);
  /* { Model Related } ------------------------------------------------------------------------------- */

  return (
    <StatusContexts.Provider
      value={{
        /* { UI Related Status } ======================================================== { UI Related Status } */
        /* { which UI component is selected } */
        componentOnFocus,
        setComponentOnFocus,
        /* { window width } */
        windowWidth,
        setWindowWidth,
        /* { UI Related Status } ============================================================================== */

        /* { API Status } ====================================================================== { API Status } */
        ollamaServerStatus,
        setOllamaServerStatus,
        /* { API Status } ===================================================================================== */

        /* { Model Related Status } ================================================== { Model Related Status } */
        /* { indicate current model working on task } */
        modelOnTask,
        setModelOnTask,
        /* { Model Related Status } =========================================================================== */
      }}
    >
      {children}
    </StatusContexts.Provider>
  );
};

export default RootStatusManager;
