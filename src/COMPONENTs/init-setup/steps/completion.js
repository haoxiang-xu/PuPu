import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { readModelProviders } from "../../settings/model_providers/storage";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const PROVIDER_LABEL = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama",
};

const PROVIDER_ICON = {
  openai: "open_ai",
  anthropic: "Anthropic",
  ollama: "ollama",
};

const CompletionStep = ({ selectedProviders, onFinish }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const headingColor = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.88)";
  const subColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";
  const cardBg = "transparent";
  const cardBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  const providers = readModelProviders();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Success icon */}
      <Icon
        src="check"
        color="rgba(10,186,181,1)"
        style={{
          width: 32,
          height: 32,
          marginBottom: 16,
        }}
      />

      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          fontFamily: "Jost",
          color: headingColor,
          marginBottom: 6,
          letterSpacing: "-0.3px",
        }}
      >
        You're all set!
      </div>
      <div
        style={{
          fontSize: 14,
          fontFamily: "Jost",
          color: subColor,
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        PuPu is ready. Here's what was configured.
      </div>

      {/* Provider summary cards */}
      {selectedProviders.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 24,
          }}
        >
          {selectedProviders.map((pk) => {
            const hasKey = pk === "ollama" || !!providers[`${pk}_api_key`];
            return (
              <div
                key={pk}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 8,
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
              >
                <Icon
                  src={PROVIDER_ICON[pk] || "bot"}
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: "Jost",
                    color: headingColor,
                    flex: 1,
                  }}
                >
                  {PROVIDER_LABEL[pk] || pk}
                </span>
                <Icon
                  src={hasKey ? "check" : "circle"}
                  color={subColor}
                  style={{ width: 14, height: 14, flexShrink: 0 }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontFamily: "Jost",
                    color: subColor,
                  }}
                >
                  {hasKey
                    ? pk === "ollama"
                      ? "Ready"
                      : "API key saved"
                    : "No key"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* CTA */}
      <Button
        label="Start using PuPu"
        postfix_icon="arrow_right"
        onClick={onFinish}
        style={{
          root: {
            fontSize: 13,
            alignSelf: "flex-end",
          },
        }}
      />
    </div>
  );
};

export default CompletionStep;
