import React, { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

const XTerm = () => {
  const terminalRef = useRef(null);
  const term = useRef(null);
  const fitAddon = useRef(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    term.current = new Terminal();
    fitAddon.current = new FitAddon();
    term.current.loadAddon(fitAddon.current);
    term.current.open(terminalRef.current);

    fitAddon.current.fit();
    term.current.onData((data) => {
      window.terminalAPI.terminalEventHandler(data);
    });
    window.terminalAPI.terminalEventListener((data) => {
      term.current.write(data);
    });

    return () => {
      term.current.dispose();
    };
  }, []);

  return <div ref={terminalRef} style={{ width: "100vw", height: "100vh" }} />;
};

export default XTerm;
