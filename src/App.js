import React, { useState, useEffect } from "react";
import { HashRouter } from "react-router-dom";

import ConfigContainer from "./CONTAINERs/config/container";
import StatusContainer from "./CONTAINERs/status/container";
import RequestContainer from "./CONTAINERs/requests/container";
import DataContainer from "./CONTAINERs/data/container";

import GraphDemo from "./DEMOs/node_graph/graph_demo";

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
      <HashRouter>
        <ConfigContainer>
          <StatusContainer>
            <RequestContainer>
              <DataContainer />
            </RequestContainer>
          </StatusContainer>
        </ConfigContainer>
      </HashRouter>
    </div>
  );
};

export default App;
