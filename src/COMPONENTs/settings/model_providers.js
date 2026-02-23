import { useCallback, useContext, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import { Input } from "../../BUILTIN_COMPONENTs/input/input";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { SettingsSection } from "./appearance";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

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

const OllamaSection = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <SettingsSection title="Ollama" icon="ollama">
      <p
        style={{
          margin: "4px 0 12px",
          fontSize: 13,
          fontFamily: "Jost",
          color: mutedColor,
          lineHeight: 1.5,
        }}
      >
        Ollama runs locally — no API key required.
      </p>
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
