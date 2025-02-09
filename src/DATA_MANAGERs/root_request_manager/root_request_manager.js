import React, { useEffect, useState } from "react";
import { RootRequestContexts } from "./root_request_contexts";

const RootRequestManager = ({ children }) => {
  return (
    <RootRequestContexts.Provider value={{}}>
      {children}
    </RootRequestContexts.Provider>
  );
};

export default RootRequestManager;
