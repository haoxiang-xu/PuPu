import React, { useState, useEffect } from "react";

import { RootStatusContexts } from "../root_status_manager/root_status_contexts";

const RootStatusManager = ({ children }) => {
  const [componentOnFocus, setComponentOnFocus] = useState("");
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

  /* { Model Related } ------------------------------------------------------------------------------- */
  const [modelOnTask, setModelOnTask] = useState(null);
  /* { Model Related } ------------------------------------------------------------------------------- */

  return (
    <RootStatusContexts.Provider
      value={{
        /* { UI Related Status } ============================================================================= */
        /* { which UI component is selected } */
        componentOnFocus,
        setComponentOnFocus,
        /* { window width } */
        windowWidth,
        setWindowWidth,
        /* { UI Related Status } ============================================================================= */

        /* { Model Related Status } ========================================================================== */
        /* { indicate current model working on task } */
        modelOnTask,
        setModelOnTask,
        /* { Model Related Status } ========================================================================== */
      }}
    >
      {children}
    </RootStatusContexts.Provider>
  );
};

export default RootStatusManager;
