import { useEffect, useRef, useState, useContext } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import "xterm/css/xterm.css";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const Term = () => {
  const { scrollingSapce, RGB, colorOffset, markdown } = useContext(ConfigContexts);
  const { windowWidth } = useContext(StatusContexts);
  const { trigger_section_mode } = useContext(DataContexts);

  const terminalRef = useRef(null);
  const term = useRef(null);
  const fitAddon = useRef(null);
  const [apiReady, setApiReady] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);

  /* { Terminal Scrolling Bar Styling} ----------------------------------------------- */
  useEffect(() => {
    const styleElement = document.createElement("style");
    styleElement.innerHTML = `
    .xterm-viewport::-webkit-scrollbar {
      width: 8px;
    }
    .xterm-viewport::-webkit-scrollbar-track {
      background-color: rgb(225, 225, 225, 0);
    }
    .xterm-viewport::-webkit-scrollbar-thumb {
      background-color: ${scrollingSapce.backgroundColor};
      border-radius: 6px;
      border: ${scrollingSapce.border};
    }
    .xterm-viewport::-webkit-scrollbar-thumb:hover {
    }
    .xterm-viewport::-webkit-scrollbar:horizontal {
      display: none;
    }
  `;
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }, [scrollingSapce]);
  /* { Terminal Scrolling Bar Styling} ----------------------------------------------- */

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

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
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
      cursorStyle: "block",
      fontSize: 14,
      fontFamily: "'Hack Nerd Font', monospace",
      theme: {
        background: `rgb(${RGB.R}, ${RGB.G}, ${RGB.B})`,
        foreground: `rgb(${RGB.R + colorOffset.font}, ${
          RGB.G + colorOffset.font
        }, ${RGB.B + colorOffset.font})`,
      },
      scrollback: 5000,
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

      // Setup event listener and error handler for xterm instance
      const cleanup = window.terminalAPI.terminalEventListener((data) => {
        term.current?.write(data);
        term.current?.scrollToBottom();
      });

      return () => {
        // Cleanup event listeners
        cleanup?.();
        if (term.current) {
          term.current.dispose();
          term.current = null;
        }
      };
    }
  }, [apiReady, markdown]);

  if (!showTerminal) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: `rgb(${RGB.R}, ${RGB.G}, ${RGB.B})`,
        overflow: "hidden",
      }}
    >
      {/* Close Button */}
      <div
        style={{
          position: "absolute",
          top: "24px",
          right: "0px",
          zIndex: 1,
          padding: "8px",
          borderRadius: "4px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          transition: "background-color 0.2s ease",
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => {
          setShowTerminal(false);
          trigger_section_mode("terminal");
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.2)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)")
        }
      >
        <Icon
          src="close"
          style={{
            width: "16px",
            height: "16px",
            opacity: 0.8,
            userSelect: "none",
          }}
        />
      </div>

      <div
        ref={terminalRef}
        style={{
          transition: "width 0.16s",
          position: "absolute",
          transform: "translate(-50%, 0%)",
          top: 55,
          left: "50%",
          padding: 6,
          width: windowWidth > 730 ? 680 : windowWidth - 50,
          bottom: 72,
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};

export default Term;
