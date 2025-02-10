import React, { useEffect, useState, useCallback, useContext } from "react";

const { RootRequestContexts } = require("./root_request_contexts");

const RootRequestManager = ({ children }) => {
  return (
    <RootRequestContexts.Provider>{children}</RootRequestContexts.Provider>
  );
};

export { RootRequestManager };
