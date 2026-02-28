import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

const WelcomingStep = ({ onNext }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const headingColor = isDark ? "#ffffff" : "#222222";
  const subColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const bulletColor = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      }}
    >
      {/* Heading */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          fontFamily: "NunitoSans, sans-serif",
          color: headingColor,
          lineHeight: 1.25,
          marginBottom: 8,
        }}
      >
        Welcome to PuPu
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 13,
          fontFamily: "NunitoSans, sans-serif",
          color: subColor,
          lineHeight: 1.6,
          maxWidth: 340,
          marginBottom: 32,
        }}
      >
        Let's get you set up in a few steps — choose your AI providers, add API
        keys, and pick a workspace.
      </div>

      {/* Feature bullets */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginBottom: 36,
        }}
      >
        {[
          "OpenAI, Anthropic, and local Ollama models",
          "API keys stored locally on your device",
          "Persistent workspace for chats and files",
        ].map((text) => (
          <div
            key={text}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              fontSize: 12,
              fontFamily: "NunitoSans, sans-serif",
              color: subColor,
            }}
          >
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: bulletColor,
                flexShrink: 0,
              }}
            />
            {text}
          </div>
        ))}
      </div>

      {/* CTA */}
      <Button
        onClick={onNext}
        label={"Get Started →"}
        style={{
            fontSize: 13,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.82")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      />
    </div>
  );
};

export default WelcomingStep;
