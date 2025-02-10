import React, { useEffect, useState, useCallback, useContext } from "react";

const { RequestContexts } = require("./contexts");

const RequestContainer = ({ children }) => {
  return <RequestContexts.Provider>{children}</RequestContexts.Provider>;
};

export default RequestContainer;
