import { useCallback, useContext, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import ConfirmDeleteApiKeyModal from "./confirm_delete_api_key_modal";
import { readModelProviders, writeModelProviders } from "../storage";
import { emitModelCatalogRefresh } from "../../../../SERVICEs/model_catalog_refresh";

const APIKeyInput = ({ storage_key, label, placeholder }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [value, setValue] = useState(
    () => readModelProviders()[storage_key] || "",
  );
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(() => !!readModelProviders()[storage_key]);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState("");

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const accentColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";
  const successColor = "#4CAF50";
  const errorColor = "#EF5350";

  const provider = storage_key.startsWith("openai") ? "openai" : "anthropic";

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    setValidationError("");

    if (trimmed && typeof window.unchainAPI?.validateApiKey === "function") {
      setValidating(true);
      try {
        const result = await window.unchainAPI.validateApiKey(provider, trimmed);
        if (result && !result.valid) {
          console.warn(`[APIKeyInput] ${provider} key validation failed:`, result.error);
          setValidationError(result.error || "Invalid API key");
          setValidating(false);
          return;
        }
      } catch (_err) {
        // IPC call failed (e.g. app not fully ready) — skip validation and allow save
      }
      setValidating(false);
    }

    writeModelProviders({ [storage_key]: trimmed });
    emitModelCatalogRefresh();
    setValue(trimmed);
    setSaved(!!trimmed);
    setJustSaved(true);
  }, [value, storage_key, provider]);

  const handleChange = useCallback((v) => {
    setValue(v);
    setJustSaved(false);
    setValidationError("");
  }, []);

  const handleClear = useCallback(() => {
    writeModelProviders({ [storage_key]: "" });
    emitModelCatalogRefresh();
    setValue("");
    setSaved(false);
    setValidationError("");
  }, [storage_key]);

  const isDirty = value.trim() !== (readModelProviders()[storage_key] || "");

  const PostfixControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
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

      <Button
        label={validating ? "Checking…" : justSaved ? "Saved" : "Save"}
        onClick={handleSave}
        style={{
          paddingVertical: 2,
          paddingHorizontal: 8,
          borderRadius: 4,
          fontSize: 13,
          opacity: isDirty && !validating ? 1 : 0.35,
          hoverBackgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
        }}
      />

      {saved && (
        <Button
          label="Clear"
          onClick={() => setConfirmOpen(true)}
          style={{
            paddingVertical: 2,
            paddingHorizontal: 8,
            borderRadius: 4,
            fontSize: 13,
            hoverBackgroundColor: isDark
              ? "rgba(239,83,80,0.15)"
              : "rgba(239,83,80,0.1)",
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

        {saved && !validationError && (
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

      <Input
        label={label}
        placeholder={placeholder}
        value={value}
        set_value={handleChange}
        type={visible ? "text" : "password"}
        postfix_component={PostfixControls}
        style={{ width: "100%", fontSize: 13, height: 34 }}
      />

      {validationError ? (
        <span
          style={{
            fontSize: 11,
            fontFamily: "Jost",
            color: errorColor,
            lineHeight: 1.4,
          }}
        >
          {validationError}
        </span>
      ) : (
        <span
          style={{
            fontSize: 11,
            fontFamily: "Jost",
            color: mutedColor,
            lineHeight: 1.4,
          }}
        >
          Your key is stored locally and never sent anywhere except the
          provider's API endpoint.
        </span>
      )}

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

export default APIKeyInput;
