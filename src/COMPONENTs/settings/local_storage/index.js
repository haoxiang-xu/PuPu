import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { SettingsSection } from "../appearance";
import { listAttachmentEntries } from "../../../SERVICEs/attachment_storage";
import { fetchOllamaModels } from "./utils/ollama_models";
import { formatBytes, readLocalStorageEntries } from "./utils/storage_metrics";
import StorageKeyRow from "./components/storage_key_row";
import OllamaModelRow from "./components/ollama_model_row";
import ConfirmClearAll from "./components/confirm_clear_all";
import { api } from "../../../SERVICEs/api";

const OllamaSection = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const [status, setStatus] = useState("loading");
  const [models, setModels] = useState([]);
  const hasOllamaBridge = api.ollama.isBridgeAvailable();

  const load = useCallback(async () => {
    setStatus("loading");

    if (hasOllamaBridge) {
      const electronStatus = await api.ollama.getStatus();
      if (electronStatus === "not_found") {
        setStatus("not_found");
        return;
      }
      if (electronStatus === "checking" || electronStatus === "starting") {
        setStatus("starting");
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    try {
      const data = await fetchOllamaModels();
      setModels(data);
      setStatus("ready");
    } catch {
      setModels([]);
      setStatus("offline");
    }
  }, [hasOllamaBridge]);

  const handleRestart = useCallback(async () => {
    if (!hasOllamaBridge) return;
    setStatus("starting");
    const result = await api.ollama.restart();
    if (result === "not_found") {
      setStatus("not_found");
      return;
    }
    await load();
  }, [hasOllamaBridge, load]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = useCallback((name) => {
    setModels((prev) => prev.filter((m) => m.name !== name));
  }, []);

  const maxSize = models.length > 0 ? models[0].size : 1;
  const totalSize = models.reduce((s, m) => s + m.size, 0);

  const statusPill = (label, amber = false) => (
    <span
      style={{
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 99,
        backgroundColor: amber
          ? isDark
            ? "rgba(255,160,0,0.12)"
            : "rgba(200,120,0,0.08)"
          : isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.05)",
        color: amber
          ? isDark
            ? "rgba(255,180,60,0.85)"
            : "rgba(160,90,0,0.85)"
          : isDark
            ? "rgba(255,255,255,0.35)"
            : "rgba(0,0,0,0.35)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </span>
  );

  return (
    <SettingsSection title="Ollama">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0 6px",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {status === "ready" && (
            <>
              {statusPill(
                `${models.length} ${models.length === 1 ? "model" : "models"}`,
              )}
              {statusPill(`${formatBytes(totalSize)} total`)}
            </>
          )}
          {status === "offline" && statusPill("offline", true)}
          {status === "not_found" && statusPill("not installed", true)}
          {status === "loading" && statusPill("loading…")}
          {status === "starting" && statusPill("starting…")}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {hasOllamaBridge &&
            (status === "offline" || status === "starting") && (
              <Button
                label="Restart"
                onClick={handleRestart}
                style={{
                  fontSize: 12,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  opacity: status === "starting" ? 0.35 : 0.55,
                }}
              />
            )}
          <Button
            label="Reload"
            onClick={load}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 10,
              borderRadius: 6,
              opacity: 0.45,
            }}
          />
        </div>
      </div>

      {status === "not_found" && (
        <div
          style={{
            margin: "4px 0 12px",
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,160,0,0.08)"
              : "rgba(200,120,0,0.06)",
            border: `1px solid ${isDark ? "rgba(255,160,0,0.18)" : "rgba(200,120,0,0.15)"}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: isDark ? "rgba(255,180,60,0.85)" : "rgba(140,80,0,0.9)",
              marginBottom: 8,
              fontFamily: theme?.font?.fontFamily || "inherit",
            }}
          >
            Ollama is not installed. Get it at:
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              padding: "6px 10px",
              borderRadius: 6,
              backgroundColor: isDark ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.06)",
              color: isDark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.55)",
              userSelect: "text",
            }}
          >
            https://ollama.com
          </div>
        </div>
      )}

      {status === "starting" && (
        <div
          style={{
            margin: "4px 0 12px",
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.03)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
            fontSize: 12,
            color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
            fontFamily: theme?.font?.fontFamily || "inherit",
          }}
        >
          Starting Ollama in the background…
        </div>
      )}

      {status === "offline" && (
        <div
          style={{
            margin: "4px 0 12px",
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,160,0,0.08)"
              : "rgba(200,120,0,0.06)",
            border: `1px solid ${isDark ? "rgba(255,160,0,0.18)" : "rgba(200,120,0,0.15)"}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: isDark ? "rgba(255,180,60,0.85)" : "rgba(140,80,0,0.9)",
              marginBottom: 8,
              fontFamily: theme?.font?.fontFamily || "inherit",
            }}
          >
            {hasOllamaBridge
              ? "Ollama failed to start. Try restarting it:"
              : "Ollama is not running. Start it with:"}
          </div>
          <div
            style={{
              fontSize: 12,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              padding: "6px 10px",
              borderRadius: 6,
              backgroundColor: isDark ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.06)",
              color: isDark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.55)",
              userSelect: "text",
            }}
          >
            ollama serve
          </div>
        </div>
      )}

      {status === "ready" && (
        <div>
          {models.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 0",
                fontSize: 13,
                color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
                fontFamily: theme?.font?.fontFamily || "inherit",
              }}
            >
              No models installed
            </div>
          ) : (
            models.map((model) => (
              <OllamaModelRow
                key={model.name}
                model={model}
                maxSize={maxSize}
                isDark={isDark}
                onDelete={handleDelete}
              />
            ))
          )}
        </div>
      )}
    </SettingsSection>
  );
};

export const LocalStorageSettings = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [entries, setEntries] = useState([]);
  const [attachmentCount, setAttachmentCount] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => {
    setEntries(readLocalStorageEntries());
    listAttachmentEntries()
      .then((all) => {
        setAttachmentCount(all.length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    (key) => {
      try {
        localStorage.removeItem(key);
      } catch {}
      refresh();
    },
    [refresh],
  );

  const handleClearAll = useCallback(() => {
    try {
      localStorage.clear();
    } catch {}
    setConfirmClear(false);
    refresh();
  }, [refresh]);

  const totalSize = entries.reduce((s, e) => s + e.size, 0);
  const maxSize = entries.length > 0 ? entries[0].size : 1;

  return (
    <div>
      <SettingsSection title="System">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 0 6px",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 99,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.05)",
                color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {entries.length} {entries.length === 1 ? "key" : "keys"}
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 99,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.05)",
                color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatBytes(totalSize)} total
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Button
              label="Reload"
              onClick={refresh}
              style={{
                fontSize: 12,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.45,
              }}
            />
            {entries.length > 0 && !confirmClear && (
              <Button
                label="Clear all"
                onClick={() => setConfirmClear(true)}
                style={{
                  fontSize: 12,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  opacity: 0.55,
                  hoverBackgroundColor: isDark
                    ? "rgba(220,50,50,0.15)"
                    : "rgba(220,50,50,0.09)",
                }}
              />
            )}
          </div>
        </div>

        {confirmClear && (
          <div style={{ paddingBottom: 8 }}>
            <ConfirmClearAll
              isDark={isDark}
              label="Clear all local storage?"
              onConfirm={handleClearAll}
              onCancel={() => setConfirmClear(false)}
            />
          </div>
        )}

        {entries.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 0",
              fontSize: 13,
              color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
              fontFamily: theme?.font?.fontFamily || "inherit",
            }}
          >
            No data stored
          </div>
        ) : (
          <div>
            {entries.map((entry) => (
              <StorageKeyRow
                key={entry.key}
                entry={entry}
                maxSize={maxSize}
                isDark={isDark}
                onDelete={handleDelete}
                attachmentCount={entry.key === "chats" ? attachmentCount : null}
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <OllamaSection isDark={isDark} />
    </div>
  );
};
