import { useState, useEffect, useContext, useCallback, useMemo } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const MaterialSwitch = ({
  style,
  on_icon_src = "circle",
  off_icon_src = "subtract",
  on = false,
  setOn = () => {},
}) => {
  const { theme } = useContext(ConfigContext);
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
      if (on) {
        reprocessed_style.backgroundColor =
          reprocessed_style.backgroundColor_on ||
          theme?.switch?.backgroundColor_on ||
          reprocessed_style.backgroundColor ||
          theme?.switch?.backgroundColor;
      }
      setSwitchStyle(reprocessed_style);
    } else if (theme?.switch) {
      let reprocessed_style = { ...theme.switch };
      if (on) {
        reprocessed_style.backgroundColor =
          theme?.switch?.backgroundColor_on || theme?.switch?.backgroundColor;
      }
      setSwitchStyle({
        ...reprocessed_style,
      });
    }
  }, [theme, style, on]);
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
    setOn(!on);
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
            "left 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16), " +
            "background-color 0.36s cubic-bezier(0.32, 1, 0.32, 1), " +
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
              return on
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
          transition:
            "left 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16), " +
            "background-color 0.36s cubic-bezier(0.32, 1, 0.32, 1)",
          position: "absolute",
          top: "50%",
          left: on ? switchStyle?.width - switchStyle?.height + 3 : 3,

          height:
            typeof switchStyle?.height === "number"
              ? switchStyle.height - 6
              : undefined,
          width:
            typeof switchStyle?.height === "number"
              ? switchStyle.height - 6
              : undefined,

          borderRadius: "50%",

          transform: "translate(0%, -50%)",
          backgroundColor: switchStyle.color,
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.32)",
        }}
      >
        <Icon
          src={on ? on_icon_src : off_icon_src}
          color={switchStyle.backgroundColor}
          style={{
            transition: "left 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
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
const NotificationSwitch = ({ style, on = false, setOn = () => {} }) => {
  const default_style = useMemo(
    () => ({
      backgroundColor: "rgb(255, 68, 0)",
      backgroundColor_on: "#65C467",
    }),
    []
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
      on={on}
      setOn={setOn}
    />
  );
};
const LightSwitch = ({ style }) => {
  const default_style = useMemo(
    () => ({
      backgroundColor: "rgb(114, 75, 177)",
      backgroundColor_on: "rgb(243, 190, 171)",
    }),
    []
  );
  const { onThemeMode, setOnThemeMode } = useContext(ConfigContext);

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
      on_icon_src="sun"
      off_icon_src="moon"
      on={onThemeMode === "light_mode"}
      setOn={() => {
        setOnThemeMode(
          onThemeMode === "dark_mode" ? "light_mode" : "dark_mode"
        );
      }}
    />
  );
};
const Switch = ({
  style,
  on_icon_src = "circle",
  off_icon_src = "subtract",
  on = false,
  setOn = () => {},
}) => {
  const { theme } = useContext(ConfigContext);
  const [switchStyle, setSwitchStyle] = useState({});
  const [thumbOffset, setThumbOffset] = useState(0);
  useEffect(() => {
    if (style) {
      let reprocessed_style = { ...style };
      for (const property in theme?.switch) {
        if (reprocessed_style[property] === undefined) {
          reprocessed_style[property] = theme.switch[property];
        }
      }
      if (on) {
        reprocessed_style.backgroundColor =
          reprocessed_style.backgroundColor_on ||
          theme?.switch?.backgroundColor_on ||
          reprocessed_style.backgroundColor ||
          theme?.switch?.backgroundColor;
      }
      setSwitchStyle(reprocessed_style);
    } else if (theme?.switch) {
      let reprocessed_style = { ...theme.switch };
      if (on) {
        reprocessed_style.backgroundColor =
          theme?.switch?.backgroundColor_on || theme?.switch?.backgroundColor;
      }
      setSwitchStyle({
        ...reprocessed_style,
      });
    }
  }, [theme, style, on]);
  useEffect(() => {
    const to_even_int = (val) => {
      let n = parseInt(val, 10);
      if (n % 2 !== 0) {
        n = n - 1;
      }
      return n;
    };
    if (typeof switchStyle?.height === "number") {
      setThumbOffset(to_even_int(Math.max(2, switchStyle?.height / 16)));
    } else {
      setThumbOffset(0);
    }
  }, [switchStyle]);
  const handle_switch_on_click = () => {
    setOn(!on);
  };

  return (
    <div
      className="mini-ui-switch-track"
      style={switchStyle}
      onClick={handle_switch_on_click}
    >
      <div
        className="mini-ui-switch-thumb"
        style={{
          transition:
            "left 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16), " +
            "background-color 0.36s cubic-bezier(0.32, 1, 0.32, 1)",
          position: "absolute",
          top: "50%",
          left: on
            ? switchStyle?.width - switchStyle?.height + thumbOffset
            : thumbOffset,

          height:
            typeof switchStyle?.height === "number"
              ? switchStyle.height - thumbOffset * 2
              : undefined,
          width:
            typeof switchStyle?.height === "number"
              ? switchStyle.height - thumbOffset * 2
              : undefined,

          borderRadius: Math.max(0, switchStyle?.borderRadius - 3) || "50%",

          transform: "translate(0%, -50%)",
          backgroundColor: switchStyle.color,
          boxShadow: "0 2px 4px rgba(0, 0, 0, 0.32)",
        }}
      ></div>
      <Icon
        src={on ? on_icon_src : off_icon_src}
        style={{
          transition: "left 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: "50%",
          left:
            typeof switchStyle?.height === "number" &&
            typeof switchStyle?.width === "number"
              ? on
                ? 4
                : switchStyle?.width - switchStyle?.height + 7 + 4
              : undefined,
          transform: "translate(0%, -50%)",

          height:
            typeof switchStyle?.height === "number"
              ? switchStyle.height - 14
              : undefined,
          width:
            typeof switchStyle?.height === "number"
              ? switchStyle.height - 14
              : undefined,
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
};
