import React, { useEffect, useState, useCallback } from "react";

const { AgentContexts } = require("./contexts");

const AgentContainer = ({ children }) => {
  return <AgentContexts.Provider>{children}</AgentContexts.Provider>;
};

export default AgentContainer;
