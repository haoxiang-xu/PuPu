import React, { useEffect, useState, useCallback } from "react";

import { RootConfigContexts } from "./root_config_contexts";

import { chat_room_title_generation_prompt } from "./DEFAULT_INSTRUCTIONS";
import { dark_theme, light_theme } from "./DEFAULT_THEMES";

const RootConfigManager = ({ children }) => {
  const [instructions, setInstructions] = useState({
    chat_room_title_generation_prompt: chat_room_title_generation_prompt,
  });

  /* { Theme } ------------------------------------------------------------------------------- */
  const [theme, setTheme] = useState("dark_theme");
  const get_RGB = useCallback(() => {
    let RGB = {};
    if (theme) {
      if (theme === "dark_theme") {
        RGB = {
          R: dark_theme.R,
          G: dark_theme.G,
          B: dark_theme.B,
        };
      } else {
        RGB = {
          R: light_theme.R,
          G: light_theme.G,
          B: light_theme.B,
        };
      }
    }
    return RGB;
  }, [theme]);
  const get_color_offset = useCallback(() => {
    let color_offset = {};
    if (theme) {
      if (theme === "dark_theme") {
        color_offset = {
          middle_ground: 12,
          font: 128,
        };
      } else {
        color_offset = {
          middle_ground: -24,
          font: -180,
        };
      }
    }
    return color_offset;
  }, [theme]);
  const [RGB, setRGB] = useState(get_RGB());
  const [colorOffset, setColorOffset] = useState(get_color_offset());
  /* { Theme } ------------------------------------------------------------------------------- */

  useEffect(() => {
    setRGB(get_RGB());
    setColorOffset(get_color_offset());
  }, [theme]);

  return (
    <>
      <RootConfigContexts.Provider
        value={{
          instructions,
          theme,
          RGB,
          colorOffset,
        }}
      >
        {children}
      </RootConfigContexts.Provider>
    </>
  );
};

export default RootConfigManager;
