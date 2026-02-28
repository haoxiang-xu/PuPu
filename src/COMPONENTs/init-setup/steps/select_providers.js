import { useContext, useCallback, useRef } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Card from "../../../BUILTIN_COMPONENTs/card/card";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

/* ── Provider definitions ─────────────────────────────────────────────────── */
const PROVIDERS = [
  {
    key: "openai",
    name: "OpenAI",
    tag: "API key required",
    description: "GPT-4o, o1, o3-mini and the full OpenAI model family.",
    accent: "#10a37f",
    icon: "open_ai",
  },
  {
    key: "anthropic",
    name: "Anthropic",
    tag: "API key required",
    description: "Claude Sonnet, Haiku, Opus — fast and thoughtful models.",
    accent: "#c96442",
    icon: "Anthropic",
  },
  {
    key: "ollama",
    name: "Ollama",
    tag: "Runs locally",
    description: "Open-source models on your own machine. No key needed.",
    accent: "#6b7cff",
    icon: "ollama",
  },
];

const SelectProvidersStep = ({
  selectedProviders,
  setSelectedProviders,
  onNext,
}) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const nameColor = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.85)";
  const descColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const tagBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const tagColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  const toggle = useCallback(
    (key) =>
      setSelectedProviders((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      ),
    [setSelectedProviders],
  );

  const scrollRef = useRef(null);
  const scroll = useCallback((dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 190, behavior: "smooth" });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Scrollable row of 3D cards with nav arrows */}
      <div style={{ position: "relative", marginBottom: 22 }}>
        {/* Left arrow */}
        <div
          style={{
            position: "absolute",
            left: -6,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
          }}
        >
          <Button
            prefix_icon="arrow_left"
            onClick={() => scroll(-1)}
            style={{ borderRadius: 16 }}
          />
        </div>

        {/* Right arrow */}
        <div
          style={{
            position: "absolute",
            right: -6,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 10,
          }}
        >
          <Button
            prefix_icon="arrow_right"
            onClick={() => scroll(1)}
            style={{ borderRadius: 16 }}
          />
        </div>

        <div
          ref={scrollRef}
          className="scrollable"
          style={{
            overflowX: "auto",
            overflowY: "visible",
            scrollSnapType: "x mandatory",
            scrollPadding: "0 20px 0 20px",
            /* negative margin + padding trick: keeps scroll area flush
               but gives cards room so shadows/scale aren't clipped */
            margin: "-12px -20px 0 -20px",
            padding: "12px 20px 16px 20px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 10,
              width: "fit-content",
            }}
          >
            {PROVIDERS.map(({ key, name, tag, description, accent, icon }) => {
              const selected = selectedProviders.includes(key);
              return (
                <div
                  key={key}
                  onClick={() => toggle(key)}
                  style={{
                    flex: "0 0 180px",
                    height: 220,
                    scrollSnapAlign: "start",
                    cursor: "pointer",
                  }}
                >
                  <Card
                    width={180}
                    height={220}
                    max_tilt={12}
                    perspective={600}
                    scale={1.02}
                    speed={350}
                    border_radius={10}
                    style={{
                      backgroundColor: selected
                        ? `${accent}12`
                        : isDark
                          ? "rgba(30,30,30,0.95)"
                          : "rgba(255,255,255,0.95)",
                      border: `1.5px solid ${selected ? accent : isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)"}`,
                      boxShadow: selected
                        ? `0 0 0 3px ${accent}18, 0 4px 24px rgba(0,0,0,${isDark ? 0.5 : 0.08})`
                        : undefined,
                      cursor: "pointer",
                      transition:
                        "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                    }}
                    body_style={{ padding: "14px 14px 13px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        height: "100%",
                        position: "relative",
                        transformStyle: "preserve-3d",
                      }}
                    >
                      {/* Selected check */}
                      {selected && (
                        <div
                          style={{
                            position: "absolute",
                            top: 0,
                            right: 0,
                            width: 16,
                            height: 16,
                            borderRadius: "50%",
                            background: accent,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 8 8"
                            fill="none"
                          >
                            <path
                              d="M1.5 4L3.2 6L6.5 2"
                              stroke="#fff"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      )}

                      {/* Icon from mini UI */}
                      <Card.Layer depth={32}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: selected
                              ? `${accent}20`
                              : isDark
                                ? "rgba(255,255,255,0.05)"
                                : "rgba(0,0,0,0.04)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: 11,
                            transition: "background 0.15s",
                            flexShrink: 0,
                          }}
                        >
                          <div style={{ width: 18, height: 18 }}>
                            <Icon
                              src={icon}
                              color={
                                selected
                                  ? accent
                                  : isDark
                                    ? "rgba(255,255,255,0.5)"
                                    : "rgba(0,0,0,0.4)"
                              }
                            />
                          </div>
                        </div>
                      </Card.Layer>

                      {/* Name */}
                      <Card.Layer depth={12}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "NunitoSans, sans-serif",
                            color: selected ? accent : nameColor,
                            marginBottom: 5,
                            transition: "color 0.15s",
                            lineHeight: 1.2,
                          }}
                        >
                          {name}
                        </div>
                      </Card.Layer>

                      {/* Description */}
                      <div
                        style={{
                          fontSize: 11,
                          fontFamily: "NunitoSans, sans-serif",
                          color: descColor,
                          lineHeight: 1.5,
                          marginBottom: 10,
                          flex: 1,
                        }}
                      >
                        {description}
                      </div>

                      {/* Tag pill */}
                      <div
                        style={{
                          fontSize: 10,
                          fontFamily: "NunitoSans, sans-serif",
                          fontWeight: 600,
                          color: selected ? accent : tagColor,
                          background: selected ? `${accent}15` : tagBg,
                          padding: "2px 6px",
                          letterSpacing: "0.3px",
                          transition: "color 0.15s, background 0.15s",
                        }}
                      >
                        {tag}
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Continue button */}
      <Button
        label="Continue"
        postfix_icon="arrow_right"
        onClick={onNext}
        disabled={selectedProviders.length === 0}
        style={{
          root: {
            alignSelf: "flex-start",
            fontSize: 13,
            fontFamily: "NunitoSans, sans-serif",
            fontWeight: 600,
          },
        }}
      />
    </div>
  );
};

export default SelectProvidersStep;
