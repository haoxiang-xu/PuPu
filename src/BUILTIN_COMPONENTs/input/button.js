import { useContext, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const RESERVED_STYLE_KEYS = new Set(["root", "background", "content", "state"]);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const deepMerge = (base = {}, override = {}) => {
  const next = { ...(isPlainObject(base) ? base : {}) };
  if (!isPlainObject(override)) {
    return next;
  }

  for (const key of Object.keys(override)) {
    const baseValue = next[key];
    const overrideValue = override[key];

    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      next[key] = deepMerge(baseValue, overrideValue);
    } else if (overrideValue !== undefined) {
      next[key] = overrideValue;
    }
  }
  return next;
};

const normalizeUserButtonStyle = (style) => {
  if (!isPlainObject(style)) {
    return {};
  }

  const slotStyle = {
    root: isPlainObject(style.root) ? style.root : {},
    background: isPlainObject(style.background) ? style.background : {},
    content: isPlainObject(style.content) ? style.content : {},
    state: isPlainObject(style.state) ? style.state : {},
  };

  const flatStyle = {};
  for (const key of Object.keys(style)) {
    if (!RESERVED_STYLE_KEYS.has(key)) {
      flatStyle[key] = style[key];
    }
  }

  const {
    hoverBackgroundColor,
    activeBackgroundColor,
    paddingVertical,
    paddingHorizontal,
    iconOnlyPaddingVertical,
    iconOnlyPaddingHorizontal,
    iconSize,
    ...flatRootStyle
  } = flatStyle;

  const legacyStructuredStyle = {
    root: {
      ...flatRootStyle,
      ...(paddingVertical !== undefined ? { paddingVertical } : {}),
      ...(paddingHorizontal !== undefined ? { paddingHorizontal } : {}),
      ...(iconOnlyPaddingVertical !== undefined ? { iconOnlyPaddingVertical } : {}),
      ...(iconOnlyPaddingHorizontal !== undefined
        ? { iconOnlyPaddingHorizontal }
        : {}),
      ...(iconSize !== undefined ? { iconSize } : {}),
    },
    background: {
      ...(hoverBackgroundColor !== undefined ? { hoverBackgroundColor } : {}),
      ...(activeBackgroundColor !== undefined ? { activeBackgroundColor } : {}),
    },
  };

  return deepMerge(legacyStructuredStyle, slotStyle);
};

const DEFAULT_BUTTON_STYLE = {
  root: {
    fontSize: 16,
    fontFamily: "Jost, sans-serif",
    borderRadius: 7,
    color: "#222222",
    paddingVertical: 6,
    paddingHorizontal: 12,
    iconOnlyPaddingVertical: 8,
    iconOnlyPaddingHorizontal: 8,
    gap: 6,
  },
  background: {
    hoverBackgroundColor: "rgba(0,0,0,0.06)",
    activeBackgroundColor: "rgba(0,0,0,0.10)",
    transformHidden: "scale(0.5, 0)",
    transformVisible: "scale(1)",
    pressedInset: 2,
    minPressedRadius: 2,
    transitionIn:
      "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.0), opacity 0.18s ease, inset 0.15s cubic-bezier(0.32, 1, 0.32, 1), border-radius 0.15s ease",
    transitionOut:
      "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease, inset 0.15s ease, border-radius 0.15s ease",
  },
  content: {
    root: { position: "relative", zIndex: 1 },
    prefixIconWrap: {
      position: "relative",
      zIndex: 1,
      display: "flex",
      alignItems: "center",
    },
    prefixText: { position: "relative", zIndex: 1 },
    label: { position: "relative", zIndex: 1 },
    postfixText: { position: "relative", zIndex: 1 },
    postfixIconWrap: {
      position: "relative",
      zIndex: 1,
      display: "flex",
      alignItems: "center",
    },
    icon: {},
  },
  state: {
    hover: { root: {}, background: {} },
    active: { root: {}, background: {} },
    disabled: { root: { opacity: 0.4, cursor: "not-allowed" }, background: {} },
  },
};

const resolveStateStyle = ({ stateStyle, hovered, pressed, disabled }) => {
  const mergedStateStyle = {
    root: {},
    background: {},
  };

  if (!disabled && hovered) {
    mergedStateStyle.root = deepMerge(
      mergedStateStyle.root,
      stateStyle?.hover?.root || {}
    );
    mergedStateStyle.background = deepMerge(
      mergedStateStyle.background,
      stateStyle?.hover?.background || {}
    );
  }
  if (!disabled && pressed) {
    mergedStateStyle.root = deepMerge(
      mergedStateStyle.root,
      stateStyle?.active?.root || {}
    );
    mergedStateStyle.background = deepMerge(
      mergedStateStyle.background,
      stateStyle?.active?.background || {}
    );
  }
  if (disabled) {
    mergedStateStyle.root = deepMerge(
      mergedStateStyle.root,
      stateStyle?.disabled?.root || {}
    );
    mergedStateStyle.background = deepMerge(
      mergedStateStyle.background,
      stateStyle?.disabled?.background || {}
    );
  }

  return mergedStateStyle;
};

/**
 * Button — ghost-style button with hover background that scales from center.
 *
 * Props:
 *   prefix_icon       – icon name rendered before label
 *   prefix            – text rendered before label (after prefix_icon)
 *   label             – main button text
 *   postfix           – text rendered after label (before postfix_icon)
 *   postfix_icon      – icon name rendered after label
 *   style             – slot-based style: { root, background, content, state }
 *   disabled          – disables the button
 *   onClick           – click handler
 */
const Button = ({
  prefix_icon,
  prefix,
  label,
  postfix,
  postfix_icon,
  style,
  disabled = false,
  onClick = () => {},
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const themeButtonStyle = deepMerge(
    DEFAULT_BUTTON_STYLE,
    theme?.button || {}
  );
  const userButtonStyle = normalizeUserButtonStyle(style);
  const resolvedStyle = deepMerge(themeButtonStyle, userButtonStyle);
  const stateStyle = resolveStateStyle({
    stateStyle: resolvedStyle.state,
    hovered,
    pressed,
    disabled,
  });

  const rootStyle = deepMerge(resolvedStyle.root, stateStyle.root);
  const backgroundStyle = deepMerge(
    resolvedStyle.background,
    stateStyle.background
  );
  const contentStyle = resolvedStyle.content || {};

  const iconOnly =
    !label && !prefix && !postfix && (prefix_icon || postfix_icon);

  const fontSize = rootStyle?.fontSize ?? 16;
  const fontSizeNumber =
    typeof fontSize === "number"
      ? fontSize
      : Number.parseFloat(fontSize) || 16;
  const borderRadius = rootStyle?.borderRadius ?? 7;
  const paddingVertical = iconOnly
    ? rootStyle?.iconOnlyPaddingVertical ?? rootStyle?.paddingVertical ?? 8
    : rootStyle?.paddingVertical ?? 6;
  const paddingHorizontal = iconOnly
    ? rootStyle?.iconOnlyPaddingHorizontal ?? rootStyle?.paddingHorizontal ?? 8
    : rootStyle?.paddingHorizontal ?? 12;
  const gap = rootStyle?.gap ?? 6;
  const iconSize = contentStyle?.icon?.size ?? rootStyle?.iconSize ?? Math.round(fontSizeNumber * 1.05);

  const showBackground = !disabled && (hovered || pressed);

  const computedRootStyle = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap,
    fontFamily:
      rootStyle?.fontFamily || theme?.font?.fontFamily || "Jost, sans-serif",
    fontSize,
    color: rootStyle?.color || theme?.color || (isDark ? "#CCCCCC" : "#222222"),
    background: "transparent",
    border: "none",
    outline: "none",
    borderRadius,
    padding: `${paddingVertical}px ${paddingHorizontal}px`,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    overflow: "hidden",
    userSelect: "none",
    WebkitUserSelect: "none",
    whiteSpace: "nowrap",
  };

  const computedBackgroundStyle = {
    position: "absolute",
    inset: pressed ? backgroundStyle?.pressedInset ?? 2 : 0,
    borderRadius: pressed
      ? Math.max(
          borderRadius - 1,
          backgroundStyle?.minPressedRadius ?? 2
        )
      : borderRadius,
    backgroundColor: pressed
      ? backgroundStyle?.activeBackgroundColor
      : backgroundStyle?.hoverBackgroundColor,
    transform: showBackground
      ? backgroundStyle?.transformVisible || "scale(1)"
      : backgroundStyle?.transformHidden || "scale(0.5, 0)",
    opacity: showBackground ? 1 : 0,
    transition: showBackground
      ? backgroundStyle?.transitionIn
      : backgroundStyle?.transitionOut,
    pointerEvents: "none",
    zIndex: 0,
  };

  const computedContentRootStyle = {
    position: "relative",
    zIndex: 1,
  };

  const computedIconStyle = {
    width: contentStyle?.icon?.width ?? iconSize,
    height: contentStyle?.icon?.height ?? iconSize,
  };

  const iconWrapBaseStyle = {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
  };

  const textWrapBaseStyle = {
    position: "relative",
    zIndex: 1,
  };

  return (
    <button
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={deepMerge(computedRootStyle, rootStyle)}
    >
      <span
        aria-hidden="true"
        style={deepMerge(computedBackgroundStyle, backgroundStyle)}
      />

      {prefix_icon && (
        <span
          style={deepMerge(
            deepMerge(iconWrapBaseStyle, computedContentRootStyle),
            deepMerge(contentStyle?.root || {}, contentStyle?.prefixIconWrap || {})
          )}
        >
          <Icon src={prefix_icon} style={deepMerge(computedIconStyle, contentStyle?.icon || {})} />
        </span>
      )}
      {prefix && (
        <span
          style={deepMerge(
            deepMerge(textWrapBaseStyle, computedContentRootStyle),
            deepMerge(contentStyle?.root || {}, contentStyle?.prefixText || {})
          )}
        >
          {prefix}
        </span>
      )}
      {label && (
        <span
          style={deepMerge(
            deepMerge(textWrapBaseStyle, computedContentRootStyle),
            deepMerge(contentStyle?.root || {}, contentStyle?.label || {})
          )}
        >
          {label}
        </span>
      )}
      {postfix && (
        <span
          style={deepMerge(
            deepMerge(textWrapBaseStyle, computedContentRootStyle),
            deepMerge(contentStyle?.root || {}, contentStyle?.postfixText || {})
          )}
        >
          {postfix}
        </span>
      )}
      {postfix_icon && (
        <span
          style={deepMerge(
            deepMerge(iconWrapBaseStyle, computedContentRootStyle),
            deepMerge(contentStyle?.root || {}, contentStyle?.postfixIconWrap || {})
          )}
        >
          <Icon src={postfix_icon} style={deepMerge(computedIconStyle, contentStyle?.icon || {})} />
        </span>
      )}
    </button>
  );
};

export default Button;
