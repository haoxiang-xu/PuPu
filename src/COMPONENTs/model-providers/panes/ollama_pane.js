import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { PaneHeading } from "../../settings/model_providers/components/pane_heading";
import ActiveDownloads from "../../settings/model_providers/components/active_downloads";
import { OllamaStore } from "./ollama/ollama_store";
import OllamaModelRow from "../../settings/local_storage/components/ollama_model_row";
import { formatBytes } from "../../settings/local_storage/utils/storage_metrics";

/**
 * OllamaPane — the one provider where models are chosen, downloaded and
 * managed (#204, project owner decision 1). Top to bottom:
 *
 *   heading  — service state as the caption (running / offline / not
 *              installed / starting), Restart / Reload on the right;
 *   installed — the local models with size bars and Delete (the Local
 *              Storage rows, same delete path, same catalog refresh);
 *   downloads — pulls in flight (ActiveDownloads);
 *   store    — the library as a card grid with a per-tag size picker
 *              (design O3, ./ollama/ollama_store.js).
 *
 * State comes from the shared `useOllamaInstalled` hook the modal owns, so
 * the rail dot and this pane can never disagree.
 */

const STATUS_CAPTION_KEY = {
  ready: "model_providers.page.ollama_running",
  offline: "local_storage.offline",
  not_found: "local_storage.not_installed",
  loading: "local_storage.loading",
  starting: "local_storage.starting",
};

export const OllamaPane = ({ ollama }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const { status, models, hasOllamaBridge, load, restart, removeLocally } = ollama;

  const maxSize = models.length > 0 ? models[0].size : 1;
  const totalSize = models.reduce((s, m) => s + m.size, 0);

  const captionStyle = {
    fontSize: 10,
    fontFamily,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    color: "var(--pupu-text-faint)",
    opacity: 0.7,
    margin: "14px 0 2px",
  };
  const mutedStyle = {
    fontSize: 12.5,
    fontFamily,
    color: "var(--pupu-text-faint)",
    lineHeight: 1.5,
    margin: 0,
  };
  const monoStyle = {
    fontSize: 12,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: "var(--pupu-text-secondary)",
    userSelect: "text",
  };
  const actionStyle = {
    fontSize: 12,
    fontFamily,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    color: "var(--pupu-text-secondary)",
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
  };

  const actions = (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {hasOllamaBridge && (status === "offline" || status === "starting") && (
        <Button
          label={t("local_storage.restart")}
          onClick={restart}
          style={{ ...actionStyle, opacity: status === "starting" ? 0.35 : 1 }}
        />
      )}
      <Button label={t("local_storage.reload")} onClick={load} style={actionStyle} />
    </span>
  );

  return (
    <div data-testid="ollama-pane">
      <PaneHeading
        title="Ollama"
        icon="ollama"
        caption={t(STATUS_CAPTION_KEY[status] || STATUS_CAPTION_KEY.loading)}
        action={actions}
      />
      <p style={mutedStyle}>{t("model_providers.ollama_desc")}</p>

      {status === "not_found" && (
        <div style={{ margin: "12px 0 4px", display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={mutedStyle}>{t("local_storage.ollama_not_installed")}</p>
          <span style={monoStyle}>https://ollama.com</span>
        </div>
      )}
      {status === "starting" && (
        <p style={{ ...mutedStyle, margin: "12px 0 4px" }}>{t("local_storage.ollama_starting")}</p>
      )}
      {status === "offline" && (
        <div style={{ margin: "12px 0 4px", display: "flex", flexDirection: "column", gap: 6 }}>
          <p style={mutedStyle}>
            {hasOllamaBridge
              ? t("local_storage.ollama_failed_start")
              : t("local_storage.ollama_not_running")}
          </p>
          <span style={monoStyle}>ollama serve</span>
        </div>
      )}

      {status === "ready" && (
        <>
          <div style={captionStyle}>
            {t("model_providers.page.installed_models")}
            {models.length > 0 && (
              <span style={{ marginLeft: 8, letterSpacing: 0, textTransform: "none", fontVariantNumeric: "tabular-nums" }}>
                {models.length} · {formatBytes(totalSize)}
              </span>
            )}
          </div>
          <div data-testid="ollama-installed-list">
            {models.length === 0 ? (
              <p style={{ ...mutedStyle, padding: "14px 0 6px" }}>{t("local_storage.no_models")}</p>
            ) : (
              models.map((model) => (
                <OllamaModelRow
                  key={model.name}
                  model={model}
                  maxSize={maxSize}
                  isDark={isDark}
                  onDelete={removeLocally}
                />
              ))
            )}
          </div>
        </>
      )}

      <ActiveDownloads isDark={isDark} />

      <div style={{ ...captionStyle, marginTop: 18 }}>{t("model_providers.model_library")}</div>
      <OllamaStore isDark={isDark} />
    </div>
  );
};

export default OllamaPane;
