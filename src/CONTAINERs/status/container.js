import React, { useState, useEffect, use } from "react";

import { StatusContexts } from "./contexts";

const StatusContainer = ({ children }) => {
  const [componentOnFocus, setComponentOnFocus] = useState("");
  const [onDialog, setOnDialog] = useState("");

  /* { API Status } =================================================================================== */
  /* 
    null: ---------------------------------- await for response
    false: ------------------------------------ response failed
    true: ------------------------------------ response success
  */
  const [ollamaServerStatus, setOllamaServerStatus] = useState(null);
  useEffect(() => {
    if (ollamaServerStatus === null || ollamaServerStatus === true) {
      setOnDialog("");
    } else {
      setOnDialog("await_ollama_setup_warning");
    }
  }, [ollamaServerStatus]);
  /* { API Status } =================================================================================== */

  /* { Ollama Related Status } ------------------------------------------------------------------------ */
  const [ollamaPendingDeleteModels, setOllamaPendingDeleteModels] = useState(
    []
  );
  const [ollamaPendingDownloadModels, setOllamaPendingDownloadModels] =
    useState([]);
  const [ollamaInstallingStatus, setOllamaInstallingStatus] = useState(null);
  /* { Ollama Related Status } ------------------------------------------------------------------------ */

  /* { Event Listener } ------------------------------------------------------------------------------- */
  /* { window size listener } */
  const [windowIsMaximized, setWindowIsMaximized] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    window.windowStateAPI.windowStateEventListener(({ isMaximized }) => {
      setWindowIsMaximized(isMaximized);
    });
  }, []);
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

  /* { Request Related } ------------------------------------------------------------------------------- */
  const [ollamaOnTask, setOllamaOnTask] = useState(null);
  /* { Request Related } ------------------------------------------------------------------------------- */

  return (
    <StatusContexts.Provider
      value={{
        /* { UI Related Status } ======================================================== { UI Related Status } */
        /* { which UI component is selected } */
        componentOnFocus,
        setComponentOnFocus,
        onDialog,
        setOnDialog,
        /* { window width } */
        windowWidth,
        setWindowWidth,
        windowIsMaximized,
        setWindowIsMaximized,
        /* { UI Related Status } ============================================================================== */

        /* { API Status } ====================================================================== { API Status } */
        ollamaServerStatus,
        setOllamaServerStatus,
        /* { API Status } ===================================================================================== */

        /* { Ollama Related Status } ================================================ { Ollama Related Status } */
        /* { pending delete models } */
        ollamaPendingDeleteModels,
        setOllamaPendingDeleteModels,
        /* { pending download models } */
        ollamaPendingDownloadModels,
        setOllamaPendingDownloadModels,
        /* { installing status } */
        ollamaInstallingStatus,
        setOllamaInstallingStatus,
        /* { Ollama Related Status } ========================================================================= */

        /* { Model Related Status } ================================================== { Model Related Status } */
        /* { indicate current model working on task } */
        ollamaOnTask,
        setOllamaOnTask,
        /* { Model Related Status } =========================================================================== */
      }}
    >
      {children}
    </StatusContexts.Provider>
  );
};

export default StatusContainer;
