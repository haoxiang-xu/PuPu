import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { useMouse } from "../mini_react/mini_use";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const SemiSwitch = ({
  style,
  on_icon_src = "subtract",
  off_icon_src = "circle",
  on,
  set_on,
}) => {
  const { theme } = useContext(ConfigContext);
  const [defaultOn, setDefaultOn] = useState(false);
  const mouse = useMouse();
  const [switchStyle, setSwitchStyle] = useState({
    width: 0,
    height: 0,
  });
  const [thumbStyle, setThumbStyle] = useState({
    width: 0,
    height: 0,
  });
  const [iconStyle, setIconStyle] = useState({
    width: 0,
    height: 0,
  });
  const [thumbOffset, setThumbOffset] = useState(0);
  useEffect(() => {
    if (style) {
      let reprocessed_style = { ...style };
      for (const property in theme?.switch) {
        if (reprocessed_style[property] === undefined) {
          reprocessed_style[property] = theme.switch[property];
        }
      }
      if (on || defaultOn) {
        reprocessed_style.backgroundColor =
          reprocessed_style.backgroundColor_on ||
          theme?.switch?.backgroundColor_on ||
          reprocessed_style.backgroundColor ||
          theme?.switch?.backgroundColor;
      }
      setSwitchStyle(reprocessed_style);
    } else if (theme?.switch) {
      let reprocessed_style = { ...theme.switch };
      if (on || defaultOn) {
        reprocessed_style.backgroundColor =
          theme?.switch?.backgroundColor_on || theme?.switch?.backgroundColor;
      }
      setSwitchStyle({
        ...reprocessed_style,
      });
    }
  }, [theme, style, on, defaultOn]);
  useEffect(() => {
    const to_even_int = (val) => {
      let n = parseInt(val, 10);
      if (n % 2 !== 0) {
        n = n - 1;
      }
      return n;
    };
    if (typeof switchStyle?.height === "number") {
      setThumbOffset(to_even_int(Math.max(3, switchStyle?.height / 16)));
    } else {
      setThumbOffset(0);
    }
    if (
      typeof switchStyle?.height === "number" &&
      typeof switchStyle?.width === "number"
    ) {
      if (switchStyle.width < switchStyle.height * 2) {
        setThumbStyle({
          height: switchStyle.height - thumbOffset * 2,
          width: switchStyle.width / 2 - thumbOffset * 2,
        });
        setIconStyle({
          height: switchStyle.height - thumbOffset * 2,
          width: switchStyle.width / 2 - thumbOffset * 2,
        });
      } else {
        setThumbStyle({
          height: switchStyle.height - thumbOffset * 2,
          width: switchStyle.height - thumbOffset * 2,
        });
        setIconStyle({
          height: switchStyle.height - thumbOffset * 2,
          width: switchStyle.height - thumbOffset * 2,
        });
      }
    }
  }, [switchStyle, thumbOffset]);
  useEffect(() => {
    if (!mouse.leftKeyDown) {
      setThumbStyle((prevStyle) => ({
        ...prevStyle,
        width: iconStyle.width,
      }));
    }
  }, [mouse.leftKeyDown, iconStyle.width]);
  const handle_switch_on_click = (e) => {
    e.stopPropagation();
    if (set_on !== undefined) {
      set_on(!on);
    } else {
      setDefaultOn(!defaultOn);
    }
  };

  return (
    <div
      className="mini-ui-switch-track"
      style={{ ...switchStyle, position: "relative", cursor: "pointer" }}
      onClick={(e) => handle_switch_on_click(e)}
      onMouseDown={(e) => {
        e.stopPropagation();
        setThumbStyle((prevStyle) => ({
          ...prevStyle,
          width: switchStyle.width * 0.64,
        }));
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
        setThumbStyle((prevStyle) => ({
          ...prevStyle,
          width: iconStyle.width,
        }));
      }}
      draggable={false}
    >
      <div
        className="mini-ui-switch-thumb"
        style={{
          transition: theme?.switch?.transition || "none",
          position: "absolute",
          top: "50%",
          left: on || defaultOn
            ? switchStyle?.width - (thumbStyle?.width + thumbOffset)
            : thumbOffset,

          height: thumbStyle.height,
          width: thumbStyle.width,

          borderRadius: Math.max(0, switchStyle?.borderRadius - 3) || "50%",

          transform: "translate(0%, -50%)",
          backgroundColor: switchStyle.color,
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.32)",
        }}
        draggable={false}
      ></div>
      <Icon
        src={on || defaultOn ? on_icon_src : off_icon_src}
        style={{
          transition: theme?.switch?.transition || "none",
          position: "absolute",
          top: "50%",
          left:
            typeof switchStyle?.height === "number" &&
            typeof switchStyle?.width === "number"
              ? on || defaultOn
                ? thumbOffset
                : switchStyle?.width - (iconStyle?.width + thumbOffset)
              : undefined,
          fontSize: 0,
          transform: "translate(0%, -50%)",

          height: iconStyle.width,
          width: iconStyle.width,
        }}
      />
    </div>
  );
};
const MaterialSwitch = ({
  style,
  on_icon_src = "subtract",
  off_icon_src = "circle",
  on,
  set_on,
}) => {
  const { theme } = useContext(ConfigContext);
  const [defaultOn, setDefaultOn] = useState(false);
  const [switchStyle, setSwitchStyle] = useState({});
  const [highlighterOffset, setHighlighterOffset] = useState(0);
  const [onHover, setOnHover] = useState(false);
  useEffect(() => {
    if (style) {
      let reprocessed_style = { ...style };
      for (const property in theme?.switch) {
        if (reprocessed_style[property] === undefined) {
          reprocessed_style[property] = theme.switch[property];
        }
      }
      if (on || defaultOn) {
        reprocessed_style.backgroundColor =
          reprocessed_style.backgroundColor_on ||
          theme?.switch?.backgroundColor_on ||
          reprocessed_style.backgroundColor ||
          theme?.switch?.backgroundColor;
      }
      setSwitchStyle(reprocessed_style);
    } else if (theme?.switch) {
      let reprocessed_style = { ...theme.switch };
      if (on || defaultOn) {
        reprocessed_style.backgroundColor =
          theme?.switch?.backgroundColor_on || theme?.switch?.backgroundColor;
      }
      setSwitchStyle({
        ...reprocessed_style,
      });
    }
  }, [theme, style, on, defaultOn]);
  useEffect(() => {
    const to_even_int = (val) => {
      let n = parseInt(val, 10);
      if (n % 2 !== 0) {
        n = n - 1;
      }
      return n;
    };
    if (typeof switchStyle?.height === "number") {
      setHighlighterOffset(to_even_int(Math.max(2, switchStyle?.height / 4)));
    } else {
      setHighlighterOffset(0);
    }
  }, [switchStyle]);
  const handle_switch_on_click = () => {
    if (set_on !== undefined) {
      set_on(!on);
    } else {
      setDefaultOn(!defaultOn);
    }
  };

  return (
    <div
      className="mini-ui-switch-container"
      style={{
        ...switchStyle,
        backgroundColor: "transparent",
        boxShadow: "none",
        border: "2px solid transparent",
      }}
      onClick={handle_switch_on_click}
      onMouseEnter={() => setOnHover(true)}
      onMouseLeave={() => setOnHover(false)}
    >
      <div
        className="mini-ui-switch-track"
        style={{
          transition: switchStyle.transition || "none",
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "calc(100% - 12px)",
          height: "50%",
          backgroundColor: switchStyle.backgroundColor,
          borderRadius: switchStyle.height / 2 || "none",
          boxShadow: switchStyle.boxShadow || "none",
        }}
      ></div>
      <div
        className="mini-ui-switch-thumb-highlighter"
        style={{
          transition:
            switchStyle.transition ||
            "none" +
              ", " +
              "opacity 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16), " +
              "height 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16), " +
              "width 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16)",

          position: "absolute",
          top: "50%",
          left: (() => {
            if (
              typeof switchStyle?.width === "number" &&
              typeof switchStyle?.height === "number"
            ) {
              return on || defaultOn
                ? switchStyle.width -
                    switchStyle.height -
                    highlighterOffset / 2 +
                    (switchStyle.height + highlighterOffset) / 2
                : -highlighterOffset / 2 +
                    (switchStyle.height + highlighterOffset) / 2;
            }
            return 0;
          })(),

          height:
            typeof switchStyle?.height === "number" && onHover
              ? switchStyle?.height + highlighterOffset
              : 0,
          width:
            typeof switchStyle?.height === "number" && onHover
              ? switchStyle?.height + highlighterOffset
              : 0,

          borderRadius: "50%",

          transform: "translate(-50%, -50%)",
          backgroundColor: switchStyle.backgroundColor,
          opacity: onHover ? 0.16 : 0,
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.32)",
        }}
      />
      <div
        className="mini-ui-switch-thumb"
        style={{
          transition: switchStyle.transition || "none",
          position: "absolute",
          top: "50%",
          left: on || defaultOn ? switchStyle?.width - switchStyle?.height : 0,

          height:
            typeof switchStyle?.height === "number"
              ? switchStyle.height
              : undefined,
          width:
            typeof switchStyle?.height === "number"
              ? switchStyle.height
              : undefined,

          borderRadius: "50%",

          transform: "translate(0%, -50%)",
          backgroundColor: switchStyle.color,
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.32)",
        }}
      >
        <Icon
          src={on || defaultOn ? on_icon_src : off_icon_src}
          color={switchStyle.backgroundColor}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",

            height: "70%",
            width: "70%",
          }}
        />
      </div>
    </div>
  );
};
const NotificationSwitch = ({ style, on, set_on }) => {
  const default_style = useMemo(
    () => ({
      backgroundColor: "rgb(255, 68, 0)",
      backgroundColor_on: "#65C467",
    }),
    [],
  );

  const preprocess_style = useCallback(() => {
    let reprocessed_style = { ...style };
    for (const property in default_style) {
      if (reprocessed_style[property] === undefined) {
        reprocessed_style[property] = default_style[property];
      }
    }
    return reprocessed_style;
  }, [style, default_style]);

  return (
    <Switch
      style={preprocess_style(style)}
      on_icon_src="notification_on"
      off_icon_src="notification_off"
      on={on ? on : undefined}
      set_on={set_on ? set_on : undefined}
    />
  );
};
const LightSwitch = ({ style }) => {
  const default_style = useMemo(
    () => ({
      backgroundColor: "rgb(98, 86, 119)",
      backgroundColor_on: "#ffa300",
    }),
    [],
  );
  const { onThemeMode, setOnThemeMode, setSyncWithSystemTheme } =
    useContext(ConfigContext);

  const preprocess_style = useCallback(() => {
    let reprocessed_style = { ...style };
    for (const property in default_style) {
      if (reprocessed_style[property] === undefined) {
        reprocessed_style[property] = default_style[property];
      }
    }
    return reprocessed_style;
  }, [style, default_style]);

  return (
    <Switch
      style={{ ...preprocess_style(style) }}
      on_icon_src="sun"
      off_icon_src="moon"
      on={onThemeMode === "light_mode"}
      set_on={() => {
        setSyncWithSystemTheme(false);
        setOnThemeMode(
          onThemeMode === "dark_mode" ? "light_mode" : "dark_mode",
        );
      }}
    />
  );
};
const Switch = ({
  style,
  on_icon_src = "subtract",
  off_icon_src = "circle",
  on,
  set_on,
}) => {
  const { theme } = useContext(ConfigContext);
  const [defaultOn, setDefaultOn] = useState(false);
  const [switchStyle, setSwitchStyle] = useState({
    width: 0,
    height: 0,
  });
  const [thumbStyle, setThumbStyle] = useState({
    width: 0,
    height: 0,
  });
  const [thumbOffset, setThumbOffset] = useState(0);
  useEffect(() => {
    if (style) {
      let reprocessed_style = { ...style };
      for (const property in theme?.switch) {
        if (reprocessed_style[property] === undefined) {
          reprocessed_style[property] = theme.switch[property];
        }
      }
      if (on || defaultOn) {
        reprocessed_style.backgroundColor =
          reprocessed_style.backgroundColor_on ||
          theme?.switch?.backgroundColor_on ||
          reprocessed_style.backgroundColor ||
          theme?.switch?.backgroundColor;
      }
      setSwitchStyle(reprocessed_style);
    } else if (theme?.switch) {
      let reprocessed_style = { ...theme.switch };
      if (on || defaultOn) {
        reprocessed_style.backgroundColor =
          theme?.switch?.backgroundColor_on || theme?.switch?.backgroundColor;
      }
      setSwitchStyle({
        ...reprocessed_style,
      });
    }
  }, [theme, style, on, defaultOn]);
  useEffect(() => {
    const to_even_int = (val) => {
      let n = parseInt(val, 10);
      if (n % 2 !== 0) {
        n = n - 1;
      }
      return n;
    };
    if (typeof switchStyle?.height === "number") {
      setThumbOffset(to_even_int(Math.max(3, switchStyle?.height / 16)));
    } else {
      setThumbOffset(0);
    }
    if (
      typeof switchStyle?.height === "number" &&
      typeof switchStyle?.width === "number"
    ) {
      if (switchStyle.width < switchStyle.height * 2) {
        setThumbStyle({
          height: switchStyle.height - thumbOffset * 2,
          width: switchStyle.width / 2 - thumbOffset * 2,
        });
      } else {
        setThumbStyle({
          height: switchStyle.height - thumbOffset * 2,
          width: switchStyle.height - thumbOffset * 2,
        });
      }
    }
  }, [switchStyle, thumbOffset]);
  const handle_switch_on_click = (e) => {
    e.stopPropagation();
    if (set_on !== undefined) {
      set_on(!on);
    } else {
      setDefaultOn(!defaultOn);
    }
  };

  return (
    <div
      className="mini-ui-switch-track"
      style={{ ...switchStyle, position: "relative", cursor: "pointer" }}
      onClick={(e) => handle_switch_on_click(e)}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
      }}
      draggable={false}
    >
      <div
        className="mini-ui-switch-thumb"
        style={{
          transition: theme?.switch?.transition || "none",
          position: "absolute",
          top: "50%",
          left:
            on || defaultOn
              ? switchStyle?.width - (thumbStyle?.width + thumbOffset)
              : thumbOffset,

          height: thumbStyle.height,
          width: thumbStyle.width,

          borderRadius: Math.max(0, switchStyle?.borderRadius - 3) || "50%",

          transform: "translate(0%, -50%)",
          backgroundColor: switchStyle.color,
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.32)",
        }}
      ></div>
      <Icon
        src={on || defaultOn ? on_icon_src : off_icon_src}
        style={{
          transition: theme?.switch?.transition || "none",
          position: "absolute",
          top: "50%",
          left:
            typeof switchStyle?.height === "number" &&
            typeof switchStyle?.width === "number"
              ? on || defaultOn
                ? thumbOffset
                : switchStyle?.width - (thumbStyle?.width + thumbOffset)
              : undefined,
          fontSize: 0,
          transform: "translate(0%, -50%)",

          height: thumbStyle.width,
          width: thumbStyle.width,
        }}
      />
    </div>
  );
};

export {
  Switch as default,
  Switch,
  LightSwitch,
  NotificationSwitch,
  MaterialSwitch,
  SemiSwitch,
};
