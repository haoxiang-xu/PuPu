import { useEffect, useState } from "react";

/**
 * MultiSelectInteract – renders a list of checkbox-style options.
 *
 * config shape (array of options passed directly):
 *   [{ label, value, description? }]
 *
 * onSubmit is called with { values: string[] }
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

const Checkbox = ({ checked, isDark }) => (
  <div
    style={{
      width: 14,
      height: 14,
      borderRadius: 4,
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
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path
          d="M1.5 4L3.5 6L6.5 2"
          stroke="white"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
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
      minSelected: 1,
      maxSelected: 0,
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
    minSelected:
      typeof config?.min_selected === "number" ? config.min_selected : 1,
    maxSelected:
      typeof config?.max_selected === "number" ? config.max_selected : 0,
  };
};

const MultiSelectInteract = ({
  config,
  onSubmit,
  uiState,
  isDark,
  disabled,
}) => {
  const {
    title,
    question,
    options,
    allowOther,
    otherLabel,
    otherPlaceholder,
    minSelected,
    maxSelected,
  } = normalizeSelectorConfig(config);
  const submittedResponse = uiState?.userResponse;
  const [selected, setSelected] = useState(() =>
    Array.isArray(submittedResponse?.values) ? submittedResponse.values : [],
  );
  const [otherText, setOtherText] = useState(() =>
    typeof submittedResponse?.other_text === "string"
      ? submittedResponse.other_text
      : "",
  );

  useEffect(() => {
    if (Array.isArray(submittedResponse?.values)) {
      setSelected(submittedResponse.values);
      setOtherText(
        typeof submittedResponse?.other_text === "string"
          ? submittedResponse.other_text
          : "",
      );
    }
  }, [submittedResponse]);

  if (options.length === 0 && !allowOther) return null;

  const toggle = (value) => {
    if (disabled) return;
    const isRemovingOther =
      value === OTHER_VALUE && selected.includes(OTHER_VALUE);
    if (isRemovingOther) {
      setOtherText("");
    }
    setSelected((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      }

      if (maxSelected > 0 && prev.length >= maxSelected) {
        return prev;
      }

      return [...prev, value];
    });
  };

  const handleSubmit = () => {
    const needsOtherText = selected.includes(OTHER_VALUE);
    if (disabled || selected.length < Math.max(0, minSelected)) return;
    if (needsOtherText && !otherText.trim()) return;
    onSubmit({
      values: selected,
      ...(needsOtherText ? { other_text: otherText.trim() } : {}),
    });
  };

  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const descColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.38)";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const inputBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";
  const promptColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.52)";
  const needsOtherText = selected.includes(OTHER_VALUE);
  const submitDisabled =
    selected.length < Math.max(0, minSelected) ||
    (needsOtherText && !otherText.trim());
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
        const isSelected = selected.includes(value);

        return (
          <div
            key={value}
            onClick={() => toggle(value)}
            style={{
              ...OPTION_BASE,
              fontFamily,
              background: isSelected ? hoverBg : "transparent",
              opacity: disabled ? 0.55 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <Checkbox checked={isSelected} isDark={isDark} />
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
          onClick={() => toggle(OTHER_VALUE)}
          style={{
            ...OPTION_BASE,
            fontFamily,
            background: needsOtherText ? hoverBg : "transparent",
            opacity: disabled ? 0.55 : 1,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <Checkbox checked={needsOtherText} isDark={isDark} />
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
            {needsOtherText && (
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
          disabled={submitDisabled}
          style={{
            ...SUBMIT_BASE,
            color: submitDisabled
              ? isDark
                ? "rgba(255,255,255,0.3)"
                : "rgba(0,0,0,0.3)"
              : isDark
                ? "rgba(209,250,229,0.95)"
                : "#065f46",
            backgroundColor: submitDisabled
              ? isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)"
              : isDark
                ? "rgba(16,185,129,0.22)"
                : "rgba(16,185,129,0.16)",
            cursor: submitDisabled ? "default" : "pointer",
            alignSelf: "flex-end",
          }}
        >
          Submit
        </button>
      )}
    </div>
  );
};

export default MultiSelectInteract;
