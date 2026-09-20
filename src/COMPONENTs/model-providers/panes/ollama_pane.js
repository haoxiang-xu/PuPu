import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import SegmentedControl from "../../toolkit/components/segmented_control";
import ActiveDownloads from "../../settings/model_providers/components/active_downloads";
import { OllamaStore } from "./ollama/ollama_store";
import OllamaModelRow from "../../settings/local_storage/components/ollama_model_row";
import { formatBytes } from "../../settings/local_storage/utils/storage_metrics";

/**
 * OllamaPane — the one provider where models are chosen, downloaded and
 * managed (#204, project owner decision 1). Design S4: the modal's fixed
 * header carries the service state (caption) and, on one row, the compact
 * Installed / Library group button with the icon Reload (OllamaHeadingActions,
 * composed by model_providers_modal_content.js; the tab state lives there
 * because the header is outside this pane). The body is the active tab:
 *
 *   Installed — the local models with size bars and a hover trash icon
 *               (the Local Storage rows, same delete path, same catalog
 *               refresh), then pulls in flight;
 *   Library   — the store (design S3, ./ollama/ollama_store.js).
 *
 * `useOllamaTab` opens on Installed when there is something installed, on
 * Library when there is not — decided once, when the service first answers.
 * State comes from the shared `useOllamaInstalled` hook the modal owns, so
 * the rail dot and this pane can never disagree.
 */

export const OLLAMA_STATUS_CAPTION_KEY = {
  ready: "model_providers.page.ollama_running",
  offline: "local_storage.offline",
  not_found: "local_storage.not_installed",
  loading: "local_storage.loading",
  starting: "local_storage.starting",
};

/** The tab choice, owned by whoever renders the header (the modal content). */
export const useOllamaTab = (ollama) => {
  const { status, models } = ollama;
  const [tab, setTab] = useState(null);
  useEffect(() => {
    if (tab !== null) return;
    if (status === "ready") setTab(models.length > 0 ? "installed" : "library");
    else if (status === "offline" || status === "not_found") setTab("library");
  }, [status, models.length, tab]);
  return [tab || "installed", setTab];
};

/** Header row: compact Installed / Library group button, Restart while the
 *  service is down, and an icon-only Reload with a tooltip. */
export const OllamaHeadingActions = ({ ollama, tab, onTabChange }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const { status, models, hasOllamaBridge, load, restart } = ollama;
  const iconBtn = {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 6,
    opacity: 0.6,
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    content: { icon: { width: 15, height: 15 } },
  };
  return (
    <span data-testid="ollama-heading-actions" style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <SegmentedControl
        size="compact"
        sections={[
          {
            key: "installed",
            label:
              status === "ready" && models.length > 0
                ? `${t("model_providers.store.tab_installed")} · ${models.length}`
                : t("model_providers.store.tab_installed"),
          },
          { key: "library", label: t("model_providers.store.tab_library") },
        ]}
        selected={tab}
        onChange={onTabChange}
        isDark={isDark}
        buttonFontWeight={500}
      />
      {hasOllamaBridge && (status === "offline" || status === "starting") && (
        <Button
          label={t("local_storage.restart")}
          onClick={restart}
          style={{
            fontSize: 12,
            fontFamily,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 6,
            color: "var(--pupu-text-secondary)",
            hoverBackgroundColor: "var(--pupu-overlay-hover)",
            opacity: status === "starting" ? 0.35 : 1,
          }}
        />
      )}
      <Tooltip label={t("local_storage.reload")} position="bottom">
        <Button prefix_icon="update" ariaLabel={t("local_storage.reload")} onClick={load} style={iconBtn} />
      </Tooltip>
    </span>
  );
};

export const OllamaPane = ({ ollama, tab = "installed" }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const { status, models, hasOllamaBridge, load, removeLocally } = ollama;
  const activeTab = tab;

  const maxSize = models.length > 0 ? models[0].size : 1;
  const totalSize = models.reduce((s, m) => s + m.size, 0);

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

  return (
    <div data-testid="ollama-pane">
      {activeTab === "installed" && (
        <div data-testid="ollama-installed-tab">
          {status === "not_found" && (
            <div style={{ margin: "4px 0", display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={mutedStyle}>{t("local_storage.ollama_not_installed")}</p>
              <span style={monoStyle}>https://ollama.com</span>
            </div>
          )}
          {status === "starting" && (
            <p style={{ ...mutedStyle, margin: "4px 0" }}>{t("local_storage.ollama_starting")}</p>
          )}
          {status === "offline" && (
            <div style={{ margin: "4px 0", display: "flex", flexDirection: "column", gap: 6 }}>
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
              <p style={{ ...mutedStyle, fontSize: 11.5, marginBottom: 2 }}>
                {[
                  t(OLLAMA_STATUS_CAPTION_KEY.ready),
                  models.length > 0
                    ? t("model_providers.store.on_disk", { size: formatBytes(totalSize) })
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
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
          {/* ActiveDownloads carries its own "Active Downloads" caption and
              renders nothing while no pull is running. */}
          <div style={{ marginTop: 6 }}>
            <ActiveDownloads isDark={isDark} />
          </div>
        </div>
      )}

      {activeTab === "library" && (
        <div data-testid="ollama-library-tab">
          {status === "ready" && (
            <p style={{ ...mutedStyle, fontSize: 11.5, marginBottom: 8 }}>{t(OLLAMA_STATUS_CAPTION_KEY.ready)}</p>
          )}
          {status !== "ready" && (
            <p style={{ ...mutedStyle, marginBottom: 8 }}>
              {status === "not_found"
                ? t("local_storage.ollama_not_installed")
                : status === "offline"
                  ? t("local_storage.ollama_not_running")
                  : t("local_storage.ollama_starting")}
            </p>
          )}
          <OllamaStore isDark={isDark} onInstalledChanged={load} />
        </div>
      )}
    </div>
  );
};

export default OllamaPane;
