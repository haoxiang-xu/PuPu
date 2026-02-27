import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Constants } ------------------------------------------------------------------------------------------------------------- */
const default_gap_width = 8;
const default_left_right_padding = 8;
const default_top_bottom_padding = 6;
/* { Constants } ------------------------------------------------------------------------------------------------------------- */

const Separator = ({ style }) => {
  const { theme } = useContext(ConfigContext);
  return (
    <div
      style={{
        position: "relative",
        display: "inline",
        width: 1,
        backgroundColor: style?.color || theme?.color || "rgba(0, 0, 0, 0.12)",
        ...style,
      }}
    ></div>
  );
};

const ValidationCodeInput = ({ style }) => {
  const { theme } = useContext(ConfigContext);
  const inputRefs = useRef([]);
  const [values, setValues] = useState(["", "", "", "", "", ""]);

  useEffect(() => {
    for (let i = 0; i < values.length; i++) {
      if (values[i] === "") {
        if (inputRefs.current[i]) {
          inputRefs.current[i].focus();
        }
        return;
      }
    }
    if (inputRefs.current[values.length - 1]) {
      inputRefs.current[values.length - 1].focus();
    }
  }, [values]);

  const handle_key_down = (e, idx) => {
    const target = e.target;
    const selectionStart = target?.selectionStart ?? 0;
    const selectionEnd = target?.selectionEnd ?? 0;
    const currentValue = target?.value ?? "";
    const isCaretAtStart = selectionStart === 0 && selectionEnd === 0;
    const isCaretAtEnd =
      selectionStart === currentValue.length &&
      selectionEnd === currentValue.length;

    if (e.key === "Backspace" && values[idx] === "") {
      if (idx > 0) {
        const newValues = [...values];
        newValues[idx - 1] = "";
        setValues(newValues);
        if (inputRefs.current[idx - 1]) {
          inputRefs.current[idx - 1].focus();
        }
      }
    }
    if (e.key === "ArrowLeft") {
      if (idx > 0 && isCaretAtStart) {
        e.preventDefault();
        if (inputRefs.current[idx - 1]) {
          inputRefs.current[idx - 1].focus();
        }
      }
    }
    if (e.key === "ArrowRight") {
      if (idx < values.length - 1 && isCaretAtEnd) {
        e.preventDefault();
        if (inputRefs.current[idx + 1]) {
          inputRefs.current[idx + 1].focus();
        }
      }
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
      }}
    >
      {values.map((val, idx) => (
        <SinkingInput
          input_ref={(el) => (inputRefs.current[idx] = el)}
          key={idx}
          style={{
            width: style?.fontSize || theme?.input.fontSize || 16,
            textAlign: "center",
            fontSize: style?.fontSize || theme?.input.fontSize || 16,
          }}
          value={val}
          set_value={(next) => {
            if (next.length > 1) next = next.slice(-1);
            const newValues = [...values];
            newValues[idx] = next;
            setValues(newValues);
          }}
          on_key_down={(e) => handle_key_down(e, idx)}
          placeholder=""
          maxLength={1}
        />
      ))}
    </div>
  );
};
const InputWithDelete = ({ style, value, set_value = () => {}, ...props }) => {
  const { theme } = useContext(ConfigContext);
  const [defaultValue, setDefaultValue] = useState("");

  return (
    <SinkingInput
      style={{ ...style }}
      value={value !== undefined ? value : defaultValue}
      set_value={(next) => {
        if (value !== undefined) {
          set_value(next);
        } else {
          setDefaultValue(next);
        }
      }}
      postfix_component={
        <div
          style={{
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            set_value("");
            setDefaultValue("");
          }}
        >
          <Icon
            src={"delete_input"}
            style={{ width: 20, height: 20 }}
            color={style?.color || theme?.color || "black"}
          />
        </div>
      }
      no_separator={true}
      {...props}
    />
  );
};
const Password = ({
  style,
  value,
  set_value = () => {},
  mask_char = "\u25CF",
  ...props
}) => {
  const { theme } = useContext(ConfigContext);
  const [visible, setVisible] = useState(false);
  const [internalValue, setInternalValue] = useState("");
  const inputRef = useRef(null);
  const pendingCaretRef = useRef(null);
  const valueRef = useRef("");

  const isControlled = value !== undefined;
  const realValue = isControlled ? String(value ?? "") : internalValue;
  const maskChar = mask_char || "\u25CF";
  const displayValue = visible ? realValue : maskChar.repeat(realValue.length);

  useEffect(() => {
    valueRef.current = realValue;
  }, [realValue]);
  useEffect(() => {
    if (visible) return;
    if (!inputRef.current) return;
    if (pendingCaretRef.current === null) return;
    const caret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    inputRef.current.setSelectionRange(caret, caret);
  }, [displayValue, visible]);

  const update_value = (next) => {
    if (!isControlled) setInternalValue(next);
    set_value(next);
  };
  const handle_set_value = (nextDisplayValue, event) => {
    const diff_masked_value = (prevLen, nextValue, maskChar) => {
      const prevValue = maskChar.repeat(prevLen);
      const nextLen = nextValue.length;
      let start = 0;
      while (
        start < prevLen &&
        start < nextLen &&
        nextValue[start] === prevValue[start]
      ) {
        start += 1;
      }
      let end = 0;
      while (
        end < prevLen - start &&
        end < nextLen - start &&
        nextValue[nextLen - 1 - end] === prevValue[prevLen - 1 - end]
      ) {
        end += 1;
      }
      const removed = prevLen - start - end;
      const inserted = nextValue.slice(start, nextLen - end);
      return { start, removed, inserted };
    };
    if (visible) {
      update_value(nextDisplayValue);
      return;
    }

    const prevValue = valueRef.current;
    const prevLen = prevValue.length;
    const nextLen = nextDisplayValue.length;
    const inputType = event?.nativeEvent?.inputType || "";
    const data = event?.nativeEvent?.data ?? "";
    const caret = event?.target?.selectionStart ?? nextLen;

    if (inputType.startsWith("insert")) {
      if (data) {
        const insertLen = data.length;
        const removed = Math.max(0, prevLen - (nextLen - insertLen));
        const start = Math.max(0, caret - insertLen);
        const nextValue =
          prevValue.slice(0, start) + data + prevValue.slice(start + removed);
        pendingCaretRef.current = start + insertLen;
        update_value(nextValue);
        return;
      }

      const diff = diff_masked_value(prevLen, nextDisplayValue, maskChar);
      const nextValue =
        prevValue.slice(0, diff.start) +
        diff.inserted +
        prevValue.slice(diff.start + diff.removed);
      pendingCaretRef.current = diff.start + diff.inserted.length;
      update_value(nextValue);
      return;
    }

    if (inputType.startsWith("delete")) {
      const removed = Math.max(1, prevLen - nextLen);
      const deleteStart = Math.max(0, caret);
      const nextValue =
        prevValue.slice(0, deleteStart) +
        prevValue.slice(deleteStart + removed);
      pendingCaretRef.current = deleteStart;
      update_value(nextValue);
      return;
    }

    if (!inputType) {
      if (nextLen < prevLen) {
        const removed = Math.max(1, prevLen - nextLen);
        const deleteStart = Math.max(0, caret);
        const nextValue =
          prevValue.slice(0, deleteStart) +
          prevValue.slice(deleteStart + removed);
        pendingCaretRef.current = deleteStart;
        update_value(nextValue);
        return;
      }
      if (nextLen > prevLen) {
        const insertLen = nextLen - prevLen;
        const start = Math.max(0, caret - insertLen);
        const inserted = nextDisplayValue.slice(start, start + insertLen);
        const nextValue =
          prevValue.slice(0, start) + inserted + prevValue.slice(start);
        pendingCaretRef.current = start + insertLen;
        update_value(nextValue);
        return;
      }
    }

    const diff = diff_masked_value(prevLen, nextDisplayValue, maskChar);
    const nextValue =
      prevValue.slice(0, diff.start) +
      diff.inserted +
      prevValue.slice(diff.start + diff.removed);
    pendingCaretRef.current = diff.start + diff.inserted.length;
    update_value(nextValue);
  };

  return (
    <SinkingInput
      type="text"
      input_ref={inputRef}
      style={{ ...style }}
      value={displayValue}
      set_value={handle_set_value}
      postfix_component={
        <div
          style={{
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setVisible(!visible);
          }}
        >
          <Icon
            src={visible ? "eye_closed" : "eye_open"}
            style={{ width: 20, height: 20 }}
            color={style?.color || theme?.color || "black"}
          />
        </div>
      }
      placeholder="Password"
      no_separator={true}
      {...props}
    />
  );
};
const SinkingInput = ({
  /* content props -------------- */
  label,
  prefix_component,
  prefix_icon,
  prefix_label,
  postfix_component,
  postfix_label,
  postfix_icon,
  placeholder,

  /* functional props ----------- */
  input_ref,
  value,
  set_value = () => {},
  on_focus = () => {},
  on_blur = () => {},
  on_key_down = () => {},

  /* styling props -------------- */
  type = "text",
  style,
  max_length,
  no_separator = false,
}) => {
  const { theme } = useContext(ConfigContext);
  const [defaultValue, setDefaultValue] = useState("");
  const default_input_ref = useRef(null);
  const input_node_ref = useRef(null);
  const [onFocus, setOnFocus] = useState(false);
  const [labelLeft, setLabelLeft] = useState(default_left_right_padding);
  const fontSize = style?.fontSize || theme?.input.fontSize || 16;
  const iconSize = fontSize + 4;
  const separatorHeight = fontSize + 4;

  const set_input_element_ref = useCallback(
    (node) => {
      input_node_ref.current = node;
      default_input_ref.current = node;
      if (typeof input_ref === "function") {
        input_ref(node);
      } else if (input_ref && typeof input_ref === "object") {
        input_ref.current = node;
      }
    },
    [input_ref],
  );

  useLayoutEffect(() => {
    const update_label_left = () => {
      if (!input_node_ref.current) {
        setLabelLeft(default_left_right_padding);
        return;
      }
      setLabelLeft(input_node_ref.current.offsetLeft);
    };

    update_label_left();
    if (typeof window !== "undefined") {
      window.addEventListener("resize", update_label_left);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", update_label_left);
      }
    };
  }, [
    prefix_component,
    prefix_icon,
    prefix_label,
    postfix_component,
    postfix_icon,
    postfix_label,
    no_separator,
    fontSize,
  ]);
  const hasValue =
    (value !== undefined ? value : defaultValue)?.toString().length > 0;
  const isLabelFloating = onFocus || hasValue;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: `${default_gap_width}px`,
        padding: `${default_top_bottom_padding}px ${default_left_right_padding}px`,
        height:
          style?.height ||
          theme?.input.height ||
          style?.fontSize + 16 ||
          theme?.input.fontSize + 16 ||
          32,

        backgroundColor: theme?.input.backgroundColor || "white",
        borderRadius: style?.borderRadius || theme?.input.borderRadius || 4,
        boxShadow: style?.boxShadow || theme?.input.boxShadow || "none",
        outline:
          style?.outline ||
          (onFocus
            ? theme?.input.outline.onFocus
            : theme?.input.outline.onBlur || "1px solid #CCCCCC"),
        ...style,
      }}
      onClick={() => {
        if (input_node_ref.current) {
          input_node_ref.current.focus();
        }
      }}
    >
      {prefix_component !== undefined ? (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {prefix_component}
          {!no_separator && (
            <Separator
              style={{
                height: separatorHeight,
              }}
            />
          )}
        </div>
      ) : null}
      {prefix_icon === undefined ? null : (
        <>
          <Icon
            src={prefix_icon}
            style={{
              width: iconSize,
              height: iconSize,
              flexShrink: 0,
            }}
            color={style?.color || theme?.color || "black"}
          />
          {!no_separator && (
            <Separator
              style={{
                height: separatorHeight,
              }}
            />
          )}
        </>
      )}
      {prefix_label === undefined ? null : (
        <>
          <span
            style={{
              fontFamily:
                style?.fontFamily ||
                theme?.font.fontFamily ||
                "Arial, sans-serif",
              fontSize,
              color: style?.color || theme?.color || "black",
              flexShrink: 0,
              whiteSpace: "nowrap",

              userSelect: "none",
              WebkitUserSelect: "none",
              MozUserSelect: "none",
              msUserSelect: "none",
            }}
          >
            {prefix_label}
          </span>
          {!no_separator && (
            <Separator
              style={{
                height: separatorHeight,
              }}
            />
          )}
        </>
      )}
      <input
        ref={set_input_element_ref}
        type={type}
        style={{
          fontFamily: style?.fontFamily || theme?.font.fontFamily || "Jost",
          flex: 1,
          minWidth: 0,
          width: "auto",
          height: "90%",
          fontSize,
          border: "1px solid rgba(255, 255, 255, 0)",
          backgroundColor: "rgba(0,0,0,0)",
          color: style?.color || theme?.color || "black",
          caretColor: style?.color || theme?.color || "black",
          outline: "none",
        }}
        onFocus={() => {
          setOnFocus(true);
          on_focus();
        }}
        onBlur={() => {
          setOnFocus(false);
          on_blur();
        }}
        onKeyDown={(e) => {
          on_key_down(e);
        }}
        maxLength={max_length}
        value={value !== undefined ? value : defaultValue}
        onChange={(e) => {
          if (value !== undefined) {
            set_value(e.target.value, e);
          } else {
            setDefaultValue(e.target.value);
          }
        }}
        placeholder={
          placeholder !== undefined
            ? placeholder
            : label === undefined
              ? "Placeholder"
              : undefined
        }
      />
      {postfix_label === undefined ? null : (
        <>
          {!no_separator && (
            <Separator
              style={{
                height: separatorHeight,
              }}
            />
          )}
          <span
            style={{
              fontFamily:
                style?.fontFamily ||
                theme?.font.fontFamily ||
                "Arial, sans-serif",
              fontSize,
              color: style?.color || theme?.color || "black",
              flexShrink: 0,
              whiteSpace: "nowrap",

              userSelect: "none",
              WebkitUserSelect: "none",
              MozUserSelect: "none",
              msUserSelect: "none",
            }}
          >
            {postfix_label}
          </span>
        </>
      )}
      {postfix_icon === undefined ? null : (
        <>
          {!no_separator && (
            <Separator
              style={{
                height: separatorHeight,
              }}
            />
          )}
          <Icon
            src={postfix_icon}
            style={{
              width: iconSize,
              height: iconSize,
              flexShrink: 0,
            }}
            color={style?.color || theme?.color || "black"}
          />
        </>
      )}
      {postfix_component !== undefined ? (
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {!no_separator && (
            <Separator
              style={{
                height: separatorHeight,
              }}
            />
          )}
          {postfix_component}
        </div>
      ) : null}
      {label === undefined ? null : (
        <span
          style={{
            position: "absolute",
            transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
            top:
              isLabelFloating
                ? `calc(0% - ${(fontSize * 0.75) / 2 + 6}px)`
                : "50%",
            left:
              isLabelFloating
                ? default_left_right_padding
                : labelLeft,
            transform: "translateY(-50%)",
            fontFamily:
              style?.fontFamily ||
              theme?.font.fontFamily ||
              "Arial, sans-serif",
            fontSize:
              isLabelFloating ? fontSize * 0.75 : fontSize,
            color: onFocus
              ? style?.color || theme?.color || "black"
              : style?.color || theme?.color || "#666666",
            opacity:
              isLabelFloating ? 0.6 : 0.45,

            userSelect: "none",
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
};

/* ── FloatingInput ───────────────────────────────────────────────────────────── */
const FloatingInput = ({
  label,
  placeholder,
  value,
  set_value = () => {},
  on_focus = () => {},
  on_blur = () => {},
  on_key_down = () => {},
  input_ref,
  type = "text",
  style,
  max_length,
  disabled = false,
  prefix_icon,
  prefix_label,
  prefix_component,
  postfix_icon,
  postfix_label,
  postfix_component,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const [defaultValue, setDefaultValue] = useState("");
  const default_input_ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const prefixRef = useRef(null);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : defaultValue;
  const hasValue =
    currentValue !== undefined &&
    currentValue !== null &&
    String(currentValue).length > 0;
  const isActive = focused || hasValue;

  const isDark = onThemeMode === "dark_mode";
  const baseColor = style?.color || theme?.color || (isDark ? "#CCC" : "#222");
  const mutedColor = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const fontSize = style?.fontSize || theme?.input?.fontSize || 16;
  const fontFamily = style?.fontFamily || theme?.font?.fontFamily || "Jost";
  const borderRadius = style?.borderRadius || theme?.input?.borderRadius || 7;
  const bg =
    style?.backgroundColor ??
    (isDark ? "rgba(30, 30, 30, 0.95)" : "rgba(255, 255, 255, 0.95)");
  const border = isDark
    ? "1px solid rgba(255, 255, 255, 0.08)"
    : "1px solid rgba(0, 0, 0, 0.06)";
  const shadow = isDark
    ? "0 4px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)"
    : "0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)";
  const shadowHover = isDark
    ? "0 12px 36px rgba(0, 0, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.35)"
    : "0 12px 36px rgba(0, 0, 0, 0.10), 0 3px 8px rgba(0, 0, 0, 0.06)";
  const labelColor = focused
    ? baseColor
    : isDark
      ? "rgba(255,255,255,0.4)"
      : "rgba(0,0,0,0.4)";
  const padding = Math.round(fontSize * 0.75);

  const hasPrefix =
    prefix_icon !== undefined ||
    prefix_label !== undefined ||
    prefix_component !== undefined;
  const hasPostfix =
    postfix_icon !== undefined ||
    postfix_label !== undefined ||
    postfix_component !== undefined;

  /* Calculate label left offset to account for prefix width */
  const [prefixWidth, setPrefixWidth] = useState(0);
  useEffect(() => {
    if (prefixRef.current) {
      setPrefixWidth(prefixRef.current.offsetWidth);
    }
  }, [prefix_icon, prefix_label, prefix_component, fontSize]);
  const labelLeft = hasPrefix ? padding + prefixWidth + 12 : padding;

  return (
    <div
      style={{
        position: "relative",
        width: style?.width || "auto",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "text",
      }}
      onClick={() => {
        if (disabled) return;
        const ref = input_ref || default_input_ref;
        if (ref?.current) ref.current.focus();
      }}
    >
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 6,
          boxSizing: "content-box",
          height:
            style?.height ||
            theme?.input?.height ||
            (fontSize ? fontSize + 16 : undefined) ||
            32,
          backgroundColor: bg,
          border,
          borderRadius,
          boxShadow: hovered || focused ? shadowHover : shadow,
          transition: "box-shadow 0.3s ease",
          padding: `${default_top_bottom_padding}px ${padding}px`,
        }}
      >
        {/* prefix */}
        {hasPrefix && (
          <div
            ref={prefixRef}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {prefix_component}
            {prefix_icon && (
              <Icon
                src={prefix_icon}
                color={baseColor}
                style={{
                  width: fontSize + 4,
                  height: fontSize + 4,
                }}
              />
            )}
            {prefix_label && (
              <span
                style={{
                  fontFamily,
                  fontSize,
                  color: mutedColor,
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {prefix_label}
              </span>
            )}
          </div>
        )}
        <input
          ref={input_ref || default_input_ref}
          type={type}
          disabled={disabled}
          maxLength={max_length}
          value={currentValue}
          placeholder={!label || isActive ? placeholder : undefined}
          onChange={(e) => {
            if (isControlled) {
              set_value(e.target.value, e);
            } else {
              setDefaultValue(e.target.value);
            }
          }}
          onFocus={() => {
            setFocused(true);
            on_focus();
          }}
          onBlur={() => {
            setFocused(false);
            on_blur();
          }}
          onKeyDown={on_key_down}
          style={{
            flex: 1,
            boxSizing: "border-box",
            fontFamily,
            fontSize,
            color: baseColor,
            caretColor: baseColor,
            background: "transparent",
            border: "none",
            borderRadius,
            outline: "none",
            padding: 0,
            minWidth: 0,
          }}
        />
        {/* postfix */}
        {hasPostfix && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
            }}
          >
            {postfix_label && (
              <span
                style={{
                  fontFamily,
                  fontSize,
                  color: mutedColor,
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {postfix_label}
              </span>
            )}
            {postfix_icon && (
              <Icon
                src={postfix_icon}
                color={baseColor}
                style={{
                  width: fontSize + 4,
                  height: fontSize + 4,
                }}
              />
            )}
            {postfix_component && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  transform: "scale(0.85)",
                  transformOrigin: "center",
                }}
              >
                {postfix_component}
              </div>
            )}
          </div>
        )}
        {/* floating label */}
        {label && (
          <span
            style={{
              position: "absolute",
              left: isActive ? padding : labelLeft,
              top: isActive
                ? `calc(0% - ${(fontSize * 0.75) / 2 + 6}px)`
                : "50%",
              transform: "translateY(-50%)",
              fontSize: isActive ? fontSize * 0.75 : fontSize,
              fontFamily,
              color: labelColor,
              opacity: isActive ? 0.6 : 0.45,
              transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 1,
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
};

/* ── Input ───────────────────────────────────────────────────────────────────── */
/**
 * Ghost-style single-line input — transparent background, faint border.
 * On hover / focus the background scales from center (same animation as Button)
 * and the border disappears.
 */
const Input = ({
  label,
  placeholder,
  value,
  set_value = () => {},
  on_focus = () => {},
  on_blur = () => {},
  on_key_down = () => {},
  input_ref,
  type = "text",
  style,
  max_length,
  disabled = false,
  prefix_icon,
  prefix_label,
  postfix_icon,
  postfix_label,
  postfix_component,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const tf = theme?.textfield || {};

  const [defaultValue, setDefaultValue] = useState("");
  const default_input_ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : defaultValue;
  // eslint-disable-next-line no-unused-vars
  const hasValue =
    currentValue !== undefined &&
    currentValue !== null &&
    String(currentValue).length > 0;

  /* ── design tokens ── */
  const fontSize = style?.fontSize || tf.fontSize || 16;
  const fontFamily =
    style?.fontFamily || theme?.font?.fontFamily || "Jost, sans-serif";
  const borderRadius = style?.borderRadius || tf.borderRadius || 7;
  const baseColor = style?.color || theme?.color || (isDark ? "#CCC" : "#222");
  const placeholderColor = isDark
    ? "rgba(255,255,255,0.35)"
    : "rgba(0,0,0,0.35)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const activeBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)";
  const faintBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.12)";
  const paddingV = style?.paddingVertical ?? 6;
  const paddingH = style?.paddingHorizontal ?? 12;
  const iconSize = style?.iconSize || Math.round(fontSize * 1.05);
  const gap = style?.gap ?? 6;

  const showBg = hovered || focused;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (disabled) return;
        const ref = input_ref || default_input_ref;
        if (ref?.current) ref.current.focus();
      }}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap,
        fontFamily,
        fontSize,
        color: baseColor,
        background: "transparent",
        border: showBg ? "1px solid transparent" : faintBorder,
        outline: "none",
        borderRadius,
        padding: `${paddingV}px ${paddingH}px`,
        cursor: disabled ? "not-allowed" : "text",
        opacity: disabled ? 0.4 : 1,
        overflow: "hidden",
        boxSizing: "border-box",
        transition: "border 0.2s ease",
        width: style?.width || "auto",
        ...style,
      }}
    >
      {/* ── Hover / focus background (scales from center) ── */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius,
          backgroundColor: focused ? activeBg : hoverBg,
          transform: showBg ? "scale(1)" : "scale(0.5, 0)",
          opacity: showBg ? 1 : 0,
          transition: showBg
            ? "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.0), opacity 0.18s ease"
            : "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* prefix */}
      {prefix_icon && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Icon
            src={prefix_icon}
            style={{ width: iconSize, height: iconSize }}
          />
        </span>
      )}
      {prefix_label && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            color: placeholderColor,
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          {prefix_label}
        </span>
      )}

      {/* input */}
      <input
        ref={input_ref || default_input_ref}
        type={type}
        disabled={disabled}
        maxLength={max_length}
        value={currentValue}
        placeholder={placeholder || label || ""}
        onChange={(e) => {
          if (isControlled) set_value(e.target.value, e);
          else setDefaultValue(e.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          on_focus();
        }}
        onBlur={() => {
          setFocused(false);
          on_blur();
        }}
        onKeyDown={on_key_down}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          fontFamily,
          fontSize,
          color: baseColor,
          caretColor: baseColor,
          background: "transparent",
          border: "none",
          outline: "none",
          padding: 0,
          minWidth: 0,
        }}
      />

      {/* postfix */}
      {postfix_label && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            color: placeholderColor,
            userSelect: "none",
            whiteSpace: "nowrap",
          }}
        >
          {postfix_label}
        </span>
      )}
      {postfix_icon && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Icon
            src={postfix_icon}
            style={{ width: iconSize, height: iconSize }}
          />
        </span>
      )}
      {postfix_component && (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          {postfix_component}
        </div>
      )}
    </div>
  );
};

export {
  Input,
  Input as default,
  SinkingInput,
  Password,
  InputWithDelete,
  ValidationCodeInput,
  FloatingInput,
};
