import { useState } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { TAG_PALETTE } from "../constants";

const ModelCard = ({
  model,
  isDark,
  installedNames,
  pullingMap,
  onPull,
  onCancel,
}) => {
  const [selectedSize, setSelectedSize] = useState(model.sizes[0] || "");

  const pullKey = `${model.name}:${selectedSize}`;
  const pullState = pullingMap[pullKey] || null;
  const isInstalled =
    installedNames.has(pullKey) || installedNames.has(model.name);

  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const sizeBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const sizeActiveBg = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  const sizeActiveBorder = isDark
    ? "rgba(255,255,255,0.35)"
    : "rgba(0,0,0,0.35)";
  const barTrack = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const barFill = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor: cardBg,
        padding: "11px 14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "Jost",
            color: textColor,
            letterSpacing: "0.1px",
          }}
        >
          {model.name}
        </span>
        {model.tags.map((tag) => {
          const p = TAG_PALETTE[tag];
          if (!p) return null;
          return (
            <span
              key={tag}
              style={{
                fontSize: 10,
                fontFamily: "Jost",
                fontWeight: 500,
                letterSpacing: "0.4px",
                textTransform: "lowercase",
                padding: "1px 6px",
                borderRadius: 999,
                backgroundColor: isDark ? p.darkBg : p.lightBg,
                color: p.color,
                lineHeight: 1.8,
                flexShrink: 0,
              }}
            >
              {tag}
            </span>
          );
        })}
        {model.pulls && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "Jost",
              color: mutedColor,
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            ↓ {model.pulls}
          </span>
        )}
      </div>

      {model.description && (
        <div
          style={{
            fontSize: 12,
            fontFamily: "Jost",
            color: mutedColor,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {model.description}
        </div>
      )}

      {(model.sizes.length > 0 || isInstalled || pullState) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 2,
          }}
        >
          {model.sizes.map((sz) => (
            <button
              key={sz}
              onClick={() => setSelectedSize(sz)}
              style={{
                fontSize: 11,
                fontFamily: "Jost",
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 999,
                border: `1px solid ${
                  selectedSize === sz ? sizeActiveBorder : borderColor
                }`,
                backgroundColor: selectedSize === sz ? sizeActiveBg : sizeBg,
                color: selectedSize === sz ? textColor : mutedColor,
                cursor: "pointer",
                transition: "all 0.12s",
                outline: "none",
                lineHeight: 1.8,
              }}
            >
              {sz}
            </button>
          ))}

          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {isInstalled ? (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "Jost",
                  color: "#4ade80",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                ✓ Installed
              </span>
            ) : pullState ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 3,
                  minWidth: 120,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "Jost",
                      color: mutedColor,
                    }}
                  >
                    {pullState.status}
                    {pullState.percent !== null ? ` ${pullState.percent}%` : ""}
                  </span>
                  <button
                    onClick={() => onCancel(pullKey)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: mutedColor,
                      fontSize: 13,
                      padding: 0,
                      lineHeight: 1,
                    }}
                    title="Cancel"
                  >
                    ×
                  </button>
                </div>
                <div
                  style={{
                    width: 120,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: barTrack,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      backgroundColor: barFill,
                      width: `${pullState.percent ?? 0}%`,
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
                {pullState.error && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "Jost",
                      color: "rgba(255,100,100,0.85)",
                    }}
                  >
                    {pullState.error}
                  </span>
                )}
              </div>
            ) : selectedSize || model.sizes.length === 0 ? (
              <Button
                label="Pull"
                onClick={() => onPull(model.name, selectedSize || model.name)}
                style={{
                  height: 24,
                  fontSize: 11,
                  padding: "0 12px",
                  borderRadius: 999,
                  fontFamily: "Jost",
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelCard;
