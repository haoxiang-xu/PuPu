import React, { useEffect, useState, useCallback } from "react";

import { RootConfigContexts } from "./root_config_contexts";

import { chat_room_title_generation_prompt } from "./default_instructions";

const RootConfigManager = ({ children }) => {
  const [instructions, setInstructions] = useState({
    chat_room_title_generation_prompt: chat_room_title_generation_prompt,
  });
  const [RGB, setRGB] = useState({
    R: 30,
    G: 26,
    B: 30,
  });

  return (
    <>
      <RootConfigContexts.Provider
        value={{
          instructions,
          RGB,
        }}
      >
        {children}
      </RootConfigContexts.Provider>
    </>
  );
};

export default RootConfigManager;
