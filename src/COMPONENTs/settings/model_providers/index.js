import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import CellSplitSpinner from "../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import { SettingsSection } from "../appearance";
import APIKeyInput from "./components/api_key_input";
import ModelCard from "./components/model_card";
import ActiveDownloads from "./components/active_downloads";
import { LIBRARY_CATEGORIES } from "./constants";
import { useOllamaLibrary } from "./hooks/use_ollama_library";

const OpenAISection = () => (
  <SettingsSection title="OpenAI" icon="open_ai">
    <APIKeyInput storage_key="openai_api_key" label="API Key" placeholder="sk-..." />
  </SettingsSection>
);

const AnthropicSection = () => (
  <SettingsSection title="Anthropic" icon="Anthropic">
    <APIKeyInput
      storage_key="anthropic_api_key"
      label="API Key"
      placeholder="sk-ant-..."
    />
  </SettingsSection>
);

const OllamaLibraryBrowser = ({ isDark }) => {
  const {
    category,
    setCategory,
    rawQuery,
    setRawQuery,
    models,
    loading,
    error,
    installedNames,
    pullingMap,
    handlePull,
    handleCancel,
    retrySearch,
  } = useOllamaLibrary();

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const pillActiveBg = isDark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.08)";
  const pillHoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const pillActiveTxt = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const pillInactiveTxt = isDark
    ? "rgba(255,255,255,0.45)"
    : "rgba(0,0,0,0.42)";
  const activePillBorder = isDark
    ? "rgba(255,255,255,0.15)"
    : "rgba(0,0,0,0.15)";

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
          padding: "10px 0 6px",
        }}
      >
        {LIBRARY_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            style={{
              fontSize: 11,
              fontFamily: "Jost",
              fontWeight: 500,
              padding: "3px 10px",
              borderRadius: 999,
              border: `1px solid ${
                category === cat.value ? activePillBorder : "transparent"
              }`,
              backgroundColor:
                category === cat.value ? pillActiveBg : "transparent",
              color: category === cat.value ? pillActiveTxt : pillInactiveTxt,
              cursor: "pointer",
              outline: "none",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              if (category !== cat.value)
                e.currentTarget.style.backgroundColor = pillHoverBg;
            }}
            onMouseLeave={(e) => {
              if (category !== cat.value)
                e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div style={{ margin: "4px 0 10px" }}>
        <Input
          value={rawQuery}
          set_value={setRawQuery}
          placeholder="Search models…"
          style={{
            width: "100%",
            height: 32,
            fontSize: 12,
            fontFamily: "Jost",
            borderRadius: 8,
            boxSizing: "border-box",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
          paddingBottom: 4,
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "32px 0",
            }}
          >
            <CellSplitSpinner size={22} />
          </div>
        ) : error ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "28px 0",
            }}
          >
            <span style={{ fontSize: 12, fontFamily: "Jost", color: mutedColor }}>
              {error}
            </span>
            <Button
              label="Retry"
              onClick={retrySearch}
              style={{
                fontSize: 12,
                height: 28,
                padding: "0 14px",
                borderRadius: 999,
              }}
            />
          </div>
        ) : models.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "28px 0",
              fontSize: 12,
              fontFamily: "Jost",
              color: mutedColor,
            }}
          >
            No models found
          </div>
        ) : (
          models.map((model) => (
            <ModelCard
              key={model.name}
              model={model}
              isDark={isDark}
              installedNames={installedNames}
              pullingMap={pullingMap}
              onPull={handlePull}
              onCancel={handleCancel}
            />
          ))
        )}
      </div>
    </>
  );
};

const OllamaSection = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <SettingsSection title="Ollama" icon="ollama">
      <ActiveDownloads isDark={isDark} />
      <p
        style={{
          margin: "4px 0 6px",
          fontSize: 13,
          fontFamily: "Jost",
          color: mutedColor,
          lineHeight: 1.5,
        }}
      >
        Ollama runs locally — no API key required.
      </p>
      <div
        style={{
          fontSize: 10,
          fontFamily: "Jost",
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          color: mutedColor,
          opacity: 0.7,
          marginTop: 10,
          marginBottom: 0,
        }}
      >
        Model Library
      </div>
      <OllamaLibraryBrowser isDark={isDark} />
    </SettingsSection>
  );
};

export const ModelProvidersSettings = () => {
  return (
    <div
      className="scrollable"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: "8px 0",
        overflowY: "auto",
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <OpenAISection />
      <AnthropicSection />
      <OllamaSection />
    </div>
  );
};
