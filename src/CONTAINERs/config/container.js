import { useEffect, useState, useCallback } from "react";

import { ConfigContexts } from "./contexts";

import { dark_theme, light_theme } from "./default_themes";

const ConfigContainer = ({ children }) => {
  const [isConfigReady, setIsConfigReady] = useState(false);
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
          R_secondary: dark_theme.R_secondary,
          G_secondary: dark_theme.G_secondary,
          B_secondary: dark_theme.B_secondary,
        };
      } else {
        RGB = {
          R: light_theme.R,
          G: light_theme.G,
          B: light_theme.B,
          R_secondary: light_theme.R_secondary,
          G_secondary: light_theme.G_secondary,
          B_secondary: light_theme.B_secondary,
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
          font: 150,
        };
      } else {
        color_offset = {
          middle_ground: -24,
          font: -200,
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
          border: "1px solid rgba(255, 255, 255, 0.32)",
          backgroundColor: `rgba(${RGB.R - 8}, ${RGB.G - 8}, ${RGB.B - 6}, 1)`,
          backgroundColor_onHover: `rgba(${RGB.R - 8}, ${RGB.G - 8}, ${
            RGB.B - 6
          }, 1)`,
          boxShadow: "0px 4px 32px rgba(0, 0, 0, 0)",
          color: `rgba(${RGB.R + 200}, ${RGB.G + 200}, ${RGB.B + 200}, 0.72)`,
          borderRadius: 0,
          chat_room_item: {
            backgroundColor_onHover: `rgba(${RGB.R_secondary}, ${RGB.G_secondary}, ${RGB.B_secondary}, 0.5)`,
            backgroundColor_onActive: `rgba(${RGB.R_secondary}, ${RGB.G_secondary}, ${RGB.B_secondary}, 1)`,
            border_onHover: "1px solid rgba(255, 255, 255, 0)",
            border_onActive: "1px solid rgba(255, 255, 255, 0)",
            boxShadow_onActive: "0px 8px 12px rgba(0, 0, 0, 0)",
          },
        };
      } else {
        return {
          border: "1px solid rgba(0, 0, 0, 0.12)",
          backgroundColor: `rgba(${RGB.R - 22}, ${RGB.G - 22}, ${
            RGB.B - 22
          }, 1)`,
          backgroundColor_onHover: `rgba(${RGB.R - 8}, ${RGB.G - 8}, ${
            RGB.B - 8
          }, 1)`,
          boxShadow: "inset 0px 0px 32px rgba(0, 0, 0, 0.04)",
          color: `rgba(${RGB.R - 200}, ${RGB.G - 200}, ${RGB.B - 200}, 0.96)`,
          borderRadius: 12,
          chat_room_item: {
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onActive: `rgba(255, 255, 255, 1)`,
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
            border_onActive: `1px solid rgba(255, 255, 255, 0.5)`,
            color: `rgba(225, 225, 225, 0.36)`,
            color_onHover: `rgba(225, 225, 225, 0.5)`,
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
          input_section: {
            border: `1px solid rgba(225, 225, 225, 0)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.16)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0.5)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            backgroundColor_onActive: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            boxShadow_onHover: "0px 4px 16px rgba(0, 0, 0, 0.32)",
            boxShadow_onActive: "0px 4px 16px rgba(0, 0, 0, 0)",
          },
          input_upper_panel: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            border: `1px solid rgba(255, 255, 255, 0.24)`,
            border_onHover: `1px solid rgba(255, 255, 255, 0.5)`,
            border_onActive: `1px solid rgba(255, 255, 255, 0.64)`,
            opacity: 0.36,
            opacity_onHover: 0.64,
            opacity_onActive: 0.72,
            boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.32)",
          },
          input_images: {
            backgroundColor: `rgb(0, 0, 0)`,
            border: `1px solid rgba(225, 225, 225, 0.32)`,
          },
        };
      } else {
        return {
          model_menu: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onHover: `rgba(225, 225, 225, 1)`,
            backgroundColor_onActive: `rgba(${RGB.R - 32}, ${RGB.G - 32}, ${
              RGB.B - 32
            }, 0.72)`,
            border: `1px solid rgba(0, 0, 0, 0.2)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.5)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0.36)`,
            color: `rgba(0, 0, 0, 0.32)`,
            color_onHover: `rgba(0, 0, 0, 0.64)`,
            color_onActive: `rgba(0, 0, 0, 1)`,
            boxShadow_onHover: `0px 4px 16px rgba(${191}, ${139}, ${135}, 0.16)`,
          },
          add_model_button: {
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.5)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
          },
          model_list_item: {
            color: `rgba(0, 0, 0, 0.64)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.74)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            boxShadow_onHover: "0px 6px 6px rgba(0, 0, 0, 0.08)",
          },
          input_upper_panel: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onHover: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            backgroundColor_onActive: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
            border: `1px solid rgba(0, 0, 0, 0.24)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.5)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0.64)`,
            opacity: 0.32,
            opacity_onHover: 0.64,
            opacity_onActive: 0.72,
            boxShadow: `0px 4px 16px rgba(${191}, ${139}, ${135}, 0.16)`,
          },
          input_images: {
            backgroundColor: `rgba(${RGB.R - 32}, ${RGB.G - 32}, ${
              RGB.B - 32
            }, 1)`,
            border: `1px solid rgba(0, 0, 0, 0.32)`,
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
          blurBackgroundColor: `rgba(${RGB.R + 12}, ${RGB.G + 12}, ${
            RGB.B + 12
          }, 0.64)`,
          border: "1px solid rgba(255, 255, 255, 0.32)",
        };
      } else {
        return {
          backgroundColor: `rgba(${RGB.R + 12}, ${RGB.G + 12}, ${
            RGB.B + 12
          }, 0.96)`,
          blurBackgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0.64)`,
          border: `1px solid rgba(0, 0, 0, 0)`,
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
          vertical: {
            backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0)`,
            border: `1px solid rgba(225, 225, 225, 0.24)`,
          },
          horizontal: {
            backgroundColor: `rgba(${RGB.R + 64}, ${RGB.G + 64}, ${
              RGB.B + 64
            }, 1)`,
          },
        };
      } else {
        return {
          vertical: {
            backgroundColor: `rgba(102, 45, 71, 0.24)`,
            border: `1px solid rgba(102, 45, 71, 0)`,
          },
          horizontal: {
            backgroundColor: `rgba(${RGB.R - 128}, ${RGB.G - 128}, ${
              RGB.B - 128
            }, 1)`,
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
            tag_backgroundColor: `rgba(${RGB.R + 12}, ${RGB.G + 12}, ${
              RGB.B + 16
            }, 1)`,
            boxShadow: `inset 0 2px 16px rgba(0, 0, 0, 0.16)`,
            tag_boxShadow: `0 2px 16px rgba(0, 0, 0, 0.32)`,
            border: `1px solid rgba(225, 255, 225, 0.4)`,
            scrolling_bar_backgroundColor: `rgba(64, 64, 64, 0.5)`,
            scrolling_bar_backgroundColor_onHover: `rgba(64, 64, 64, 1)`,
          },
          copy_button: {
            backgroundColor: `rgba(225, 225, 225, 0)`,
            backgroundColor_onHover: `rgba(225, 225, 225, 0.08)`,
            backgroundColor_onActive: `rgba(225, 225, 225, 0.16)`,
            border: `1px solid rgba(225, 225, 225, 0)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.32)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0)`,
          },
          think_section: {
            border: `1px solid rgba(225, 225, 225, 0)`,
            border_onHover: `1px solid rgba(225, 225, 225, 0.16)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0)`,
          },
          loader: {
            color: `rgba(225, 225, 225, 0.72)`,
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
          copy_button: {
            backgroundColor: `rgba(0, 0, 0, 0)`,
            backgroundColor_onHover: `rgba(0, 0, 0, 0.08)`,
            backgroundColor_onActive: `rgba(0, 0, 0, 0.16)`,
            border: `1px solid rgba(0, 0, 0, 0)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.32)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0)`,
          },
          think_section: {
            border: `1px solid rgba(0, 0, 0, 0)`,
            border_onHover: `1px solid rgba(0, 0, 0, 0.16)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0)`,
          },
          loader: {
            color: `rgba(0, 0, 0, 0.72)`,
          },
        };
      }
    }
  };
  const update_setting_panel = (theme, RGB) => {
    if (theme) {
      if (theme === "dark_theme") {
        return {
          separator: `rgba(225, 225, 225, 0.32)`,
          backgroundColor: `rgba(${RGB.R - 8}, ${RGB.G - 8}, ${RGB.B - 6}, 1)`,
          border: `1px solid rgba(225, 225, 225, 0.16)`,
          side_menu_item: {
            border_onHover: `1px solid rgba(225, 225, 225, 0)`,
            backgroundColor_onHover: `rgba(${RGB.R_secondary}, ${RGB.G_secondary}, ${RGB.B_secondary}, 0.5)`,
            border_onActive: `1px solid rgba(225, 225, 225, 0)`,
            backgroundColor_onActive: `rgba(${RGB.R_secondary}, ${RGB.G_secondary}, ${RGB.B_secondary}, 1)`,
            boxShadow_onActive: "0px 8px 12px rgba(0, 0, 0, 0)",
          },
        };
      } else {
        return {
          separator: `rgba(0, 0, 0, 0)`,
          backgroundColor: `rgba(${RGB.R - 28}, ${RGB.G - 28}, ${
            RGB.B - 28
          }, 1)`,
          border: `1px solid rgba(0, 0, 0, 0)`,
          side_menu_item: {
            border_onHover: `1px solid rgba(0, 0, 0, 0)`,
            backgroundColor_onHover: `rgba(255, 255, 255, 1)`,
            border_onActive: `1px solid rgba(0, 0, 0, 0)`,
            backgroundColor_onActive: `rgba(255, 255, 255, 1)`,
            boxShadow_onActive: "0px 8px 12px rgba(0, 0, 0, 0.08)",
          },
        };
      }
    }
  };
  const update_input_box = (theme, RGB) => {
    if (theme && theme === "dark_theme") {
      return {
        backgroundColor: `rgba(${RGB.R + 12}, ${RGB.G + 12}, ${
          RGB.B + 12
        }, 0.64)`,
        border: "1px solid rgba(255, 255, 255, 0.64)",
        boxShadow: "0px 6px 32px rgba(0, 0, 0, 0.18)",
      };
    } else {
      return {
        backgroundColor: `rgba(${RGB.R - 32}, ${RGB.G - 32}, ${RGB.B - 32}, 1)`,
        border: "1px solid rgba(255, 255, 255, 1)",
        boxShadow: "inset 0px 4px 16px rgba(0, 0, 0, 0.04)",
      };
    }
  };
  const update_context_menu = (theme, RGB) => {
    if (theme && theme === "dark_theme") {
      return {
        backgroundColor: `rgba(${RGB.R + 10}, ${RGB.G + 10}, ${RGB.B + 10}, 1)`,
        border: "1px solid rgba(255, 255, 255, 0.5)",
        boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.16)",
        borderRadius: 10,
        option_item: {
          backgroundColor: `rgba(${RGB.R + 50}, ${RGB.G + 50}, ${
            RGB.B + 50
          }, 0.64)`,
          boxShadow: "none",
          border: `1px solid rgba(225, 225, 225, 0.16)`,
          borderRadius: 5,
        },
      };
    } else {
      return {
        backgroundColor: `rgba(${RGB.R + 5}, ${RGB.G + 5}, ${RGB.B + 5}, 1)`,
        border: `1px solid rgba(255, 255, 255, 1)`,
        boxShadow: "0px 0px 16px rgba(0, 0, 0, 0.24)",
        borderRadius: 10,
        option_item: {
          backgroundColor: `rgba(71, 83, 99, 0.16)`,
          boxShadow: `inset 0px 4px 16px rgba(${191}, ${139}, ${135}, 0.16)`,
          border: `1px solid rgba(255, 255, 255, 1)`,
          borderRadius: 6,
        },
      };
    }
  };
  const update_span = (theme, RGB) => {
    if (theme && theme === "dark_theme") {
      return {
        paragraph: {
          color: `rgba(${RGB.R + 150}, ${RGB.G + 150}, ${RGB.B + 150}, 1)`,
        },
        ignore: {
          color: `rgba(${RGB.R + 150}, ${RGB.G + 150}, ${RGB.B + 150}, 0.64)`,
        },
      };
    } else {
      return {
        paragraph: {
          color: `rgba(${RGB.R - 200}, ${RGB.G - 200}, ${RGB.B - 200}, 1)`,
        },
        ignore: {
          color: `rgba(${RGB.R - 200}, ${RGB.G - 200}, ${RGB.B - 200}, 0.64)`,
        },
      };
    }
  };
  const update_component = (theme, RGB) => {
    if (theme && theme === "dark_theme") {
      return {
        separator: {
          width: 1,
          backgroundColor: `rgba(225, 225, 225, 0.96)`,
        },
        switch: {
          backgroundColor: `rgba(${RGB.R_secondary}, ${RGB.G_secondary}, ${
            RGB.B_secondary
          }, ${1})`,
          border: `1px solid rgba(${RGB.R_secondary}, ${RGB.G_secondary}, ${
            RGB.B_secondary
          }, ${1})`,
          toggleBackgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, ${1})`,
        },
        button: {
          border: `1px solid rgba(225, 225, 225, 0)`,
          backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
            RGB.B + 30
          }, 0)`,
          onActive: {
            border: `1px solid rgba(225, 225, 225, 0.5)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            boxShadow: "0px 4px 16px rgba(0, 0, 0, 0)",
          },
          onHover: {
            border: `1px solid rgba(225, 225, 225, 0.32)`,
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.32)",
          },
        },
        in_text_button: {
          backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
            RGB.B + 30
          }, 0)`,
          border: `1px solid rgba(225, 225, 225, 0)`,
          onHover: {
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            border: `1px solid rgba(225, 225, 225, 0.32)`,
          },
          onActive: {
            backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
              RGB.B + 30
            }, 0.64)`,
            border: `1px solid rgba(225, 225, 225, 0)`,
          },
        },
        global_button: {
          onClick: {
            backgroundColor: `rgba(${RGB.R + 36}, ${RGB.G + 36}, ${
              RGB.B + 36
            }, 0.72)`,
            border: `1px solid rgba(225, 225, 225, 0)`,
          },
          onHover: {
            backgroundColor: `rgba(${RGB.R + 12}, ${RGB.G + 12}, ${
              RGB.B + 12
            }, 0.64)`,
            border: `1px solid rgba(225, 225, 225, 0.32)`,
          },
          backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
            RGB.B + 30
          }, 0)`,
          border: `1px solid rgba(255, 255, 255, 0)`,
        },
        simplified_button: {
          backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
            RGB.B + 30
          }, 0)`,
          onHover: {
            backgroundColor: `rgba(${RGB.R + 36}, ${RGB.G + 36}, ${
              RGB.B + 36
            }, 0.64)`,
          },
          onActive: {
            backgroundColor: `rgba(${RGB.R - 12}, ${RGB.G - 12}, ${
              RGB.B - 8
            }, 0.64)`,
          },
        },
      };
    } else {
      return {
        separator: {
          width: 2,
          backgroundColor: `rgba(0, 0, 0, 0)`,
        },
        switch: {
          backgroundColor: `rgba(${RGB.R_secondary}, ${RGB.G_secondary}, ${
            RGB.B_secondary
          }, ${0.64})`,
          border: `1px solid rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
          toggleBackgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
        },
        button: {
          border: `1px solid rgba(0, 0, 0, 0)`,
          backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
            RGB.B + 30
          }, 0)`,
          onActive: {
            border: `1px solid rgba(255, 255, 255, 1)`,
            backgroundColor: `rgba(${RGB.R - 32}, ${RGB.G - 32}, ${
              RGB.B - 32
            }, 1)`,
            boxShadow: "inset 0px 4px 16px rgba(0, 0, 0, 0.16)",
          },
          onHover: {
            border: `1px solid rgba(255, 255, 255, 1)`,
            backgroundColor: `rgba(255, 255, 255, 0.64)`,
            boxShadow: "inset 0px 4px 16px rgba(0, 0, 0, 0.08)",
          },
        },
        in_text_button: {
          backgroundColor: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
            RGB.B - 64
          }, 0)`,
          border: `1px solid rgba(0, 0, 0, 0)`,
          onHover: {
            backgroundColor: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
              RGB.B - 64
            }, 0.32)`,
            border: `1px solid rgba(0, 0, 0, 0.5)`,
          },
          onActive: {
            backgroundColor: `rgba(${RGB.R - 64}, ${RGB.G - 64}, ${
              RGB.B - 64
            }, 0.64)`,
            border: `1px solid rgba(0, 0, 0, 0)`,
          },
        },
        global_button: {
          onClick: {
            backgroundColor: `rgba(${RGB.R - 72}, ${RGB.G - 72}, ${
              RGB.B - 72
            }, 0.72)`,
            border: `1px solid rgba(0, 0, 0, 0)`,
          },
          onHover: {
            backgroundColor: `rgba(${RGB.R - 24}, ${RGB.G - 24}, ${
              RGB.B - 24
            }, 0.64)`,
            border: `1px solid rgba(0, 0, 0, 0.32)`,
          },
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 0)`,
          border: `1px solid rgba(255, 255, 255, 0)`,
        },
        simplified_button: {
          backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${
            RGB.B + 30
          }, 0)`,
          onActive: {
            backgroundColor: `rgba(${RGB.R - 50}, ${RGB.G - 50}, ${
              RGB.B - 50
            }, 1)`,
          },
          onHover: {
            backgroundColor: `rgba(255, 255, 255, 0.64)`,
          },
        },
      };
    }
  };

  const [sideMenu, setSideMenu] = useState({});
  const [messageList, setMessageList] = useState({});
  const [dialog, setDialog] = useState({});
  const [modelDownloader, setModelDownloader] = useState({});
  const [scrollingSapce, setScrollingSpace] = useState({});
  const [markdown, setMarkdown] = useState({});
  const [settingPanel, setSettingPanel] = useState({});
  const [inputBox, setInputBox] = useState({});
  const [contextMenu, setContextMenu] = useState({});
  const [span, setSpan] = useState({});
  const [component, setComponent] = useState({});
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
    setMarkdown(update_markdown(theme, newRGB));
    setSettingPanel(update_setting_panel(theme, newRGB));
    setInputBox(update_input_box(theme, newRGB));
    setContextMenu(update_context_menu(theme, newRGB));
    setSpan(update_span(theme, newRGB));
    setComponent(update_component(theme, newRGB));
    document.body.style.backgroundColor = `rgb(${newRGB.R}, ${newRGB.G}, ${newRGB.B})`;
    document.addEventListener("dragstart", (event) => event.preventDefault());
    setIsConfigReady(true);
    return () => {
      document.body.style.backgroundColor = "";
      document.body.style.overflow = "hidden";
      document.removeEventListener("dragstart", (event) =>
        event.preventDefault()
      );
    };
  }, [theme]);

  if (!isConfigReady) return null;
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
          markdown,
          settingPanel,
          inputBox,
          contextMenu,
          span,
          component,
        }}
      >
        {children}
      </ConfigContexts.Provider>
    </div>
  );
};

export default ConfigContainer;
