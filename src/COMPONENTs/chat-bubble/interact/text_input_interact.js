import { useState } from "react";

/**
 * TextInputInteract – renders a text input field with a submit button.
 *
 * config shape:
 *   placeholder – string (default "")
 *   max_length  – number (0 = unlimited)
 *   multiline   – boolean (false = single line, true = textarea)
 *
 * onSubmit is called with { text: string }
 */

const INPUT_BASE = {
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 11.5,
  lineHeight: 1.5,
  fontFamily: "Menlo, Monaco, Consolas, monospace",
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
  resize: "vertical",
};

const SUBMIT_BASE = {
  border: "none",
  borderRadius: 6,
  padding: "4px 12px",
  cursor: "pointer",
  fontSize: 11.5,
  lineHeight: 1.4,
  fontFamily: "Menlo, Monaco, Consolas, monospace",
};

const TextInputInteract = ({ config, onSubmit, isDark, disabled }) => {
  const placeholder =
    typeof config?.placeholder === "string" ? config.placeholder : "";
  const maxLength =
    typeof config?.max_length === "number" && config.max_length > 0
      ? config.max_length
      : 0;
  const multiline = config?.multiline === true;
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (disabled || !text.trim()) return;
    onSubmit({ text: text.trim() });
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !multiline && !disabled && text.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const borderColor = isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)";
  const bgColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const placeholderOpacity = 0.35;

  const inputStyle = {
    ...INPUT_BASE,
    color: textColor,
    background: bgColor,
    border: `1px solid ${borderColor}`,
    opacity: disabled ? 0.5 : 1,
    ...(multiline ? { minHeight: 56 } : {}),
  };

  const isEmpty = !text.trim();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxWidth: 360,
      }}
    >
      {multiline ? (
        <textarea
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            setText(maxLength ? val.slice(0, maxLength) : val);
          }}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            ...inputStyle,
            /* placeholder color via CSS-in-JS is impractical, rely on opacity */
          }}
          rows={3}
        />
      ) : (
        <input
          type="text"
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            setText(maxLength ? val.slice(0, maxLength) : val);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyle}
        />
      )}

      {maxLength > 0 && (
        <span
          style={{
            fontSize: 9.5,
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            color: textColor,
            opacity: placeholderOpacity,
            alignSelf: "flex-end",
          }}
        >
          {text.length}/{maxLength}
        </span>
      )}

      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={isEmpty}
          style={{
            ...SUBMIT_BASE,
            color: isEmpty
              ? isDark
                ? "rgba(255,255,255,0.3)"
                : "rgba(0,0,0,0.3)"
              : isDark
                ? "rgba(209,250,229,0.95)"
                : "#065f46",
            backgroundColor: isEmpty
              ? isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)"
              : isDark
                ? "rgba(16,185,129,0.22)"
                : "rgba(16,185,129,0.16)",
            cursor: isEmpty ? "default" : "pointer",
            alignSelf: "flex-start",
          }}
        >
          Submit
        </button>
      )}
    </div>
  );
};

export default TextInputInteract;
