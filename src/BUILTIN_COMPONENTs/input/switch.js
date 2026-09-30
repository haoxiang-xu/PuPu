import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { useMouse } from "../mini_react/mini_use";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Material } -------------------------------------------------------------------------------------------------------------- */
import { useMaterial, resolveComponentMaterial } from "../material";
/* { Material } -------------------------------------------------------------------------------------------------------------- */

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
const PlainSwitch = ({
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  GlassSwitchImpl — the glass material toggle (reached via <Switch material="glass" />).                                       */
/*  Built from the glass material SLIDER's vocabulary: a neutral frosted channel, a concentric                                   */
/*  accent fill that crossfades on/off, and a frosted backdrop-blur puck with a solid accent                                     */
/*  core. Constant size — NO mini collapse/retract. NO icon. On press the puck AND its core                                      */
/*  elongate into a pill (box-model width, like PlainSwitch) — and relax only on the true GLOBAL pointer                         */
/*  release (useMouse), release-anywhere. off = neutral channel, on = accent fill. dark/light aware.                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const GlassSwitchImpl = ({ style, on, set_on }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const mouse = useMouse();
  const [defaultOn, setDefaultOn] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isOn = set_on !== undefined ? on : defaultOn;

  /* PlainSwitch's global-release safety net: a press relaxes the moment the pointer is
     released ANYWHERE on screen, not only on mouse-up over the switch. */
  useEffect(() => {
    if (!mouse.leftKeyDown) setPressed(false);
  }, [mouse.leftKeyDown]);

  const sw = theme?.switch || {};
  /* glass is its own material with its own proportions — it does NOT inherit the theme's
     plain-switch size (64×32). Default 60×38; everything below derives from W/H in real px
     (no CSS scale), so bumping these two enlarges the whole switch. Override via style. */
  const W = style?.width ?? 60;
  const H = style?.height ?? 38;
  const accent = style?.backgroundColor_on ?? sw.backgroundColor_on ?? "#65C467";

  /* motion language lifted from the glass material slider */
  const GE = "cubic-bezier(0.32, 1, 0.32, 1)"; // glass decel
  const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)"; // overshoot — slider thumb spring
  const QELASTIC = "cubic-bezier(0.2, 0.7, 0.3, 1.4)"; // easeOutBack — overshoots the target then settles (回弹一下)

  /* full glass channel + concentric accent fill, CONSTANT size — no "mini" collapse/retract.
     Only the accent fill's on/off opacity and the puck (travel + press-bulge) animate. */
  const channelH = Math.round(H * 0.75); // taller groove, ≈24 @ H32
  const fillH = Math.max(6, Math.round(H * 0.25)); // ≈8 @ H32

  /* frosted glass puck — matches the slider's 28px puck; always visible. Travels left↔right
     for off/on; on press it ELONGATES into a pill (box-model width, not scaleX → no ellipse),
     anchored to its side and growing inward like PlainSwitch. */
  const thumbBox = Math.max(channelH + 4, H - 4);
  const stretch = pressed ? 1.5 : 1; // press → pill elongation (PlainSwitch feel)
  const thumbW = Math.round(thumbBox * stretch);
  /* the puck's solid core sits CONCENTRIC with the fill's end cap at rest (cap centres at
     channelH/2 and W - channelH/2). On press the pill elongates from its OUTER edge inward —
     OFF (left) grows rightward, ON (right) grows leftward — like PlainSwitch. left+width share
     one easing so the anchored edge stays put (no "move then grow"). */
  const capOff = channelH / 2;
  const capOn = W - channelH / 2;
  const thumbLeft = isOn
    ? Math.round(capOn + thumbBox / 2 - thumbW)
    : Math.round(capOff - thumbBox / 2);
  /* at rest the puck tucks a touch SMALLER than the track (on OR off); only HOVER (or an active
     press) enlarges it to its proud size — slider-thumb spring scale. on/off is read from the
     puck's position + the fill, not its size. (pressed keeps it big if the cursor drags off mid-press.) */
  const wakeScale = hovered || pressed ? 1 : 0.8;

  const toggle = (e) => {
    e.stopPropagation();
    if (set_on !== undefined) set_on(!on);
    else setDefaultOn(!defaultOn);
  };

  return (
    <div
      role="switch"
      aria-checked={isOn}
      tabIndex={0}
      onClick={toggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={() => setPressed(true)}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle(e);
        }
      }}
      style={{
        position: "relative",
        width: W,
        height: H,
        cursor: "pointer",
        outline: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      draggable={false}
    >
      {/* neutral glass channel — full groove, constant size (no mini collapse) */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          width: W,
          height: channelH,
          borderRadius: channelH / 2,
          transform: "translateY(-50%)",
          background: isDark
            ? "rgba(255,255,255,0.16)"
            : "linear-gradient(to bottom, rgba(0,0,0,0.14), rgba(0,0,0,0.05))",
          boxShadow: isDark
            ? "inset 0 1px 2px rgba(0,0,0,0.45)"
            : "inset 0 1px 2px rgba(0,0,0,0.12), 0 0.75px 0 rgba(255,255,255,0.6)",
          pointerEvents: "none",
        }}
      />
      {/* accent fill (progress) — left cap anchored at the channel's left cap; its width SLIDES
          from a dot (OFF) out to the right cap (ON), so the progress grows with the puck instead
          of popping in. Caps stay CONCENTRIC with the channel's (centres at channelH/2 and
          W - channelH/2); the ON right cap meets the puck's core. */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: (channelH - fillH) / 2,
          width: isOn ? capOn - capOff + fillH : fillH,
          height: fillH,
          borderRadius: fillH / 2,
          transform: "translateY(-50%)",
          background: accent,
          transition: `width 0.28s ${QELASTIC}`,
          pointerEvents: "none",
        }}
      />
      {/* frosted glass puck — icon-less; elongates into a pill on press (PlainSwitch graft).
          Fixed-px corner radius (= half height) so a wider box reads as a stadium, not an ellipse. */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: thumbLeft,
          width: thumbW,
          height: thumbBox,
          borderRadius: thumbBox / 2,
          boxSizing: "border-box",
          transform: `translateY(-50%) scale(${wakeScale})`,
          transition: `left 0.28s ${QELASTIC}, width 0.28s ${QELASTIC}, transform 0.28s ${SPRING}, box-shadow 0.32s ${GE}`,
          background: isDark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.40)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          border: isDark
            ? "1px solid rgba(255,255,255,0.22)"
            : "1px solid rgba(255,255,255,0.65)",
          boxShadow: isDark
            ? "0 2px 8px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.14)"
            : "0 2px 8px rgba(0,0,0,0.18), inset 0 0 0 0.5px rgba(255,255,255,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        {/* solid accent core — like the glass slider thumb's centre dot. Elongates into a
            little pill by the SAME stretch factor as the puck on press. */}
        <div
          style={{
            width: Math.round(fillH * stretch),
            height: fillH,
            borderRadius: fillH / 2,
            background: accent,
            transition: `width 0.28s ${QELASTIC}`,
          }}
        />
      </div>
    </div>
  );
};

/* { Material dispatch } ----------------------------------------------------------------------------------------------------- */
const SWITCH_DEFAULT_MATERIAL = "plain";
const SWITCH_MATERIALS = { plain: PlainSwitch, glass: GlassSwitchImpl };

/**
 * Switch — thin material dispatcher. Resolves the material (explicit `material` prop >
 * context material > own default) and renders the matching impl: plain → PlainSwitch (the
 * default toggle), glass → the frosted GlassSwitchImpl. Any unsupported request falls back to
 * PlainSwitch. Same default export + forwarded props, so all JSX callers keep working unchanged.
 */
const Switch = ({ material, ...props }) => {
  const contextMaterial = useMaterial();
  const requested = material !== undefined ? material : contextMaterial;
  const resolved = resolveComponentMaterial(
    requested,
    SWITCH_MATERIALS,
    SWITCH_DEFAULT_MATERIAL
  );
  const Impl = SWITCH_MATERIALS[resolved];
  return <Impl {...props} />;
};
/* { Material dispatch } ----------------------------------------------------------------------------------------------------- */

export {
  Switch as default,
  Switch,
  LightSwitch,
  NotificationSwitch,
  MaterialSwitch,
  SemiSwitch,
  PlainSwitch,
  SWITCH_MATERIALS,
};
