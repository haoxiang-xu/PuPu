import { useContext } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import presetsData from "../../../../SERVICEs/custom_provider_presets.json";

const PROTOCOL_LABEL = {
  anthropic: "Anthropic",
  "openai-responses": "OpenAI Responses",
  ollama: "Ollama",
};

/**
 * Normalize the presets file into an array of export envelopes. The file today
 * is a single envelope (SAP Hyperspace, §2.4); accept an array too so a future
 * preset library can grow without touching this component.
 */
export const readPresetEnvelopes = () => {
  if (Array.isArray(presetsData)) {
    return presetsData.filter((e) => e && e.provider);
  }
  if (presetsData && presetsData.provider) {
    return [presetsData];
  }
  return [];
};

/**
 * PresetPicker (design §8.4). Shows built-in preset cards; selecting one feeds
 * its provider through the SAME import pipeline (source:"preset") by handing the
 * envelope up to the parent, which opens the import modal seeded with it.
 */
const PresetPicker = ({ open, onClose, onSelect }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const textColor = isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.82)";
  const mutedColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.45)";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)";
  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
  const accentColor = isDark ? "#7c8cf8" : "#2563eb";
  const badgeBg = isDark ? "rgba(124,140,248,0.16)" : "rgba(37,99,235,0.10)";
  const cardHoverBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)";

  const envelopes = readPresetEnvelopes();

  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 520,
        maxWidth: "92vw",
        maxHeight: "82vh",
        padding: 0,
        backgroundColor: "var(--pupu-background)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 22px 12px",
          flexShrink: 0,
        }}
      >
        <span
          style={{ fontSize: 15, fontFamily, fontWeight: 600, color: textColor }}
        >
          {t("model_providers.custom.preset_title")}
        </span>
        <Button
          ariaLabel={t("common.close")}
          prefix_icon="close"
          onClick={onClose}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 6,
            content: { icon: { width: 16, height: 16 } },
          }}
        />
      </div>

      <div
        className="scrollable"
        style={{ flex: 1, overflowY: "auto", padding: "4px 22px 16px" }}
      >
        {envelopes.length === 0 ? (
          <div
            style={{
              padding: "24px 0",
              fontSize: 12.5,
              fontFamily,
              color: mutedColor,
            }}
          >
            {t("model_providers.custom.preset_empty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {envelopes.map((envelope) => {
              const p = envelope.provider || {};
              const keyHint = p.auth?.key_hint;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelect?.(envelope)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = cardHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  style={{
                    textAlign: "left",
                    border: `1px solid ${borderColor}`,
                    borderRadius: 10,
                    padding: 14,
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    transition: "background 0.12s",
                    outline: "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 5,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontFamily,
                        fontWeight: 600,
                        color: textColor,
                      }}
                    >
                      {p.display_name || p.id}
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontFamily,
                        fontWeight: 600,
                        letterSpacing: "0.4px",
                        textTransform: "uppercase",
                        padding: "1px 7px",
                        borderRadius: 999,
                        backgroundColor: badgeBg,
                        color: accentColor,
                      }}
                    >
                      {t("model_providers.custom.preset_official")}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        fontFamily,
                        color: mutedColor,
                      }}
                    >
                      {PROTOCOL_LABEL[p.protocol] || p.protocol}
                    </span>
                  </div>
                  {p.description && (
                    <div
                      style={{
                        fontSize: 12,
                        fontFamily,
                        color: mutedColor,
                        lineHeight: 1.5,
                        marginBottom: keyHint ? 6 : 0,
                      }}
                    >
                      {p.description}
                    </div>
                  )}
                  {keyHint && (
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily,
                        color: mutedColor,
                        lineHeight: 1.5,
                        opacity: 0.85,
                        borderTop: `1px solid ${dividerColor}`,
                        paddingTop: 6,
                      }}
                    >
                      {keyHint}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PresetPicker;
