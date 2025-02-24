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
  const [fontFamily, setFontFamily] = useState("Jost");
  const [colorOffset, setColorOffset] = useState(update_color_offset());
  const [color, setColor] = useState(update_color());
  const [boxShadow, setBoxShadow] = useState({});
  const [border, setBorder] = useState(null);

  const update_side_menu = (theme, RGB) => {
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
          backgroundColor: `rgba(${RGB.R - 45}, ${RGB.G - 45}, ${
            RGB.B - 45
          }, 0.72)`,
          color: `rgba(${RGB.R - 200}, ${RGB.G - 200}, ${RGB.B - 200}, 0.72)`,
          chat_room_item: {
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.5)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            border_onHover: "1px solid rgba(255, 255, 255, 0)",
            border_onActive: "1px solid rgba(255, 255, 255, 0)",
            boxShadow_onActive: "0px 8px 12px rgba(0, 0, 0, 0.12)",
          },
        };
      }
    }
  };
  const update_message_list = (theme, RGB) => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          model_menu: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onHover: `rgba(225, 225, 225, 0.08)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.64)`,
            border: `1px solid rgba(225, 225, 225, 0.24)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.32)`,
            border_onActive: `1px solid rgba(255, 255, 255, 0.12)`,
            color: `rgba(225, 225, 225, 0.36)`,
            color_onActive: `rgba(225, 225, 225, 0.32)`,
            boxShadow_onHover: "0px 4px 16px rgba(0, 0, 0, 0.32)",
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
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R + 32}, ${RGB.G + 32}, ${
              RGB.B + 32
            }, 0.64)`,
            backgroundColor_onActive: `rgba(${RGB.R + 32}, ${RGB.G + 32}, ${
              RGB.B + 32
            }, 1)`,
          },
        };
      } else {
        return {
          model_menu: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onHover: `rgba(225, 225, 225, 1)`,
            backgroundColor_onActive: `rgba(${RGB.R - 45}, ${RGB.G - 45}, ${
              RGB.B - 45
            }, 0.72)`,
            border: `1px solid rgba(0, 0, 0, 0.24)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.32)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0.12)`,
            color: `rgba(0, 0, 0, 0.36)`,
            color_onActive: `rgba(0, 0, 0, 0.72)`,
            boxShadow_onHover: "0px 4px 16px rgba(0, 0, 0, 0.16)",
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
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.74)`,
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
            border_onHover: `1px solid rgba(255, 255, 255, 0.16)`,
            border_onActive: `1px solid rgba(255, 255, 255, 0.32)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0)`,
            backgroundColor_onHover: `rgba(255, 255, 255, 0.32)`,
            backgroundColor_onActive: `rgba(255, 255, 255, 0.5)`,
          },
        };
      }
    }
  };
  const update_dialog = (theme, RGB) => {
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
  };
  const update_model_downloader = (theme, RGB) => {
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
            backgroundColor: `rgba(${191}, ${139}, ${135}, 0.64)`,
          },
          loader: {
            color: "#222222",
          },
        };
      }
    }
  };
  const update_scrolling_space = (theme, RGB) => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0)`,
          border: `1px solid rgb(225, 225, 225, 0.24)`,
        };
      } else {
        return {
          backgroundColor: `rgba(102, 45, 71, 0.12)`,
          border: `1px solid rgba(102, 45, 71, 0.4)`,
        };
      }
    }
  };
  const update_switchs = (theme, RGB) => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          backgroundColor: `rgba(${99}, ${120}, ${255}, ${0.4})`,
          border: `1px solid rgba(${99}, ${120}, ${255}, 0.32)`,
          toggle: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
          },
        };
      } else {
        return {
          backgroundColor: `rgba(${191}, ${139}, ${135}, ${0.64})`,
          border: `1px solid rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
          toggle: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
          },
        };
      }
    }
  };
  const update_markdown = (theme, RGB) => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          a_color: `rgb(${RGB.R + 128}, ${RGB.G + 128}, ${RGB.B + 128})`,
          a_backgroundColor: `rgba(${RGB.R + 32}, ${RGB.G + 32}, ${
            RGB.B + 32
          }, 0.32)`,
          a_backgroundColor_onHover: `rgba(${RGB.R + 32}, ${RGB.G + 32}, ${
            RGB.B + 32
          }, 0.96)`,
          code_section: {
            backgroundColor: `rgb(${RGB.R - 6}, ${RGB.G - 5}, ${RGB.B - 5})`,
            tag_backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            boxShadow: `inset 0 2px 16px rgba(0, 0, 0, 0.16)`,
            tag_boxShadow: `0 2px 16px rgba(0, 0, 0, 0.32)`,
            border: `1px solid rgba(225, 255, 225, 0.16)`,
            scrolling_bar_backgroundColor: `rgba(64, 64, 64, 0.5)`,
            scrolling_bar_backgroundColor_onHover: `rgba(64, 64, 64, 1)`,
          },
          think_section: {
            border: `1px solid rgba(225, 225, 225, 0)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.16)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0)`,
          },
        };
      } else {
        return {
          a_color: `rgb(${RGB.R}, ${RGB.G}, ${RGB.B})`,
          a_backgroundColor: `rgba(${230}, ${168}, ${162}, 0.96)`,
          a_backgroundColor_onHover: `rgba(${191}, ${139}, ${135}, 0.96)`,
          code_section: {
            backgroundColor: `rgb(${RGB.R - 20}, ${RGB.G - 19}, ${RGB.B - 21})`,
            tag_backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            boxShadow: `inset 0 0px 32px rgba(5, 4, 4, 0.08)`,
            tag_boxShadow: `0 4px 12px rgba(0, 0, 0, 0.08)`,
            border: `0px solid rgba(0, 0, 0, 0)`,
            scrolling_bar_backgroundColor: `rgba(32, 32, 32, 0.16)`,
            scrolling_bar_backgroundColor_onHover: `rgba(32, 32, 32, 0.5)`,
          },
          think_section: {
            border: `1px solid rgba(0, 0, 0, 0)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.16)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0)`,
          },
        };
      }
    }
  };
  const update_more_option_menu = (theme, RGB) => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          backgroundColor: `rgba(${RGB.R + 10}, ${RGB.G + 10}, ${
            RGB.B + 10
          }, 1)`,
          border: `1px solid rgba(225, 225, 225, 0.16)`,
          boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.16)",
          option_item: {
            backgroundColor: `rgba(${RGB.R + 50}, ${RGB.G + 50}, ${
              RGB.B + 50
            }, 0.64)`,
            boxShadow: "none",
            border: `1px solid rgba(225, 225, 225, 0.16)`,
          },
        };
      } else {
        return {
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
          border: `1px solid rgba(0, 0, 0, 0.18)`,
          boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
          option_item: {
            backgroundColor: `rgba(${191}, ${139}, ${135}, 0.36)`,
            boxShadow: `inset 0px 4px 16px rgba(${191}, ${139}, ${135}, 0.16)`,
            border: `1px solid rgba(0, 0, 0, 0)`,
          },
        };
      }
    }
  };

  const [sideMenu, setSideMenu] = useState({});
  const [messageList, setMessageList] = useState({});
  const [dialog, setDialog] = useState({});
  const [modelDownloader, setModelDownloader] = useState({});
  const [scrollingSapce, setScrollingSpace] = useState({});
  const [switchs, setSwitchs] = useState({});
  const [markdown, setMarkdown] = useState({});
  const [moreOptionMenu, setMoreOptionMenu] = useState({});
  /* { Theme } ------------------------------------------------------------------------------- */

  useEffect(() => {
    if (theme === "dark_theme") {
      window.windowStateAPI.themeStatusHandler("dark");
    } else {
      window.windowStateAPI.themeStatusHandler("light");
    }
    const newRGB = update_RGB();
    setRGB(newRGB);
    setColorOffset(update_color_offset(theme, newRGB));
    setColor(update_color(theme, newRGB));
    setBoxShadow(update_box_shadow(theme, newRGB));
    setBorder(update_border(theme, newRGB));
    setSideMenu(update_side_menu(theme, newRGB));
    setMessageList(update_message_list(theme, newRGB));
    setDialog(update_dialog(theme, newRGB));
    setModelDownloader(update_model_downloader(theme, newRGB));
    setScrollingSpace(update_scrolling_space(theme, newRGB));
    setSwitchs(update_switchs(theme, newRGB));
    setMarkdown(update_markdown(theme, newRGB));
    setMoreOptionMenu(update_more_option_menu(theme, newRGB));
    document.body.style.backgroundColor = `rgb(${newRGB.R}, ${newRGB.G}, ${newRGB.B})`;
    return () => {
      document.body.style.backgroundColor = "";
    };
  }, [theme]);

  return (
    <div
      style={{
        fontFamily: fontFamily,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Jost:wght@400;700&display=swap"
        rel="stylesheet"
      ></link>
      <ConfigContexts.Provider
        value={{
          theme,
          setTheme,
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
          switchs,
          markdown,
          moreOptionMenu,
        }}
      >
        {children}
      </ConfigContexts.Provider>
    </div>
  );
};

export default ConfigContainer;
