import { useCallback, useEffect, useState } from "react";

import { TextField } from "../../../BUILTIN_COMPONENTs/input/textfield";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

/**
 * TextInputInteract – renders a text field with an optional submit button.
 *
 * config shape:
 *   placeholder – string (default "")
 *   max_length  – number (0 = unlimited)
 *   multiline   – boolean (false = single line, true = textarea)
 *
 * onSubmit is called with { text: string }
 */

const FONT = "Menlo, Monaco, Consolas, monospace";

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
  const [lineCount, setLineCount] = useState(1);

  useEffect(() => {
    if (typeof submittedResponse?.text === "string") {
      setText(submittedResponse.text);
    }
  }, [submittedResponse]);

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

  const isEmpty = !text.trim();

  const infoText = multiline
    ? `${lineCount} line${lineCount !== 1 ? "s" : ""}${maxLength ? ` · ${text.length}/${maxLength}` : ""}`
    : maxLength
      ? `${text.length}/${maxLength}`
      : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxWidth: 400,
      }}
    >
      <TextField
        value={text}
        set_value={(v) => setText(maxLength ? v.slice(0, maxLength) : v)}
        min_rows={multiline ? 3 : 1}
        max_display_rows={multiline ? 10 : 1}
        placeholder={placeholder}
        disabled={disabled}
        on_key_down={handleKeyDown}
        style={{
          fontSize: 11.5,
          fontFamily: FONT,
          lineHeight: 1.5,
          borderRadius: 6,
          padding: 6,
          width: "100%",
        }}
        functional_section={
          !disabled && !isEmpty ? (
            <Button
              label="Submit"
              postfix_icon="arrow_right"
              onClick={handleSubmit}
              style={{
                fontSize: 11.5,
                fontFamily: FONT,
                borderRadius: 6,
                paddingVertical: 3,
                paddingHorizontal: 10,
              }}
            />
          ) : null
        }
      />

      {infoText && (
        <span
          style={{
            fontSize: 9.5,
            fontFamily: FONT,
            opacity: 0.3,
            userSelect: "none",
            paddingLeft: 2,
          }}
        >
          {infoText}
        </span>
      )}
    </div>
  );
};

export default TextInputInteract;
