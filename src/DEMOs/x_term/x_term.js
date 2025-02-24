import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

const XTerm = () => {
  const terminalRef = useRef(null);
  const term = useRef(null);
  const fitAddon = useRef(null);
  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    if (!window.terminalAPI) {
      const checkAPI = setInterval(() => {
        if (window.terminalAPI) {
          setApiReady(true);
          clearInterval(checkAPI);
        }
      }, 100);
      return () => clearInterval(checkAPI);
    } else {
      setApiReady(true);
    }
  }, []);
  useEffect(() => {
    if (!apiReady || !terminalRef.current || term.current) return;

    term.current = new Terminal();
    fitAddon.current = new FitAddon();
    term.current.loadAddon(fitAddon.current);
    term.current.open(terminalRef.current);
    fitAddon.current.fit();

    if (window.terminalAPI) {
      term.current.onData((data) => {
        window.terminalAPI.terminalEventHandler(data);
      });
      window.terminalAPI.terminalEventListener((data) => {
        term.current.write(data);
      });
    }

    return () => {
      term.current.dispose();
      term.current = null;
    };
  }, [apiReady]);

  return (
    <div>
      <div
        ref={terminalRef}
        style={{
          position: "absolute",
          transform: "translate(-50%, -50%)",
          top: "50%",
          left: "50%",
          width: "50%",

          overflow: "hidden",
        }}
      />
    </div>
  );
};

export default XTerm;
