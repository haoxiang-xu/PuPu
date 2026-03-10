import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Slider from "../../../BUILTIN_COMPONENTs/input/slider";
import SegmentedButton from "../../../BUILTIN_COMPONENTs/input/segmented_button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import { SettingsRow, SettingsSection } from "../appearance";
import { readMemorySettings, writeMemorySettings } from "./storage";
import useOllamaEmbeddingModels from "./use_ollama_embedding_models";
import useOpenAIEmbeddingModels from "./use_openai_embedding_models";

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama" },
];
const OPENAI_EMBEDDING_FALLBACK_MODEL = "text-embedding-3-small";

export const MemorySettings = ({ onNavigate }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const {
    models: openaiEmbeddingModels,
    loading: openaiEmbeddingLoading,
    error: openaiEmbeddingError,
  } = useOpenAIEmbeddingModels();
  const {
    models: embeddingModels,
    loading: embeddingLoading,
    error: embeddingError,
  } = useOllamaEmbeddingModels();

  const [settings, setSettings] = useState(() => readMemorySettings());

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeMemorySettings(patch);
      return next;
    });
  }, []);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const normalizedCurrentOpenAIModel =
    typeof settings.openai_embedding_model === "string"
      ? settings.openai_embedding_model.trim()
      : "";
  const openaiFallbackModel = openaiEmbeddingModels.includes(
    OPENAI_EMBEDDING_FALLBACK_MODEL,
  )
    ? OPENAI_EMBEDDING_FALLBACK_MODEL
    : openaiEmbeddingModels[0] || "";
  const selectedOpenAIModel = openaiEmbeddingModels.includes(
    normalizedCurrentOpenAIModel,
  )
    ? normalizedCurrentOpenAIModel
    : openaiFallbackModel;

  useEffect(() => {
    if (
      openaiEmbeddingLoading ||
      openaiEmbeddingError ||
      openaiEmbeddingModels.length === 0
    ) {
      return;
    }

    if (
      normalizedCurrentOpenAIModel &&
      selectedOpenAIModel === normalizedCurrentOpenAIModel
    ) {
      return;
    }

    if (!selectedOpenAIModel) {
      return;
    }

    update({ openai_embedding_model: selectedOpenAIModel });
  }, [
    openaiEmbeddingLoading,
    openaiEmbeddingError,
    openaiEmbeddingModels,
    normalizedCurrentOpenAIModel,
    selectedOpenAIModel,
    update,
  ]);

  return (
    <div>
      {/* ── Enable ── */}
      <SettingsSection title="Chat Memory">
        <SettingsRow
          label="Enable memory"
          description="Each chat keeps short-term memory, while long-term memory is shared globally and recalled automatically when relevant."
        >
          <SemiSwitch
            on={settings.enabled}
            set_on={(val) => update({ enabled: val })}
            style={{ width: 56, height: 28 }}
          />
        </SettingsRow>
        <SettingsRow
          label="Enable long-term memory"
          description="Stable profile, facts, episodes, and reusable workflows are extracted and shared across chats."
        >
          <SemiSwitch
            on={settings.long_term_enabled}
            set_on={(val) => update({ long_term_enabled: val })}
            style={{ width: 56, height: 28 }}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Embedding model ── */}
      <SettingsSection title="Embedding Model">
        <SettingsRow
          label="Provider"
          description={
            settings.embedding_provider === "auto"
              ? "Uses the current chat model's provider. Falls back to OpenAI → Ollama."
              : undefined
          }
        >
          <SegmentedButton
            options={PROVIDER_OPTIONS}
            value={settings.embedding_provider}
            on_change={(val) => update({ embedding_provider: val })}
            style={{
              fontSize: 12,
              borderRadius: 7,
              padding: 2,
              gap: 2,
            }}
            button_style={{
              padding: "4px 12px",
            }}
          />
        </SettingsRow>

        {settings.embedding_provider === "openai" &&
          (openaiEmbeddingLoading ? (
            <SettingsRow label="Model">
              <span style={{ fontSize: 12, color: mutedColor }}>
                Loading models…
              </span>
            </SettingsRow>
          ) : openaiEmbeddingError || openaiEmbeddingModels.length === 0 ? (
            <SettingsRow label="Model">
              <span style={{ fontSize: 12, color: mutedColor }}>
                {openaiEmbeddingError
                  ? "Could not load OpenAI embedding models."
                  : "No embedding models available."}
              </span>
            </SettingsRow>
          ) : (
            <SettingsRow label="Model">
              <Select
                options={openaiEmbeddingModels.map((modelName) => ({
                  value: modelName,
                  label: modelName,
                }))}
                value={selectedOpenAIModel}
                set_value={(val) => update({ openai_embedding_model: val })}
                placeholder="Select embedding model"
                filterable={true}
                filter_mode="panel"
                style={{
                  fontSize: 14,
                  height: 20,
                  fontFamily: "Jost",
                  borderRadius: 6,
                  color: isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.80)",
                }}
              />
            </SettingsRow>
          ))}

        {settings.embedding_provider === "ollama" &&
          (embeddingLoading ? (
            <SettingsRow label="Model">
              <span style={{ fontSize: 12, color: mutedColor }}>
                Loading models…
              </span>
            </SettingsRow>
          ) : embeddingError || embeddingModels.length === 0 ? (
            <SettingsRow
              label="Model"
              description={
                embeddingError
                  ? "Could not connect to Ollama."
                  : "No embedding models installed."
              }
            >
              <button
                onClick={() => onNavigate?.("model_providers")}
                style={{
                  fontSize: 12,
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)"}`,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.04)",
                  color: isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.80)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Go to Model Providers → Ollama
              </button>
            </SettingsRow>
          ) : (
            <SettingsRow label="Model">
              <Select
                options={[
                  ...embeddingModels.map((m) => ({
                    value: m.name,
                    label: m.name,
                  })),
                  {
                    value: "__go_to_ollama__",
                    label: "",
                    icon: (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          width: "100%",
                        }}
                      >
                        <Icon
                          src="add"
                          style={{ width: 14, height: 14, opacity: 0.5 }}
                        />
                      </div>
                    ),
                  },
                ]}
                value={settings.ollama_embedding_model}
                set_value={(val) => {
                  if (val === "__go_to_ollama__") {
                    onNavigate?.("model_providers");
                    return;
                  }
                  update({ ollama_embedding_model: val });
                }}
                placeholder="Select embedding model"
                filterable={true}
                filter_mode="panel"
                style={{
                  fontSize: 14,
                  height: 20,
                  fontFamily: "Jost",
                  borderRadius: 6,
                  color: isDark ? "rgba(255,255,255,0.80)" : "rgba(0,0,0,0.80)",
                }}
              />
            </SettingsRow>
          ))}

        {settings.embedding_provider === "auto" && (
          <div
            style={{
              fontSize: 11,
              color: mutedColor,
              padding: "0 0 12px",
              lineHeight: 1.5,
            }}
          >
            If the current chat model is Anthropic (no embedding API), memory
            will fall back to OpenAI if an API key is configured, then Ollama if
            reachable. If neither is available, memory is skipped for that
            request — configure a provider explicitly to avoid this.
          </div>
        )}
      </SettingsSection>

      {/* ── Context strategy ── */}
      <SettingsSection title="Context Strategy">
        <SettingsRow
          label={`Last N turns — ${settings.last_n_turns}`}
          description="Recent conversation turns always included in context."
        >
          <Slider
            value={settings.last_n_turns}
            set_value={(val) => update({ last_n_turns: val })}
            min={2}
            max={20}
            step={1}
            label_format={(v) => `${v}`}
            style={{ width: 160 }}
          />
        </SettingsRow>

        <SettingsRow
          label={`Recall top K — ${settings.vector_top_k}`}
          description="Semantically similar past messages injected as context."
        >
          <Slider
            value={settings.vector_top_k}
            set_value={(val) => update({ vector_top_k: val })}
            min={0}
            max={10}
            step={1}
            label_format={(v) => `${v}`}
            style={{ width: 160 }}
          />
        </SettingsRow>

        <SettingsRow
          label={`Extract every N turns — ${settings.long_term_extract_every_n_turns}`}
          description="Long-term memory extraction runs after this many complete user → assistant turns."
        >
          <Slider
            value={settings.long_term_extract_every_n_turns}
            set_value={(val) =>
              update({ long_term_extract_every_n_turns: Math.max(1, val) })
            }
            min={1}
            max={20}
            step={1}
            label_format={(v) => `${v}`}
            style={{ width: 160 }}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
};

export default MemorySettings;
