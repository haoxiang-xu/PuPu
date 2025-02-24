import React, { useState, useEffect } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";

import ConfigContainer from "./CONTAINERs/config/container";
import StatusContainer from "./CONTAINERs/status/container";
import RequestContainer from "./CONTAINERs/requests/container";
import DataContainer from "./CONTAINERs/data/container";

import GraphDemo from "./DEMOs/node_graph/graph_demo";
import XTerm from "./DEMOs/x_term/x_term";

const App = () => {
  return (
    <div>
      <HashRouter>
        <ConfigContainer>
          <StatusContainer>
            <RequestContainer>
              <DataContainer />
            </RequestContainer>
          </StatusContainer>
        </ConfigContainer>
        {/* <GraphDemo /> */}
        <XTerm />
      </HashRouter>
    </div>
  );
};

export default App;
