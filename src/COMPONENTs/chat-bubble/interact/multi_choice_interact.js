import { useState } from "react";

/**
 * MultiChoiceInteract – renders a list of selectable choices.
 *
 * config shape:
 *   choices      – [{ id, label, description? }]
 *   multi_select – boolean (false = radio, true = checkbox)
 *
 * onSubmit is called with { selected: string[] }
 */

const ACCENT = "rgba(10,186,181,1)";

const CHOICE_BASE = {
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

const MultiChoiceInteract = ({
  config,
  onSubmit,
  uiState,
  isDark,
  disabled,
}) => {
  const choices = Array.isArray(config?.choices) ? config.choices : [];
  const multiSelect = config?.multi_select === true;
  const submittedResponse = uiState?.userResponse;
  const [selected, setSelected] = useState(() =>
    Array.isArray(submittedResponse?.selected)
      ? submittedResponse.selected
      : [],
  );

  if (choices.length === 0) return null;

  const toggle = (id) => {
    if (disabled) return;
    setSelected((prev) => {
      if (multiSelect) {
        return prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      }
      return prev.includes(id) ? [] : [id];
    });
  };

  const handleSubmit = () => {
    if (disabled || selected.length === 0) return;
    onSubmit({ selected });
  };

  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const descColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.38)";
  const fontFamily = "Jost, sans-serif";
  const Indicator = multiSelect ? Checkbox : Radio;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {choices.map((choice) => {
        const id =
          typeof choice?.id === "string" ? choice.id : String(choice?.id ?? "");
        const label = typeof choice?.label === "string" ? choice.label : id;
        const description =
          typeof choice?.description === "string" ? choice.description : "";
        const isSelected = selected.includes(id);

        return (
          <div
            key={id}
            onClick={() => toggle(id)}
            style={{
              ...CHOICE_BASE,
              fontFamily,
              background: isSelected ? hoverBg : "transparent",
              opacity: disabled ? 0.55 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <Indicator checked={isSelected} isDark={isDark} />
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

      {/* submit button */}
      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={selected.length === 0}
          style={{
            ...SUBMIT_BASE,
            color:
              selected.length === 0
                ? isDark
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(0,0,0,0.3)"
                : isDark
                  ? "rgba(209,250,229,0.95)"
                  : "#065f46",
            backgroundColor:
              selected.length === 0
                ? isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.04)"
                : isDark
                  ? "rgba(16,185,129,0.22)"
                  : "rgba(16,185,129,0.16)",
            cursor: selected.length === 0 ? "default" : "pointer",
            alignSelf: "flex-end",
          }}
        >
          Submit
        </button>
      )}
    </div>
  );
};

export default MultiChoiceInteract;
