import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import RootConfigManager from "./DATA_MANAGERs/config/root_config_manager";
import RootStatusManager from "./DATA_MANAGERs/status/root_status_manager";
import RootDataManager from "./DATA_MANAGERs/data/root_data_manager";

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
          <Route
            path="/"
            element={
              <RootConfigManager>
                <RootStatusManager>
                  <RootDataManager />
                </RootStatusManager>
              </RootConfigManager>
            }
          />
        </Routes>
      </Router>
    </div>
  );
};

export default App;
