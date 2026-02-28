import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { SettingsSection } from "../appearance";
import { listAttachmentEntries } from "../../../SERVICEs/attachment_storage";
import { fetchOllamaModels } from "./utils/ollama_models";
import { formatBytes, readLocalStorageEntries } from "./utils/storage_metrics";
import StorageKeyRow from "./components/storage_key_row";
import StorageBar from "./components/storage_bar";
import OllamaModelRow from "./components/ollama_model_row";
import ConfirmClearAll from "./components/confirm_clear_all";
import ConfirmDeleteModal from "./components/confirm_delete_modal";
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  RuntimeSection                                                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const _FILE_TYPE_ICON_KEYS = new Set([
  "JS",
  "TS",
  "HTML",
  "CSS",
  "IPYNB",
  "JSON",
  "PY",
  "JAVA",
  "C",
  "CPP",
  "CS",
  "PHP",
  "SQL",
  "SWIFT",
  "PNG",
  "SVG",
  "TXT",
  "PDF",
  "DOCX",
  "XLSX",
  "PPTX",
  "ENV",
  "MD",
  "MARKDOWN",
  "DS_STORE",
  "GITIGNORE",
  "DOCKERIGNORE",
  "ZIP",
]);

const _getFileIconSrc = (name, isDir) => {
  if (isDir) return "folder";
  // dotfiles: .gitignore → GITIGNORE, .DS_Store → DS_STORE
  if (name.startsWith(".")) {
    const ext = name.slice(1).replace(/\./g, "_").toUpperCase();
    return _FILE_TYPE_ICON_KEYS.has(ext) ? ext : null;
  }
  const parts = name.split(".");
  if (parts.length < 2) return null;
  const ext = parts[parts.length - 1].toUpperCase();
  return _FILE_TYPE_ICON_KEYS.has(ext) ? ext : null;
};

const RuntimeFileRow = ({ entry, maxSize, isDark, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ratio = maxSize > 0 ? entry.size / maxSize : 0;
  const iconSrc = _getFileIconSrc(entry.name, entry.isDir);

  return (
    <>
      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete(entry.name);
        }}
        target={entry.name}
        isDark={isDark}
      />
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "9px 0",
          borderBottom: `1px solid ${
            isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
          }`,
        }}
      >
        {/* file-type / folder icon */}
        <div style={{ width: 14, height: 14, flexShrink: 0 }}>
          {iconSrc && (
            <Icon
              src={iconSrc}
              color={isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.60)"}
            />
          )}
        </div>

        {/* name */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.70)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={entry.name}
        >
          {entry.name}
        </span>

        {/* bar + size */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <StorageBar ratio={ratio} isDark={isDark} />
          <span
            style={{
              fontSize: 11,
              width: 60,
              textAlign: "right",
              color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {formatBytes(entry.size)}
          </span>
        </div>

        {/* delete button */}
        <div style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
          <Button
            prefix_icon="delete"
            onClick={() => setConfirmOpen(true)}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 5,
              opacity: 0.55,
              hoverBackgroundColor: isDark
                ? "rgba(255,80,80,0.15)"
                : "rgba(220,50,50,0.10)",
              content: { icon: { width: 11, height: 11 } },
            }}
          />
        </div>
      </div>
    </>
  );
};

const SETTINGS_STORAGE_KEY = "settings";
const _isObject = (v) =>
  v != null && typeof v === "object" && !Array.isArray(v);
const readRuntimeWorkspaceRoot = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    );
    const root = _isObject(parsed) ? parsed : {};
    const runtime = _isObject(root.runtime) ? root.runtime : {};
    return typeof runtime.workspace_root === "string"
      ? runtime.workspace_root.trim()
      : "";
  } catch {
    return "";
  }
};

const RuntimeSection = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const hasApi =
    typeof window !== "undefined" &&
    typeof window.misoAPI?.getRuntimeDirSize === "function";

  const [status, setStatus] = useState("loading");
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [workspacePath, setWorkspacePath] = useState("");

  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const load = useCallback(async () => {
    if (!hasApi) {
      setStatus("unavailable");
      return;
    }
    const wp = readRuntimeWorkspaceRoot();
    setWorkspacePath(wp);
    if (!wp) {
      setStatus("no_path");
      return;
    }
    setStatus("loading");
    try {
      const result = await window.misoAPI.getRuntimeDirSize(wp);
      if (result && Array.isArray(result.entries)) {
        if (result.error === "not_found") {
          setStatus("not_found");
        } else {
          setEntries(result.entries);
          setTotal(result.total || 0);
          setStatus("ready");
        }
      } else {
        setStatus("unavailable");
      }
    } catch {
      setStatus("unavailable");
    }
  }, [hasApi]);

  const handleDelete = useCallback(
    async (entryName) => {
      const wp = readRuntimeWorkspaceRoot();
      if (!wp) return;
      try {
        await window.misoAPI.deleteRuntimeEntry(wp, entryName);
      } catch {}
      setEntries((prev) => prev.filter((e) => e.name !== entryName));
      setTotal((prev) => {
        const removed = entries.find((e) => e.name === entryName);
        return removed ? Math.max(prev - removed.size, 0) : prev;
      });
    },
    [entries],
  );

  const handleClearAll = useCallback(async () => {
    setConfirmClearAll(false);
    const wp = readRuntimeWorkspaceRoot();
    if (!wp) return;
    try {
      await window.misoAPI.clearRuntimeDir(wp);
    } catch {}
    setEntries([]);
    setTotal(0);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxSize = entries.length > 0 ? entries[0].size : 1;

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
            ? "rgba(255,255,255,0.45)"
            : "rgba(0,0,0,0.40)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </span>
  );

  return (
    <SettingsSection title="Runtime">
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
                `${entries.length} ${entries.length === 1 ? "item" : "items"}`,
              )}
              {statusPill(`${formatBytes(total)} total`)}
            </>
          )}
          {status === "loading" && statusPill("loading…")}
          {status === "no_path" && statusPill("not configured", true)}
          {status === "not_found" && statusPill("not found", true)}
          {status === "unavailable" && statusPill("unavailable", true)}
        </div>

        {hasApi && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
            {status === "ready" && entries.length > 0 && !confirmClearAll && (
              <Button
                label="Clear all"
                onClick={() => setConfirmClearAll(true)}
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
        )}
      </div>

      {confirmClearAll && (
        <div style={{ paddingBottom: 8 }}>
          <ConfirmClearAll
            isDark={isDark}
            label="Delete all files in the workspace root?"
            onConfirm={handleClearAll}
            onCancel={() => setConfirmClearAll(false)}
          />
        </div>
      )}

      {(status === "unavailable" ||
        status === "no_path" ||
        status === "not_found") && (
        <div
          style={{
            margin: "4px 0 12px",
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,160,0,0.08)"
              : "rgba(200,120,0,0.06)",
            border: `1px solid ${isDark ? "rgba(255,160,0,0.18)" : "rgba(200,120,0,0.15)"}`,
            fontSize: 12,
            color: isDark ? "rgba(255,180,60,0.85)" : "rgba(140,80,0,0.9)",
            fontFamily: theme?.font?.fontFamily || "inherit",
          }}
        >
          {status === "no_path" &&
            "No workspace root configured in Runtime settings."}
          {status === "not_found" && `Path not found: ${workspacePath}`}
          {status === "unavailable" &&
            "Runtime size is only available in the desktop app."}
        </div>
      )}

      {status === "ready" && entries.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: "32px 0",
            fontSize: 13,
            color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
            fontFamily: theme?.font?.fontFamily || "inherit",
          }}
        >
          No files found
        </div>
      )}

      {status === "ready" && entries.length > 0 && (
        <div>
          {entries.map((entry) => (
            <RuntimeFileRow
              key={entry.name}
              entry={entry}
              maxSize={maxSize}
              isDark={isDark}
              onDelete={handleDelete}
            />
          ))}
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
      <RuntimeSection isDark={isDark} />
    </div>
  );
};
