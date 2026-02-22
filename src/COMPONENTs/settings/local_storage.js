import { useContext, useState, useCallback, useEffect } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { SettingsSection } from "./appearance";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Helpers                                                                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const getByteSize = (str) => new Blob([str]).size;

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const readLocalStorageEntries = () => {
  try {
    const entries = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const value = localStorage.getItem(key) || "";
      const size = getByteSize(key) + getByteSize(value);
      entries.push({ key, size });
    }
    return entries.sort((a, b) => b.size - a.size);
  } catch {
    return [];
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ConfirmDeleteModal — shared confirmation modal                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ConfirmDeleteModal = ({ open, onClose, onConfirm, target, isDark }) => (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 360,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderRadius: 12,
    }}
  >
    {/* Icon */}
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(220,50,50,0.15)"
          : "rgba(220,50,50,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
          fill={isDark ? "rgba(255,100,100,0.85)" : "rgba(200,40,40,0.85)"}
        />
      </svg>
    </div>

    {/* Title */}
    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
        lineHeight: 1.3,
      }}
    >
      Delete this item?
    </div>

    {/* Target name */}
    <div
      style={{
        fontSize: 12,
        fontFamily: "'SF Mono', 'Fira Code', monospace",
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
        padding: "6px 10px",
        borderRadius: 6,
        marginBottom: 24,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
      title={target}
    >
      {target}
    </div>

    {/* Actions */}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label="Cancel"
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label="Delete"
        onClick={onConfirm}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          backgroundColor: isDark
            ? "rgba(220,50,50,0.40)"
            : "rgba(220,50,50,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,50,50,0.58)"
            : "rgba(220,50,50,0.22)",
          color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
        }}
      />
    </div>
  </Modal>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ConfirmResetSettingsModal — warns user that deleting "settings" resets all prefs                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ConfirmResetSettingsModal = ({ open, onClose, onConfirm, isDark }) => (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 380,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderRadius: 12,
    }}
  >
    {/* Icon */}
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(255,160,0,0.13)"
          : "rgba(200,120,0,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z"
          fill={isDark ? "rgba(255,180,60,0.9)" : "rgba(160,100,0,0.9)"}
        />
      </svg>
    </div>

    {/* Title */}
    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
        lineHeight: 1.3,
      }}
    >
      Reset all settings to defaults?
    </div>

    {/* Description */}
    <div
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        marginBottom: 20,
      }}
    >
      Deleting the{" "}
      <span
        style={{
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: 12,
          padding: "1px 6px",
          borderRadius: 4,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(0,0,0,0.05)",
          color: isDark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.55)",
        }}
      >
        settings
      </span>{" "}
      key will restore all preferences — including theme, appearance, and any
      future settings — back to their default values. This cannot be undone.
    </div>

    {/* Actions */}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label="Cancel"
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label="Reset to defaults"
        onClick={onConfirm}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          backgroundColor: isDark
            ? "rgba(220,140,0,0.30)"
            : "rgba(200,120,0,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,140,0,0.48)"
            : "rgba(200,120,0,0.22)",
          color: isDark ? "rgba(255,200,80,1)" : "rgba(140,80,0,1)",
        }}
      />
    </div>
  </Modal>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  StorageBar — visual size indicator                                                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const StorageBar = ({ ratio, isDark }) => (
  <div
    style={{
      width: 64,
      height: 3,
      borderRadius: 99,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      overflow: "hidden",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: `${Math.max(ratio * 100, 3)}%`,
        height: "100%",
        borderRadius: 99,
        backgroundColor: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.30)",
        transition: "width 0.3s ease",
      }}
    />
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  StorageKeyRow — single key row                                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const StorageKeyRow = ({ entry, maxSize, isDark, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ratio = maxSize > 0 ? entry.size / maxSize : 0;

  const isSettings = entry.key === "settings";

  return (
    <>
      {isSettings ? (
        <ConfirmResetSettingsModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onDelete(entry.key);
          }}
          isDark={isDark}
        />
      ) : (
        <ConfirmDeleteModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onDelete(entry.key);
          }}
          target={entry.key}
          isDark={isDark}
        />
      )}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 0",
          borderBottom: `1px solid ${
            isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
          }`,
          transition: "opacity 0.15s",
        }}
      >
        {/* Key name */}
        <div
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
          title={entry.key}
        >
          {entry.key}
        </div>

        {/* Bar + size */}
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
              width: 52,
              textAlign: "right",
              color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.2px",
            }}
          >
            {formatBytes(entry.size)}
          </span>
        </div>

        {/* Delete button */}
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
              content: {
                icon: { width: 11, height: 11 },
              },
            }}
          />
        </div>
      </div>
    </>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Ollama helpers                                                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const OLLAMA_BASE = "http://localhost:11434";

const fetchOllamaModels = async () => {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error("not_running");
  const json = await res.json();
  const models = (json.models || []).map((m) => ({
    name: m.name,
    size: m.size || 0,
  }));
  return models.sort((a, b) => b.size - a.size);
};

const deleteOllamaModel = async (name) => {
  await fetch(`${OLLAMA_BASE}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(5000),
  });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  OllamaModelRow                                                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const OllamaModelRow = ({ model, maxSize, isDark, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ratio = maxSize > 0 ? model.size / maxSize : 0;

  const handleConfirmedDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteOllamaModel(model.name);
      onDelete(model.name);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmedDelete}
        target={model.name}
        isDark={isDark}
      />
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 0",
          borderBottom: `1px solid ${
            isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
          }`,
          opacity: deleting ? 0.4 : 1,
          transition: "opacity 0.2s",
        }}
      >
        {/* Model name */}
        <div
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
          title={model.name}
        >
          {model.name}
        </div>

        {/* Bar + size */}
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
              letterSpacing: "0.2px",
            }}
          >
            {formatBytes(model.size)}
          </span>
        </div>

        {/* Delete button */}
        <div
          style={{
            opacity: hovered && !deleting ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  OllamaSection                                                                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const OllamaSection = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  // status: "loading" | "starting" | "ready" | "offline" | "not_found"
  const [status, setStatus] = useState("loading");
  const [models, setModels] = useState([]);

  const load = useCallback(async () => {
    setStatus("loading");

    /* In Electron, check main-process status first */
    if (window.ollamaAPI) {
      const electronStatus = await window.ollamaAPI.getStatus();
      if (electronStatus === "not_found") {
        setStatus("not_found");
        return;
      }
      if (electronStatus === "checking" || electronStatus === "starting") {
        setStatus("starting");
        /* Poll until it settles */
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
  }, []);

  const handleRestart = useCallback(async () => {
    if (!window.ollamaAPI) return;
    setStatus("starting");
    const result = await window.ollamaAPI.restart();
    if (result === "not_found") {
      setStatus("not_found");
      return;
    }
    await load();
  }, [load]);

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
      {/* Header */}
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
          {status === "loading" && statusPill("loading\u2026")}
          {status === "starting" && statusPill("starting\u2026")}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Restart button — only in Electron and when not already running */}
          {window.ollamaAPI &&
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

      {/* Not installed */}
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

      {/* Starting */}
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
          Starting Ollama in the background\u2026
        </div>
      )}

      {/* Offline */}
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
            {window.ollamaAPI
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

      {/* Model list */}
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
/*  ConfirmClearAll — inline confirmation prompt                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ConfirmClearAll = ({ isDark, onConfirm, onCancel }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 8,
      backgroundColor: isDark ? "rgba(220,50,50,0.12)" : "rgba(220,50,50,0.07)",
      border: `1px solid ${
        isDark ? "rgba(220,50,50,0.25)" : "rgba(220,50,50,0.18)"
      }`,
    }}
  >
    <span
      style={{
        flex: 1,
        fontSize: 12,
        color: isDark ? "rgba(255,120,120,0.9)" : "rgba(180,40,40,0.9)",
      }}
    >
      Clear all local storage?
    </span>
    <Button
      label="Cancel"
      onClick={onCancel}
      style={{
        fontSize: 12,
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 5,
        opacity: 0.7,
      }}
    />
    <Button
      label="Clear"
      onClick={onConfirm}
      style={{
        fontSize: 12,
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 5,
        backgroundColor: isDark
          ? "rgba(220,50,50,0.45)"
          : "rgba(220,50,50,0.15)",
        hoverBackgroundColor: isDark
          ? "rgba(220,50,50,0.6)"
          : "rgba(220,50,50,0.25)",
        color: isDark ? "rgba(255,140,140,1)" : "rgba(180,40,40,1)",
      }}
    />
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  LocalStorageSettings — main page component                                                                                 */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const LocalStorageSettings = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [entries, setEntries] = useState([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => {
    setEntries(readLocalStorageEntries());
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
      {/* System section */}
      <SettingsSection title="System">
        {/* Header row: total + actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 0 6px",
            gap: 12,
          }}
        >
          {/* Summary pills */}
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

          {/* Action buttons */}
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

        {/* Confirm clear all */}
        {confirmClear && (
          <div style={{ paddingBottom: 8 }}>
            <ConfirmClearAll
              isDark={isDark}
              onConfirm={handleClearAll}
              onCancel={() => setConfirmClear(false)}
            />
          </div>
        )}

        {/* Key list */}
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
              />
            ))}
          </div>
        )}
      </SettingsSection>

      <OllamaSection isDark={isDark} />
    </div>
  );
};
