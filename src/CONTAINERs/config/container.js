import React, { useEffect, useState, useCallback } from "react";

import { ConfigContexts } from "./contexts";

import { dark_theme, light_theme } from "./default_themes";

const ConfigContainer = ({ children }) => {
  /* { Theme } ------------------------------------------------------------------------------- */
  const [theme, setTheme] = useState("light_theme");
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

  const update_side_menu = useCallback(() => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.64)`,
          color: `rgba(${RGB.R + 200}, ${RGB.G + 200}, ${RGB.B + 200}, 0.64)`,
          chat_room_item: {
            backgroundColor_onHover: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.4)`,
            backgroundColor_onActive: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.84)`,
            border_onHover: "1px solid rgba(255, 255, 255, 0.08)",
            border_onActive: "1px solid rgba(255, 255, 255, 0.16)",
            boxShadow_onActive: "0px 8px 12px rgba(0, 0, 0, 0.12)",
          },
        };
      } else {
        return {
          backgroundColor: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
            RGB.B - 64
          }, 0.32)`,
          color: `rgba(${RGB.R - 200}, ${RGB.G - 200}, ${RGB.B - 200}, 0.72)`,
          chat_room_item: {
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.5)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            border_onHover: "1px solid rgba(0, 0, 0, 0)",
            border_onActive: "1px solid rgba(0, 0, 0, 0)",
            boxShadow_onActive: "0px 8px 12px rgba(0, 0, 0, 0.12)",
          },
        };
      }
    }
  }, [theme, RGB]);
  const update_message_list = useCallback(() => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          model_menu: {
            backgroundColor_onHover: `rgba(225, 225, 225, 0.08)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.64)`,
            border: `1px solid rgba(225, 225, 225, 0.5)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.64)`,
            border_onActive: `1px solid rgba(255, 255, 255, 0.12)`,
            color: `rgba(225, 225, 225, 0.72)`,
            color_onActive: `rgba(225, 225, 225, 0.32)`,
          },
          add_model_button: {
            backgroundColor_onHover: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.4)`,
            backgroundColor_onActive: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.84)`,
          },
          model_list_item: {
            color: `rgba(225, 225, 225, 0.64)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.4)`,
            backgroundColor_onActive: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.84)`,
            boxShadow_onHover: "0px 8px 12px rgba(0, 0, 0, 0.12)",
          },
          message_bottom_panel: {
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            backgroundColor_onActive: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            border: `1px solid rgba(225, 225, 225, 0)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.32)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0.64)`,
          },
          input_section: {
            border: `1px solid rgba(225, 225, 225, 0)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.16)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0.32)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${ RGB.B + 30}, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R + 32}, ${RGB.G + 32}, ${ RGB.B + 32}, 0.64)`,
            backgroundColor_onActive: `rgba(${RGB.R + 32}, ${RGB.G + 32}, ${ RGB.B + 32}, 1)`,
          },
        };
      } else {
        return {
          model_menu: {
            backgroundColor_onHover: `rgba(225, 225, 225, 0.9)`,
            backgroundColor_onActive: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
              RGB.B - 64
            }, 0.32)`,
            border: `1px solid rgba(0, 0, 0, 0.5)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.32)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0.12)`,
            color: `rgba(0, 0, 0, 0.72)`,
            color_onActive: `rgba(0, 0, 0, 0.72)`,
          },
          add_model_button: {
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.5)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
          },
          model_list_item: {
            color: `rgba(0, 0, 0, 0.5)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.5)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            boxShadow_onHover: "0px 6px 6px rgba(0, 0, 0, 0.08)",
          },
          message_bottom_panel: {
            backgroundColor: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
              RGB.B - 64
            }, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
              RGB.B - 64
            }, 0.32)`,
            backgroundColor_onActive: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
              RGB.B - 64
            }, 0.64)`,
            border: `1px solid rgba(0, 0, 0, 0)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.5)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0.64)`,
          },
          input_section: {
            border: `1px solid rgba(225, 225, 225, 0)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.16)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0.4)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${ RGB.B + 30}, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R - 32}, ${RGB.G - 32}, ${ RGB.B - 32}, 0.32)`,
            backgroundColor_onActive: `rgba(${RGB.R - 32}, ${RGB.G - 32}, ${ RGB.B - 32}, 0.32)`,
          },
        };
      }
    }
  }, [theme, RGB]);
  const update_dialog = useCallback(() => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          backgroundColor: `rgba(${RGB.R + 12}, ${RGB.G + 12}, ${
            RGB.B + 12
          }, 0.64)`,
        };
      } else {
        return {
          backgroundColor: `rgba(${RGB.R + 12}, ${RGB.G + 12}, ${
            RGB.B + 12
          }, 0.96)`,
        };
      }
    }
  }, [theme, RGB]);
  const update_model_downloader = useCallback(() => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          color: `rgba(${225}, ${225}, ${225}, 0.72)`,
          border: `1px solid rgba(225, 225, 225, 0.16)`,
          progress_bar: {
            backgroundColor: `rgba(${99}, ${120}, ${255}, ${0.4})`,
          },
          loader: {
            color: "#FFFFFF",
          },
        };
      } else {
        return {
          color: `rgba(${0}, ${0}, ${0}, 0.72)`,
          border: `1px solid rgba(0, 0, 0, 0.16)`,
          progress_bar: {
            backgroundColor: `rgba(${255}, ${187}, ${0}, ${0.64})`,
          },
          loader: {
            color: "#222222",
          },
        };
      }
    }
  }, [theme, RGB]);
  const update_scrolling_space = useCallback(() => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0)`,
          border: `1px solid rgb(225, 225, 225, 0.16)`,
        };
      } else {
        return {
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0)`,
          border: `1px solid rgb(0, 0, 0, 0.24)`,
        };
      }
    }
  }, [theme, RGB]);

  const [sideMenu, setSideMenu] = useState({});
  const [messageList, setMessageList] = useState({});
  const [dialog, setDialog] = useState({});
  const [modelDownloader, setModelDownloader] = useState({});
  const [scrollingSapce, setScrollingSpace] = useState({});
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
    setSideMenu(update_side_menu());
    setMessageList(update_message_list());
    setDialog(update_dialog());
    setModelDownloader(update_model_downloader());
    setScrollingSpace(update_scrolling_space());
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

          sideMenu,
          messageList,
          dialog,
          modelDownloader,
          scrollingSapce,
        }}
      >
        {children}
      </ConfigContexts.Provider>
    </>
  );
};

export default ConfigContainer;
