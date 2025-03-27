import React, { useState, useContext, useEffect } from "react";
// const { ipcRenderer } = window.require("electron"); // Import ipcRenderer for communication

import { ConfigContexts } from "../../CONTAINERs/config/contexts";

import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const FileDropZone = ({
  onFileDragOver,
  setOnFileDragOver,
  setInputFiles,
}) => {
  const { RGB, colorOffset, dialog } = useContext(ConfigContexts);
  const [style, setStyle] = useState({
    top: "calc(50% + 64px)",
  });
  useEffect(() => {
    setStyle({
      top: "50%",
    });
  }, []);

  const handleDragOver = (event) => {
    event.preventDefault(); // Prevent default to allow drop
  };
  const handleDrop = (event) => {
    event.preventDefault();

    const files = event.dataTransfer.files;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setInputFiles((prev) => [...prev, reader.result]);
        };
        reader.readAsDataURL(file);
      }
    }
    setOnFileDragOver(false);
  };

  return (
    <div
      style={{
        transition: "opacity 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "absolute",
        top: -5,
        left: -5,
        bottom: -5,
        right: -5,
        backgroundColor: dialog.backgroundColor,
        backdropFilter: "blur(16px)",
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => setOnFileDragOver(false)}
      onDrop={handleDrop}
    >
      <div
        style={{
          transition: "all 0.24s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: style.top,
          left: "50%",
          transform: "translate(-50%, -50%)",

          width: 207,
          height: 128,
          border: `2px dashed rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,
          fontSize: 18,
          borderRadius: 8,
          pointerEvents: "none",
        }}
      >
        <Icon
          src="upload"
          style={{
            position: "absolute",
            top: 32,
            left: "50%",
            transform: "translate(-50%, -50%)",

            width: 32,
          }}
        />

        <span
          style={{
            position: "absolute",

            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",

            width: "100%",
            textAlign: "center",
            color: `rgba(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 1)`,
          }}
        >
          Release to Upload
        </span>
      </div>
    </div>
  );
};

export default FileDropZone;
