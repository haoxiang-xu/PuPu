import { useState } from "react";

/**
 * SingleSelectInteract – renders a list of radio-style options.
 *
 * config shape (array of options passed directly):
 *   [{ label, value, description? }]
 *
 * onSubmit is called with { value: string }
 */

const OTHER_VALUE = "__other__";
const ACCENT = "rgba(10,186,181,1)";

const OPTION_BASE = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 10px",
  borderRadius: 5,
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1.5,
  transition: "background 0.12s",
};

const SUBMIT_BASE = {
  border: "none",
  borderRadius: 6,
  padding: "4px 12px",
  cursor: "pointer",
  fontSize: 11.5,
  lineHeight: 1.4,
  fontFamily: "Menlo, Monaco, Consolas, monospace",
  marginTop: 4,
};

const Radio = ({ checked, isDark }) => (
  <div
    style={{
      width: 14,
      height: 14,
      borderRadius: "50%",
      border: checked
        ? `2px solid ${ACCENT}`
        : `2px solid ${isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.22)"}`,
      background: checked ? ACCENT : "transparent",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.12s",
      boxSizing: "border-box",
    }}
  >
    {checked && (
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "#fff",
        }}
      />
    )}
  </div>
);

const normalizeSelectorConfig = (config) => {
  if (Array.isArray(config)) {
    return {
      title: "",
      question: "",
      options: config,
      allowOther: false,
      otherLabel: "Other",
      otherPlaceholder: "",
    };
  }

  const options = Array.isArray(config?.options) ? config.options : [];
  return {
    title: typeof config?.title === "string" ? config.title : "",
    question: typeof config?.question === "string" ? config.question : "",
    options,
    allowOther: config?.allow_other === true,
    otherLabel:
      typeof config?.other_label === "string" && config.other_label.trim()
        ? config.other_label.trim()
        : "Other",
    otherPlaceholder:
      typeof config?.other_placeholder === "string"
        ? config.other_placeholder
        : "",
  };
};

const SingleSelectInteract = ({
  config,
  onSubmit,
  uiState,
  isDark,
  disabled,
}) => {
  const { title, question, options, allowOther, otherLabel, otherPlaceholder } =
    normalizeSelectorConfig(config);
  const submittedResponse = uiState?.userResponse;
  const [selected, setSelected] = useState(() =>
    typeof submittedResponse?.value === "string"
      ? submittedResponse.value
      : null,
  );
  const [otherText, setOtherText] = useState(() =>
    typeof submittedResponse?.other_text === "string"
      ? submittedResponse.other_text
      : "",
  );

  if (options.length === 0 && !allowOther) return null;

  const handleSelect = (value) => {
    if (disabled) return;
    const next = selected === value ? null : value;
    if (next !== OTHER_VALUE) {
      setOtherText("");
    }
    setSelected(next);
  };

  const handleSubmit = () => {
    const needsOtherText = selected === OTHER_VALUE;
    if (disabled || selected == null) return;
    if (needsOtherText && !otherText.trim()) return;
    onSubmit({
      value: selected,
      ...(needsOtherText ? { other_text: otherText.trim() } : {}),
    });
  };

  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const descColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.38)";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  const promptColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.52)";
  const isOtherSelected = selected === OTHER_VALUE;
  const fontFamily = "Jost, sans-serif";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {(title || question) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            marginBottom: 4,
          }}
        >
          {title && (
            <span
              style={{
                color: textColor,
                fontSize: 12,
                fontWeight: 600,
                fontFamily,
              }}
            >
              {title}
            </span>
          )}
          {question && (
            <span style={{ color: promptColor, fontSize: 11, fontFamily }}>
              {question}
            </span>
          )}
        </div>
      )}

      {options.map((opt, idx) => {
        const value =
          typeof opt?.value === "string"
            ? opt.value
            : String(opt?.value ?? idx);
        const label = typeof opt?.label === "string" ? opt.label : value;
        const description =
          typeof opt?.description === "string" ? opt.description : "";
        const isSelected = selected === value;

        return (
          <div
            key={value}
            onClick={() => handleSelect(value)}
            style={{
              ...OPTION_BASE,
              fontFamily,
              background: isSelected ? hoverBg : "transparent",
              opacity: disabled ? 0.55 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <Radio checked={isSelected} isDark={isDark} />
            <div
              style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
            >
              <span style={{ color: textColor }}>{label}</span>
              {description && (
                <span
                  style={{
                    fontSize: Math.round(12 * 0.8),
                    color: descColor,
                    lineHeight: 1.4,
                  }}
                >
                  {description}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {allowOther && (
        <div
          onClick={() => handleSelect(OTHER_VALUE)}
          style={{
            ...OPTION_BASE,
            fontFamily,
            background: isOtherSelected ? hoverBg : "transparent",
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <Radio checked={isOtherSelected} isDark={isDark} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              flex: 1,
              minWidth: 0,
            }}
          >
            <span style={{ color: textColor }}>{otherLabel}</span>
            {isOtherSelected && (
              <input
                type="text"
                value={otherText}
                onChange={(event) => setOtherText(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                placeholder={otherPlaceholder}
                disabled={disabled}
                style={{
                  borderRadius: 5,
                  padding: "5px 8px",
                  fontSize: 11,
                  lineHeight: 1.5,
                  fontFamily,
                  width: "100%",
                  boxSizing: "border-box",
                  color: textColor,
                  background: inputBg,
                  border: `1px solid ${borderColor}`,
                  outline: "none",
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* submit button */}
      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={selected == null || (isOtherSelected && !otherText.trim())}
          style={{
            ...SUBMIT_BASE,
            color:
              selected == null || (isOtherSelected && !otherText.trim())
                ? isDark
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(0,0,0,0.3)"
                : isDark
                  ? "rgba(209,250,229,0.95)"
                  : "#065f46",
            backgroundColor:
              selected == null || (isOtherSelected && !otherText.trim())
                ? isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)"
                : isDark
                  ? "rgba(16,185,129,0.22)"
                  : "rgba(16,185,129,0.16)",
            cursor:
              selected == null || (isOtherSelected && !otherText.trim())
                ? "default"
                : "pointer",
            alignSelf: "flex-end",
          }}
        >
          Submit
        </button>
      )}
    </div>
  );
};

export default SingleSelectInteract;
