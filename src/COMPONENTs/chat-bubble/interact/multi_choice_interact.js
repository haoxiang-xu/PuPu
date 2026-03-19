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

const CHOICE_BASE = {
  display: "flex",
  alignItems: "flex-start",
  gap: 7,
  padding: "4px 8px",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "Menlo, Monaco, Consolas, monospace",
  fontSize: 11.5,
  lineHeight: 1.5,
  border: "1px solid transparent",
  transition: "background 0.12s, border-color 0.12s",
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

const MultiChoiceInteract = ({ config, onSubmit, isDark, disabled }) => {
  const choices = Array.isArray(config?.choices) ? config.choices : [];
  const multiSelect = config?.multi_select === true;
  const [selected, setSelected] = useState([]);

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

  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const activeBorder = isDark
    ? "rgba(99,179,237,0.5)"
    : "rgba(59,130,246,0.45)";
  const textColor = isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.72)";
  const descColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.42)";
  const indicatorBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const indicatorActive = isDark
    ? "rgba(99,179,237,0.8)"
    : "rgba(59,130,246,0.7)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
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
              background: isSelected ? hoverBg : "transparent",
              borderColor: isSelected ? activeBorder : "transparent",
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            {/* indicator */}
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: multiSelect ? 3 : "50%",
                border: `1.5px solid ${isSelected ? indicatorActive : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)"}`,
                background: isSelected ? indicatorActive : indicatorBg,
                flexShrink: 0,
                marginTop: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.12s",
              }}
            >
              {isSelected && (
                <span
                  style={{
                    width: multiSelect ? 8 : 6,
                    height: multiSelect ? 8 : 6,
                    borderRadius: multiSelect ? 1 : "50%",
                    background: "#fff",
                  }}
                />
              )}
            </span>

            {/* label + description */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ color: textColor }}>{label}</span>
              {description && (
                <span
                  style={{
                    fontSize: 10,
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
            alignSelf: "flex-start",
          }}
        >
          Submit
        </button>
      )}
    </div>
  );
};

export default MultiChoiceInteract;
