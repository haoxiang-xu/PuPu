import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const XTerm = () => {
  const terminalRef = useRef(null);
  const term = useRef(null);
  const fitAddon = useRef(null);
  const [apiReady, setApiReady] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddon.current && term.current) {
        fitAddon.current.fit();
        const dims = fitAddon.current.proposeDimensions();
        if (dims) {
          window.terminalAPI.resizeTerminal(dims.cols, dims.rows);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize terminal
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

  // Setup terminal
  useEffect(() => {
    if (!apiReady || !terminalRef.current || term.current) return;

    term.current = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
      }
    });

    fitAddon.current = new FitAddon();
    term.current.loadAddon(fitAddon.current);
    term.current.open(terminalRef.current);

    // Initial fit
    setTimeout(() => {
      if (fitAddon.current) {
        fitAddon.current.fit();
        const dims = fitAddon.current.proposeDimensions();
        if (dims) {
          window.terminalAPI.resizeTerminal(dims.cols, dims.rows);
        }
      }
    }, 100);

    // Setup event handlers
    if (window.terminalAPI) {
      term.current.onData((data) => {
        window.terminalAPI.terminalEventHandler(data);
      });

      window.terminalAPI.terminalEventListener((data) => {
        term.current.write(data);
      });
    }

    return () => {
      if (term.current) {
        term.current.dispose();
        term.current = null;
      }
    };
  }, [apiReady]);

  if (!showTerminal) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "#1e1e1e",
      }}
    >
      {/* Close Button */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          right: "12px",
          zIndex: 1000,
          padding: "8px",
          borderRadius: "4px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          transition: "background-color 0.2s ease",
        }}
        onClick={() => setShowTerminal(false)}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)"}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)"}
      >
        <Icon
          src="close"
          style={{
            width: "16px",
            height: "16px",
            opacity: 0.8,
          }}
        />
      </div>

      <div
        ref={terminalRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "80%",
          height: "80%",
          overflow: "hidden",
        }}
      />
    </div>
  );
};

export default XTerm;
