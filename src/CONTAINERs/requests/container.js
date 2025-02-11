import React, { useEffect, useState, useCallback, useContext } from "react";

const { RequestContexts } = require("./contexts");

const RequestContainer = ({ children }) => {
  /* { Ollama APIs } ---------------------------------------------------------------------------------- */
  const get_ollama_version = async () => {
    try {
      const response = await fetch(`http://localhost:11434/api/version`);
      if (!response.ok) {
        console.error("API request failed:", response.statusText);
        return;
      }
      const data = await response.json();
      if (!data || !data.version) {
        console.error("Invalid API response:", data);
        return;
      }
      return data.version;
    } catch (error) {
      console.error("Error communicating with Ollama:", error);
    }
  };
  /* { Ollama APIs } ---------------------------------------------------------------------------------- */

  return <RequestContexts.Provider
    value={{
      get_ollama_version
    }}
  >{children}</RequestContexts.Provider>;
};

export default RequestContainer;
