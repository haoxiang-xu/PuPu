import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import Control_Panel from "./COMPONENTs/control_panel/control_panel";

const App = () => {
  const [RGB, setRGB] = useState({ R: 30, G: 30, B: 30 });
  const [fontFamily, setFontFamily] = useState("Jost");

  useEffect(() => {
    document.body.style.backgroundColor = `rgb(${RGB.R}, ${RGB.G}, ${RGB.B})`;
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, []);

  return (
    <div
      style={{
        fontFamily: fontFamily,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&display=swap"
        rel="stylesheet"
      ></link>
      <Router>
        <Routes>
          <Route path="/" element={<Control_Panel />} />
        </Routes>
      </Router>
    </div>
  );
};

export default App;
