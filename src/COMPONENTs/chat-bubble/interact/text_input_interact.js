import { useCallback, useEffect, useRef, useState } from "react";

/**
 * TextInputInteract – renders a mini-UI text field with line numbers and a
 * submit button.
 *
 * config shape:
 *   placeholder – string (default "")
 *   max_length  – number (0 = unlimited)
 *   multiline   – boolean (false = single line, true = textarea)
 *
 * onSubmit is called with { text: string }
 */

const FONT = "Menlo, Monaco, Consolas, monospace";
const FONT_SIZE = 11.5;
const LINE_HEIGHT = 1.5;
const LINE_HEIGHT_PX = Math.round(FONT_SIZE * LINE_HEIGHT);
const PAD_Y = 6;
const PAD_X = 8;

const SUBMIT_BASE = {
  border: "none",
  borderRadius: 6,
  padding: "4px 12px",
  cursor: "pointer",
  fontSize: 11.5,
  lineHeight: 1.4,
  fontFamily: FONT,
};

const TextInputInteract = ({ config, onSubmit, uiState, isDark, disabled }) => {
  const placeholder =
    typeof config?.placeholder === "string" ? config.placeholder : "";
  const maxLength =
    typeof config?.max_length === "number" && config.max_length > 0
      ? config.max_length
      : 0;
  const multiline = config?.multiline === true;
  const submittedResponse = uiState?.userResponse;
  const [text, setText] = useState(() =>
    typeof submittedResponse?.text === "string" ? submittedResponse.text : "",
  );
  const taRef = useRef(null);
  const [lineCount, setLineCount] = useState(1);

  const recount = useCallback(() => {
    const lines = (text || "").split("\n").length;
    setLineCount(Math.max(1, lines));
  }, [text]);

  useEffect(() => {
    recount();
  }, [recount]);

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

  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const bgColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  const gutterBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const lineNumColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
  const gutterWidth = 28;

  const isEmpty = !text.trim();
  const visibleRows = multiline ? Math.max(3, Math.min(lineCount, 10)) : 1;
  const fieldHeight = visibleRows * LINE_HEIGHT_PX + PAD_Y * 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxWidth: 400,
      }}
    >
      {/* ── mini textfield with gutter ── */}
      <div
        style={{
          position: "relative",
          display: "flex",
          border: `1px solid ${borderColor}`,
          borderRadius: 6,
          overflow: "hidden",
          background: bgColor,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* line-number gutter */}
        {multiline && (
          <div
            style={{
              width: gutterWidth,
              flexShrink: 0,
              background: gutterBg,
              paddingTop: PAD_Y,
              paddingBottom: PAD_Y,
              borderRight: `1px solid ${borderColor}`,
              userSelect: "none",
              WebkitUserSelect: "none",
              overflow: "hidden",
            }}
          >
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i}
                style={{
                  height: LINE_HEIGHT_PX,
                  lineHeight: `${LINE_HEIGHT_PX}px`,
                  fontSize: 10,
                  fontFamily: FONT,
                  color: lineNumColor,
                  textAlign: "right",
                  paddingRight: 6,
                }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        )}

        {/* textarea / input */}
        {multiline ? (
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              const val = e.target.value;
              setText(maxLength ? val.slice(0, maxLength) : val);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={visibleRows}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: textColor,
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              lineHeight: LINE_HEIGHT,
              padding: `${PAD_Y}px ${PAD_X}px`,
              boxSizing: "border-box",
              height: fieldHeight,
              overflow: "auto",
            }}
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
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              color: textColor,
              fontFamily: FONT,
              fontSize: FONT_SIZE,
              lineHeight: LINE_HEIGHT,
              padding: `${PAD_Y}px ${PAD_X}px`,
              boxSizing: "border-box",
            }}
          />
        )}
      </div>

      {/* ── footer row: char count (left) + submit (right) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 9.5,
            fontFamily: FONT,
            color: lineNumColor,
            userSelect: "none",
          }}
        >
          {multiline
            ? `${lineCount} line${lineCount !== 1 ? "s" : ""}${maxLength ? ` · ${text.length}/${maxLength}` : ""}`
            : maxLength
              ? `${text.length}/${maxLength}`
              : ""}
        </span>

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
            }}
          >
            Submit
          </button>
        )}
      </div>
    </div>
  );
};

export default TextInputInteract;
