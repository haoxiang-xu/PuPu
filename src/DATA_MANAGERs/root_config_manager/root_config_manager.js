import React, { useEffect, useState, useCallback } from "react";

import { RootConfigContexts } from "./root_config_contexts";

import { chat_room_title_generation_prompt } from "./default_instructions";
import { dark_theme } from "./default_themes";

const RootConfigManager = ({ children }) => {
  const [instructions, setInstructions] = useState({
    chat_room_title_generation_prompt: chat_room_title_generation_prompt,
  });
  const [RGB, setRGB] = useState({
    R: dark_theme.R,
    G: dark_theme.G,
    B: dark_theme.B,
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
