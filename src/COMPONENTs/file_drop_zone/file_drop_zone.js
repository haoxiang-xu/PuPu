import React, { useState, useContext } from "react";
// const { ipcRenderer } = window.require("electron"); // Import ipcRenderer for communication

import { ConfigContexts } from "../../CONTAINERs/config/contexts";

const FileDropZone = () => {
  const { RGB, colorOffset, dialog } = useContext(ConfigContexts);
  const [image, setImage] = useState(null);
  const [onDragOver, setOnDragOver] = useState(false);

  const handleDragOver = (event) => {
    setOnDragOver(true);
    console.log("drag over");
    event.preventDefault(); // Prevent default to allow drop
  };
  const handleDrop = (event) => {
    event.preventDefault();

    const file = event.dataTransfer.files[0]; // Get the first file

    if (file && file.type.startsWith("image/")) {
      const filePath = file.path; // Get the file path
      setImage(filePath); // Update state (optional)

      // Send the image path to the Electron main process
      //   ipcRenderer.send("image-dropped", filePath);
    } else {
      alert("Please drop an image file.");
    }
  };

  return (
    <div
      style={{
        transition: "opacity 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        backgroundColor: dialog.backgroundColor,
        backdropFilter: "blur(16px)",
        opacity: onDragOver ? 1 : 0,
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => setOnDragOver(false)}
      onDrop={handleDrop}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",

          width: 207,
          height: 128,
          border: `2px dashed rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,
          fontSize: 18,
          borderRadius: 8,
        }}
      >
        {image ? (
          <p>Image Selected: {image}</p>
        ) : (
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
        )}
      </div>
    </div>
  );
};

export default FileDropZone;
