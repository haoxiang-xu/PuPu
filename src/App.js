import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

import Control_Panel from "./COMPONENTs/control_panel/control_panel";

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Control_Panel />} />
      </Routes>
    </Router>
  );
};

export default App;
