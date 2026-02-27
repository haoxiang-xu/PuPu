import { useCallback, useContext, useEffect, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Services } -------------------------------------------------------------------------------------------------------------- */
import api from "../../SERVICEs/api";
/* { Services } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import { Input } from "../../BUILTIN_COMPONENTs/input/input";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import CellSplitSpinner from "../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import { SettingsSection } from "./appearance";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  _pullStore — module-level singleton so pull progress survives modal close/reopen                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const _pullStore = {
  map: {},
  refs: {},
  listeners: new Set(),
  notify() {
    this.listeners.forEach((fn) => fn({ ...this.map }));
  },
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  set(key, value) {
    this.map = { ...this.map, [key]: value };
    this.notify();
  },
  delete(key) {
    const { [key]: _, ...rest } = this.map;
    this.map = rest;
    this.notify();
  },
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ConfirmDeleteApiKeyModal                                                                                                   */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ConfirmDeleteApiKeyModal = ({
  open,
  onClose,
  onConfirm,
  label,
  isDark,
}) => (
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
        width="36"
        height="36"
        viewBox="0 0 36 36"
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
      Delete API Key?
    </div>

    {/* Subtitle */}
    <div
      style={{
        fontSize: 13,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        marginBottom: 24,
        lineHeight: 1.5,
      }}
    >
      The saved <strong style={{ fontWeight: 600 }}>{label}</strong> key will be
      permanently removed from local storage.
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
/*  localStorage helpers (model_providers section)                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const readModelProviders = () => {
  try {
    const root = JSON.parse(localStorage.getItem("settings") || "{}");
    return root?.model_providers || {};
  } catch {
    return {};
  }
};

const writeModelProviders = (data) => {
  try {
    const root = JSON.parse(localStorage.getItem("settings") || "{}");
    root.model_providers = { ...(root.model_providers || {}), ...data };
    localStorage.setItem("settings", JSON.stringify(root));
  } catch {
    /* ignore write errors */
  }
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  APIKeyInput — floating input with show/hide + save/clear controls                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const APIKeyInput = ({ storage_key, label, placeholder }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  /* ── initialise from localStorage ── */
  const [value, setValue] = useState(
    () => readModelProviders()[storage_key] || "",
  );
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(() => !!readModelProviders()[storage_key]);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const accentColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
  const successColor = "#4CAF50";

  /* ── persist on save ── */
  const handleSave = useCallback(() => {
    const trimmed = value.trim();
    writeModelProviders({ [storage_key]: trimmed });
    setValue(trimmed);
    setSaved(!!trimmed);
    setJustSaved(true);
  }, [value, storage_key]);

  /* ── reset justSaved when user edits again ── */
  const handleChange = useCallback((v) => {
    setValue(v);
    setJustSaved(false);
  }, []);

  /* ── clear key ── */
  const handleClear = useCallback(() => {
    writeModelProviders({ [storage_key]: "" });
    setValue("");
    setSaved(false);
  }, [storage_key]);

  const isDirty = value.trim() !== (readModelProviders()[storage_key] || "");

  /* ── postfix: eye toggle + save + (clear) ── */
  const PostfixControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {/* eye toggle */}
      <Button
        onClick={() => setVisible((v) => !v)}
        style={{
          paddingVertical: 2,
          paddingHorizontal: 4,
          borderRadius: 4,
          hoverBackgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
          content: { icon: { width: 16, height: 16 } },
        }}
        prefix_icon={visible ? "eye_closed" : "eye_open"}
      />

      {/* divider */}
      <div
        style={{
          width: 1,
          height: 14,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.12)"
            : "rgba(0,0,0,0.10)",
          marginLeft: 2,
          marginRight: 2,
          flexShrink: 0,
        }}
      />

      {/* save */}
      <Button
        label={justSaved ? "Saved" : "Save"}
        onClick={handleSave}
        style={{
          paddingVertical: 2,
          paddingHorizontal: 8,
          borderRadius: 4,
          opacity: isDirty ? 1 : 0.35,
          hoverBackgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
        }}
      />

      {/* clear — only when a key is saved */}
      {saved && (
        <Button
          prefix_icon="delete"
          onClick={() => setConfirmOpen(true)}
          style={{
            paddingVertical: 2,
            paddingHorizontal: 4,
            borderRadius: 4,
            hoverBackgroundColor: isDark
              ? "rgba(239,83,80,0.15)"
              : "rgba(239,83,80,0.1)",
            content: { icon: { width: 14, height: 14 } },
          }}
        />
      )}
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        paddingTop: 4,
        paddingBottom: 12,
      }}
    >
      {/* label row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontFamily: "Jost",
            color: accentColor,
            fontWeight: 500,
          }}
        >
          {label}
        </span>

        {/* saved badge */}
        {saved && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "Jost",
              color: successColor,
              opacity: 0.85,
            }}
          >
            ✓ Saved
          </span>
        )}
      </div>

      {/* input */}
      <Input
        label={label}
        placeholder={placeholder}
        value={value}
        set_value={handleChange}
        type={visible ? "text" : "password"}
        postfix_component={PostfixControls}
        style={{ width: "100%", fontSize: 14, height: 38 }}
      />

      {/* hint */}
      <span
        style={{
          fontSize: 11,
          fontFamily: "Jost",
          color: mutedColor,
          lineHeight: 1.4,
        }}
      >
        Your key is stored locally and never sent anywhere except the provider's
        API endpoint.
      </span>

      {/* confirm delete modal */}
      <ConfirmDeleteApiKeyModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          handleClear();
          setConfirmOpen(false);
        }}
        label={label}
        isDark={isDark}
      />
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Provider sections                                                                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const OpenAISection = () => (
  <SettingsSection title="OpenAI" icon="open_ai">
    <APIKeyInput
      storage_key="openai_api_key"
      label="API Key"
      placeholder="sk-..."
    />
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  TAG_COLORS — category → { bg, color } for dark / light                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const TAG_PALETTE = {
  embedding: {
    darkBg: "rgba(139,92,246,0.18)",
    lightBg: "rgba(139,92,246,0.10)",
    color: "#a78bfa",
  },
  vision: {
    darkBg: "rgba(59,130,246,0.18)",
    lightBg: "rgba(59,130,246,0.10)",
    color: "#60a5fa",
  },
  tools: {
    darkBg: "rgba(245,158,11,0.18)",
    lightBg: "rgba(245,158,11,0.10)",
    color: "#fbbf24",
  },
  thinking: {
    darkBg: "rgba(20,184,166,0.18)",
    lightBg: "rgba(20,184,166,0.10)",
    color: "#2dd4bf",
  },
  code: {
    darkBg: "rgba(34,197,94,0.18)",
    lightBg: "rgba(34,197,94,0.10)",
    color: "#4ade80",
  },
  cloud: {
    darkBg: "rgba(148,163,184,0.15)",
    lightBg: "rgba(100,116,139,0.10)",
    color: "#94a3b8",
  },
};

const LIBRARY_CATEGORIES = [
  { label: "All", value: "" },
  { label: "Embedding", value: "embedding" },
  { label: "Vision", value: "vision" },
  { label: "Tools", value: "tools" },
  { label: "Thinking", value: "thinking" },
  { label: "Code", value: "code" },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ModelCard — single model row                                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ModelCard = ({
  model,
  isDark,
  installedNames,
  pullingMap,
  onPull,
  onCancel,
}) => {
  const [selectedSize, setSelectedSize] = useState(model.sizes[0] || "");

  const pullKey = `${model.name}:${selectedSize}`;
  const pullState = pullingMap[pullKey] || null;
  const isInstalled =
    installedNames.has(pullKey) || installedNames.has(model.name);

  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const sizeBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const sizeActiveBg = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  const sizeActiveBorder = isDark
    ? "rgba(255,255,255,0.35)"
    : "rgba(0,0,0,0.35)";
  const barTrack = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const barFill = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor: cardBg,
        padding: "11px 14px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {/* Row 1 — name + category tags */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "Jost",
            color: textColor,
            letterSpacing: "0.1px",
          }}
        >
          {model.name}
        </span>
        {model.tags.map((tag) => {
          const p = TAG_PALETTE[tag];
          if (!p) return null;
          return (
            <span
              key={tag}
              style={{
                fontSize: 10,
                fontFamily: "Jost",
                fontWeight: 500,
                letterSpacing: "0.4px",
                textTransform: "lowercase",
                padding: "1px 6px",
                borderRadius: 999,
                backgroundColor: isDark ? p.darkBg : p.lightBg,
                color: p.color,
                lineHeight: 1.8,
                flexShrink: 0,
              }}
            >
              {tag}
            </span>
          );
        })}
        {model.pulls && (
          <span
            style={{
              fontSize: 11,
              fontFamily: "Jost",
              color: mutedColor,
              marginLeft: "auto",
              flexShrink: 0,
            }}
          >
            ↓ {model.pulls}
          </span>
        )}
      </div>

      {/* Row 2 — description */}
      {model.description && (
        <div
          style={{
            fontSize: 12,
            fontFamily: "Jost",
            color: mutedColor,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {model.description}
        </div>
      )}

      {/* Row 3 — size pills + action */}
      {(model.sizes.length > 0 || isInstalled || pullState) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 2,
          }}
        >
          {model.sizes.map((sz) => (
            <button
              key={sz}
              onClick={() => setSelectedSize(sz)}
              style={{
                fontSize: 11,
                fontFamily: "Jost",
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: 999,
                border: `1px solid ${
                  selectedSize === sz ? sizeActiveBorder : borderColor
                }`,
                backgroundColor: selectedSize === sz ? sizeActiveBg : sizeBg,
                color: selectedSize === sz ? textColor : mutedColor,
                cursor: "pointer",
                transition: "all 0.12s",
                outline: "none",
                lineHeight: 1.8,
              }}
            >
              {sz}
            </button>
          ))}

          {/* action area */}
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            {isInstalled ? (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "Jost",
                  color: "#4ade80",
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                ✓ Installed
              </span>
            ) : pullState ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: 3,
                  minWidth: 120,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "Jost",
                      color: mutedColor,
                    }}
                  >
                    {pullState.status}
                    {pullState.percent !== null ? ` ${pullState.percent}%` : ""}
                  </span>
                  <button
                    onClick={() => onCancel(pullKey)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: mutedColor,
                      fontSize: 13,
                      padding: 0,
                      lineHeight: 1,
                    }}
                    title="Cancel"
                  >
                    ×
                  </button>
                </div>
                <div
                  style={{
                    width: 120,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: barTrack,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 2,
                      backgroundColor: barFill,
                      width: `${pullState.percent ?? 0}%`,
                      transition: "width 0.2s ease",
                    }}
                  />
                </div>
                {pullState.error && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "Jost",
                      color: "rgba(255,100,100,0.85)",
                    }}
                  >
                    {pullState.error}
                  </span>
                )}
              </div>
            ) : selectedSize || model.sizes.length === 0 ? (
              <Button
                label="Pull"
                onClick={() => onPull(model.name, selectedSize || model.name)}
                style={{
                  height: 24,
                  fontSize: 11,
                  padding: "0 12px",
                  borderRadius: 999,
                  fontFamily: "Jost",
                }}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  OllamaLibraryBrowser — searchable, filterable Ollama model browser                                                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const OllamaLibraryBrowser = ({ isDark }) => {
  const [category, setCategory] = useState("");
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [installedNames, setInstalledNames] = useState(new Set());
  // pullingMap is seeded from and synced to the module-level _pullStore
  const [pullingMap, setPullingMap] = useState(() => ({ ..._pullStore.map }));

  // subscribe to _pullStore — keeps UI in sync even after remount
  useEffect(() => _pullStore.subscribe(setPullingMap), []);

  // load installed model names on mount (also re-checks after any pull completes)
  useEffect(() => {
    api.ollama
      .listModels()
      .then((list) => {
        setInstalledNames(new Set(list.map((m) => m.name)));
      })
      .catch(() => {});
  }, []);

  // debounce raw query → debouncedQuery
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(rawQuery.trim()), 400);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // fetch library whenever category or debouncedQuery changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.ollama
      .searchLibrary({ query: debouncedQuery, category })
      .then((result) => {
        if (!cancelled) {
          setModels(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Failed to load models");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [category, debouncedQuery]);

  const handlePull = useCallback((modelName, size) => {
    const fullName = size ? `${modelName}:${size}` : modelName;
    const key = fullName;
    if (_pullStore.refs[key]) return;

    const controller = new AbortController();
    _pullStore.refs[key] = controller;
    _pullStore.set(key, { status: "starting", percent: null, error: null });

    api.ollama
      .pullModel({
        name: fullName,
        signal: controller.signal,
        onProgress: ({ status, percent }) => {
          _pullStore.set(key, {
            status: status || "pulling",
            percent: percent ?? _pullStore.map[key]?.percent ?? null,
            error: null,
          });
        },
      })
      .then(() => {
        delete _pullStore.refs[key];
        _pullStore.delete(key);
        // refresh installed set for any mounted instance
        api.ollama
          .listModels()
          .then((list) => {
            setInstalledNames(new Set(list.map((m) => m.name)));
          })
          .catch(() => {});
      })
      .catch((err) => {
        delete _pullStore.refs[key];
        if (err?.name === "AbortError" || err?.code === "abort") {
          _pullStore.delete(key);
        } else {
          _pullStore.set(key, {
            status: "error",
            percent: null,
            error: err?.message || "Pull failed",
          });
          setTimeout(() => _pullStore.delete(key), 4000);
        }
      });
  }, []);

  const handleCancel = useCallback((key) => {
    _pullStore.refs[key]?.abort();
    delete _pullStore.refs[key];
    _pullStore.delete(key);
  }, []);

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
      {/* category pill bar */}
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

      {/* search input */}
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

      {/* model list */}
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
            <span
              style={{ fontSize: 12, fontFamily: "Jost", color: mutedColor }}
            >
              {error}
            </span>
            <Button
              label="Retry"
              onClick={() => {
                setError(null);
                setLoading(true);
                api.ollama
                  .searchLibrary({ query: debouncedQuery, category })
                  .then((r) => {
                    setModels(r);
                    setLoading(false);
                  })
                  .catch((e) => {
                    setError(e?.message || "Failed to load models");
                    setLoading(false);
                  });
              }}
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ActiveDownloads — live pull progress banner at the top of OllamaSection                                                   */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ActiveDownloads = ({ isDark }) => {
  const [pullingMap, setPullingMap] = useState(() => ({ ..._pullStore.map }));
  useEffect(() => _pullStore.subscribe(setPullingMap), []);

  const entries = Object.entries(pullingMap);
  if (entries.length === 0) return null;

  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const bg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.80)";
  const mutedColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)";
  const barTrack = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const barFill = isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.40)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor: bg,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        margin: "6px 0 10px",
      }}
    >
      {/* header */}
      <div
        style={{
          fontSize: 10,
          fontFamily: "Jost",
          textTransform: "uppercase",
          letterSpacing: "1.4px",
          color: mutedColor,
        }}
      >
        Active Downloads
      </div>

      {entries.map(([key, state]) => {
        const isError = state.status === "error";
        const pct = state.percent ?? 0;
        const isRunning = !isError && state.status !== "starting";

        return (
          <div
            key={key}
            style={{ display: "flex", flexDirection: "column", gap: 4 }}
          >
            {/* row: name + status + cancel */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {/* spinning dot */}
              {!isError && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    backgroundColor: isRunning ? barFill : mutedColor,
                    animation: isRunning
                      ? "pulseDot 1.4s ease-in-out infinite"
                      : "none",
                  }}
                />
              )}
              {isError && (
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    flexShrink: 0,
                    backgroundColor: "rgba(255,100,100,0.75)",
                  }}
                />
              )}

              <span
                style={{
                  fontSize: 12,
                  fontFamily: "Jost",
                  fontWeight: 500,
                  color: isError ? "rgba(255,100,100,0.85)" : textColor,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {key}
              </span>

              <span
                style={{
                  fontSize: 11,
                  fontFamily: "Jost",
                  color: mutedColor,
                  flexShrink: 0,
                }}
              >
                {isError
                  ? state.error
                  : state.percent !== null
                    ? `${state.percent}%`
                    : state.status}
              </span>

              {!isError && (
                <button
                  title="Cancel"
                  onClick={() => {
                    _pullStore.refs[key]?.abort();
                    delete _pullStore.refs[key];
                    _pullStore.delete(key);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: mutedColor,
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>

            {/* progress bar */}
            {!isError && (
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: barTrack,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    backgroundColor: barFill,
                    width: `${pct}%`,
                    transition: "width 0.25s ease",
                  }}
                />
              </div>
            )}
          </div>
        );
      })}

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  OllamaSection                                                                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

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
      {/* divider */}
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

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ModelProvidersSettings — page root                                                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

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
