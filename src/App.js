/* { Containers } -------------------------------------------------------------------------------------------------------------- */
import ConfigContainer from "./CONTAINERs/config/container";
import {
  Router,
  Routes,
  Route,
} from "./BUILTIN_COMPONENTs/mini_react/mini_router";
/* { Containers } -------------------------------------------------------------------------------------------------------------- */

/* { Demos ( remove during production ) } -------------------------------------------------------------------------------------- */
import DemoPage from "./PAGEs/demo/demo";
/* { Demos ( remove during production ) } -------------------------------------------------------------------------------------- */

const App = () => {
  return (
    <ConfigContainer>
      <Router>
        <Routes>
          {/* { Demos ( remove during production ) } --------------------------------------------------------------------- */}
          <Route path="/mini" element={<DemoPage />} />
          {/* { Demos ( remove during production ) } --------------------------------------------------------------------- */}
        </Routes>
      </Router>
    </ConfigContainer>
  );
};

export default App;
