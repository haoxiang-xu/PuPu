import React, { useEffect, useState, useCallback } from "react";

import { ConfigContexts } from "./contexts";

import { dark_theme, light_theme } from "./default_themes";

const ConfigContainer = ({ children }) => {
  /* { Theme } ------------------------------------------------------------------------------- */
  const [theme, setTheme] = useState("dark_theme");
  const update_RGB = useCallback(() => {
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
  const update_color_offset = useCallback(() => {
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
  const update_color = useCallback(() => {
    let color = null;
    if (theme) {
      if (theme === "dark_theme") {
        color = "rgba(255, 255, 255, 0.72)";
      } else {
        color = "rgba(0, 0, 0, 0.96)";
      }
    }
    return color;
  }, [theme]);
  const update_box_shadow = useCallback(() => {
    let box_shadow = {};
    if (theme) {
      if (theme === "dark_theme") {
        box_shadow = {
          light: "0px 4px 16px rgba(0, 0, 0, 0.16)",
          middle: "0px 4px 16px rgba(0, 0, 0, 0.32)",
          dark: "0px 4px 32px rgba(0, 0, 0, 0.64)",
        };
      } else {
        box_shadow = {
          light: "none",
          middle: "none",
          dark: "none",
        };
      }
    }
    return box_shadow;
  }, [theme]);
  const update_border = useCallback(() => {
    let border = {};
    if (theme) {
      if (theme === "dark_theme") {
        border = "1px solid rgba(255, 255, 255, 0.16)";
      } else {
        border = "1px solid rgba(0, 0, 0, 0.12)";
      }
    }
    return border;
  }, [theme]);
  const [RGB, setRGB] = useState(update_RGB());
  const [colorOffset, setColorOffset] = useState(update_color_offset());
  const [color, setColor] = useState(update_color());
  const [boxShadow, setBoxShadow] = useState({});
  const [border, setBorder] = useState(null);
  /* { Theme } ------------------------------------------------------------------------------- */

  useEffect(() => {
    document.body.style.backgroundColor = `rgb(${RGB.R}, ${RGB.G}, ${RGB.B})`;
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, []);
  useEffect(() => {
    setRGB(update_RGB());
    setColorOffset(update_color_offset());
    setColor(update_color());
    setBoxShadow(update_box_shadow());
    setBorder(update_border());
  }, [theme]);

  return (
    <>
      <ConfigContexts.Provider
        value={{
          theme,
          RGB,
          colorOffset,
          color,
          boxShadow,
          border,
        }}
      >
        {children}
      </ConfigContexts.Provider>
    </>
  );
};

export default ConfigContainer;
