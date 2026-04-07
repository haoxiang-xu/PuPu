import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Slider from "../../../BUILTIN_COMPONENTs/input/slider";
import SegmentedButton from "../../../BUILTIN_COMPONENTs/input/segmented_button";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import { SettingsRow, SettingsSection } from "../appearance";
import { readMemorySettings, writeMemorySettings } from "./storage";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import useOllamaEmbeddingModels from "./use_ollama_embedding_models";
import useOpenAIEmbeddingModels from "./use_openai_embedding_models";
import { MemoryInspectModal } from "../../memory-inspect/memory_inspect_modal";

const PROVIDER_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "openai", label: "OpenAI" },
  { value: "ollama", label: "Ollama" },
];
const OPENAI_EMBEDDING_FALLBACK_MODEL = "text-embedding-3-small";
const clampThresholdValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
};
const formatThresholdValue = (value) => {
  const normalized = clampThresholdValue(value);
  return normalized > 0 ? normalized.toFixed(2) : "Off";
};

export const MemorySettings = ({ onNavigate }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
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
  const [inspectOpen, setInspectOpen] = useState(false);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeMemorySettings(patch);
      return next;
    });
  }, []);
  const updateThreshold = useCallback(
    (key, value) => {
      update({ [key]: clampThresholdValue(value) });
    },
    [update],
  );

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
      <SettingsSection title={t("memory.title")}>
        <SettingsRow
          label={t("memory.enable_memory")}
          description={t("memory.enable_memory_desc")}
        >
          <SemiSwitch
            on={settings.enabled}
            set_on={(val) => update({ enabled: val })}
            style={{ width: 56, height: 28 }}
          />
        </SettingsRow>
        <SettingsRow
          label={t("memory.enable_long_term")}
          description={t("memory.enable_long_term_desc")}
        >
          <SemiSwitch
            on={settings.long_term_enabled}
            set_on={(val) => update({ long_term_enabled: val })}
            style={{ width: 56, height: 28 }}
          />
        </SettingsRow>
        <SettingsRow
          label={t("memory.inspect_long_term")}
          description={t("memory.inspect_long_term_desc")}
        >
          <Button
            label={t("memory.inspect")}
            onClick={() => setInspectOpen(true)}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 14,
              borderRadius: 6,
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.14)"
                : "rgba(0,0,0,0.10)",
              background: {
                hoverBackgroundColor: isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(0,0,0,0.10)",
              },
              root: {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.05)",
              },
            }}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Embedding model ── */}
      <SettingsSection title={t("memory.embedding_model")}>
        <SettingsRow
          label={t("memory.provider")}
          description={
            settings.embedding_provider === "auto"
              ? t("memory.auto_provider_desc")
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
                {t("memory.loading_models")}
              </span>
            </SettingsRow>
          ) : openaiEmbeddingError || openaiEmbeddingModels.length === 0 ? (
            <SettingsRow label="Model">
              <span style={{ fontSize: 12, color: mutedColor }}>
                {openaiEmbeddingError
                  ? t("memory.openai_load_error")
                  : t("memory.no_models_available")}
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
                placeholder={t("memory.select_embedding_model")}
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
                {t("memory.loading_models")}
              </span>
            </SettingsRow>
          ) : embeddingError || embeddingModels.length === 0 ? (
            <SettingsRow
              label="Model"
              description={
                embeddingError
                  ? t("memory.ollama_connect_error")
                  : t("memory.no_embedding_installed")
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
                {t("memory.go_to_ollama")}
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
                placeholder={t("memory.select_embedding_model")}
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
            {t("memory.auto_fallback_desc")}
          </div>
        )}
      </SettingsSection>

      {/* ── Context strategy ── */}
      <SettingsSection title={t("memory.context_strategy")}>
        <SettingsRow
          label={t("memory.last_n_turns", { count: settings.last_n_turns })}
          description={t("memory.last_n_turns_desc")}
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
          label={t("memory.recall_top_k", { count: settings.vector_top_k })}
          description={t("memory.recall_top_k_desc")}
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
          label={t("memory.recall_threshold", { value: formatThresholdValue(settings.vector_min_score) })}
          description={t("memory.recall_threshold_desc")}
        >
          <Slider
            value={settings.vector_min_score}
            set_value={(val) => updateThreshold("vector_min_score", val)}
            min={0}
            max={1}
            step={0.05}
            label_format={formatThresholdValue}
            tooltip_format={formatThresholdValue}
            style={{ width: 160 }}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t("memory.long_term_memory")}>
        <SettingsRow
          label={t("memory.extract_every_n", { count: settings.long_term_extract_every_n_turns })}
          description={t("memory.extract_every_n_desc")}
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
            disabled={!settings.long_term_enabled}
            style={{ width: 160 }}
          />
        </SettingsRow>

        <SettingsRow
          label={t("memory.long_term_top_k", { count: settings.long_term_top_k })}
          description={t("memory.long_term_top_k_desc")}
        >
          <Slider
            value={settings.long_term_top_k}
            set_value={(val) => update({ long_term_top_k: val })}
            min={0}
            max={10}
            step={1}
            label_format={(v) => `${v}`}
            disabled={!settings.long_term_enabled}
            style={{ width: 160 }}
          />
        </SettingsRow>

        <SettingsRow
          label={t("memory.long_term_threshold", { value: formatThresholdValue(settings.long_term_min_score) })}
          description={t("memory.long_term_threshold_desc")}
        >
          <Slider
            value={settings.long_term_min_score}
            set_value={(val) => updateThreshold("long_term_min_score", val)}
            min={0}
            max={1}
            step={0.05}
            label_format={formatThresholdValue}
            tooltip_format={formatThresholdValue}
            disabled={!settings.long_term_enabled}
            style={{ width: 160 }}
          />
        </SettingsRow>
      </SettingsSection>

      {/* ── Long-term memory inspect modal ── */}
      <MemoryInspectModal
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        mode="long_term"
      />
    </div>
  );
};

export default MemorySettings;
