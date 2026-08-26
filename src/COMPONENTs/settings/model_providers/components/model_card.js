import { useContext, useState } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { TAG_PALETTE } from "../constants";
import {
  buildModelRef,
  isCloudOnlyModel,
  isModelRefInstalled,
} from "../model_ref";
import { ConfigContext } from "../../../../CONTAINERs/config/context";

/* Normalise Ollama pull error for compact UI display.
 * Removes redundant "pull model manifest: NNN:" prefix, collapses newlines/tabs
 * into single spaces, trims the result. */
const formatPullError = (raw) => {
  if (!raw) return "";
  return String(raw)
    .replace(/^pull model manifest:\s*\d*:?\s*/i, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const ModelCard = ({
  model,
  isDark,
  installedNames,
  pullingMap,
  onPull,
  onCancel,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const sizes = Array.isArray(model.sizes) ? model.sizes : [];
  const tags = Array.isArray(model.tags) ? model.tags : [];
  const [selectedSize, setSelectedSize] = useState(sizes[0] || "");

  /* Same derivation the pull hook uses — see ../model_ref. */
  const pullKey = buildModelRef(model.name, selectedSize);
  const pullState = pullingMap[pullKey] || null;
  const isInstalled = isModelRefInstalled(
    installedNames,
    model.name,
    selectedSize,
  );
  const isCloudOnly = isCloudOnlyModel(model);

  const borderColor = "var(--pupu-border)";
  const cardBg = "var(--pupu-overlay-ghost)";
  const textColor = "var(--pupu-text-strong)";
  const mutedColor = "var(--pupu-text-faint)";
  const sizeBg = "var(--pupu-overlay-hover)";
  const sizeActiveBg = "var(--pupu-overlay-active)";
  const sizeActiveBorder = "var(--pupu-border-strong)";
  const barTrack = "var(--pupu-overlay-hover)";
  const barFill = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";

  /* BUILTIN Button default form (no transparent bare-text links). The default
   * hover palette is tuned for light mode, so dark mode gets its own. */
  const actionButtonStyle = {
    height: 24,
    fontSize: 11,
    padding: "0 12px",
    borderRadius: 999,
    fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
    color: textColor,
    hoverBackgroundColor: "var(--pupu-overlay-active)",
    activeBackgroundColor: "var(--pupu-overlay-active)",
  };

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
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            color: textColor,
            letterSpacing: "0.1px",
          }}
        >
          {model.name}
        </span>
        {tags.map((tag) => {
          const p = TAG_PALETTE[tag];
          if (!p) return null;
          return (
            <span
              key={tag}
              style={{
                fontSize: 10,
                fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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

      {/* The action row always renders. Gating it on `sizes.length > 0` used to
        * hide the pull button entirely for size-less entries (nomic-embed-text
        * among them), which made them uninstallable from this UI. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          marginTop: 2,
        }}
      >
        {sizes.map((sz) => (
          <button
            key={sz}
            onClick={() => setSelectedSize(sz)}
            style={{
              fontSize: 11,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
                fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                color: "#4ade80",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              ✓ {t("model_providers.installed")}
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
                    fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                    color: "rgba(255,100,100,0.85)",
                    maxWidth: 200,
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    whiteSpace: "normal",
                    textAlign: "right",
                  }}
                >
                  {formatPullError(pullState.error)}
                </div>
              )}
            </div>
          ) : isCloudOnly ? (
            /* Cloud-only entry: nothing to pull onto this machine. Shown as a
             * disabled action instead of a blank slot or a button that would
             * fail. */
            <Button
              label={t("model_providers.cloud_only")}
              title={t("model_providers.cloud_only_hint")}
              disabled
              style={actionButtonStyle}
            />
          ) : (
            <Button
              label={t("model_providers.pull")}
              onClick={() => onPull(model.name, selectedSize)}
              style={actionButtonStyle}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ModelCard;
