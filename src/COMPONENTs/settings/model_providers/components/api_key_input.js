import { useCallback, useContext, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import ConfirmDeleteApiKeyModal from "./confirm_delete_api_key_modal";
import { readModelProviders, writeModelProviders } from "../storage";
import { emitModelCatalogRefresh } from "../../../../SERVICEs/model_catalog_refresh";
import { providerSecretConfigured } from "../../../../SERVICEs/provider_secret_status";
import { toast } from "../../../../SERVICEs/toast";

const CREDENTIAL_ID_BY_STORAGE_KEY = Object.freeze({
  openai_api_key: "openai",
  anthropic_api_key: "anthropic",
});

const APIKeyInput = ({ storage_key, label, placeholder }) => {
  const { t } = useTranslation();
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [value, setValue] = useState(
    () => readModelProviders()[storage_key] || "",
  );
  const [visible, setVisible] = useState(false);
  const credentialId = CREDENTIAL_ID_BY_STORAGE_KEY[storage_key] || "";
  const credentialIsConfigured = useCallback(
    () =>
      credentialId
        ? providerSecretConfigured(credentialId)
        : !!readModelProviders()[storage_key],
    [credentialId, storage_key],
  );
  const [saved, setSaved] = useState(credentialIsConfigured);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const mutedColor = "var(--pupu-text-faint)";
  const accentColor = "var(--pupu-text-secondary)";
  const successColor = "#4CAF50";

  const handleSave = useCallback(async () => {
    if (saving) return false;
    const trimmed = value.trim();
    setSaving(true);
    const results = await writeModelProviders({ [storage_key]: trimmed });
    const durable = Array.isArray(results) && results.every((r) => r.ok === true);
    if (!durable) {
      const restored = readModelProviders()[storage_key] || "";
      setValue(restored);
      setSaved(credentialIsConfigured());
      setJustSaved(false);
      toast.error(`${label} could not be saved securely. Please try again.`, {
        dedupeKey: `api_key_save_failed_${storage_key}`,
      });
      setSaving(false);
      return false;
    }
    emitModelCatalogRefresh();
    setValue(trimmed);
    setSaved(!!trimmed);
    setJustSaved(true);
    if (trimmed) {
      toast.success(`${label} saved`, {
        dedupeKey: `api_key_save_${storage_key}`,
      });
    }
    setSaving(false);
    return true;
  }, [value, storage_key, label, saving, credentialIsConfigured]);

  const handleChange = useCallback((v) => {
    setValue(v);
    setJustSaved(false);
  }, []);

  const handleClear = useCallback(async () => {
    if (saving) return false;
    setSaving(true);
    const results = await writeModelProviders({ [storage_key]: "" });
    const durable = Array.isArray(results) && results.every((r) => r.ok === true);
    if (!durable) {
      const restored = readModelProviders()[storage_key] || "";
      setValue(restored);
      setSaved(credentialIsConfigured());
      toast.error(`${label} could not be cleared securely. Please try again.`, {
        dedupeKey: `api_key_clear_failed_${storage_key}`,
      });
      setSaving(false);
      return false;
    }
    emitModelCatalogRefresh();
    setValue("");
    setSaved(false);
    setSaving(false);
    return true;
  }, [storage_key, label, saving, credentialIsConfigured]);

  const isDirty = value.trim() !== (readModelProviders()[storage_key] || "");

  const PostfixControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <Button
        onClick={() => setVisible((v) => !v)}
        style={{
          paddingVertical: 2,
          paddingHorizontal: 4,
          borderRadius: 4,
          hoverBackgroundColor: "var(--pupu-overlay-hover)",
          content: { icon: { width: 16, height: 16 } },
        }}
        prefix_icon={visible ? "eye_closed" : "eye_open"}
      />

      <div
        style={{
          width: 1,
          height: 14,
          backgroundColor: "var(--pupu-overlay-active)",
          marginLeft: 2,
          marginRight: 2,
          flexShrink: 0,
        }}
      />

      <Button
        label={justSaved ? t("model_providers.saved") : t("model_providers.save")}
        onClick={handleSave}
        disabled={saving || !isDirty}
        style={{
          paddingVertical: 2,
          paddingHorizontal: 8,
          borderRadius: 4,
          fontSize: 13,
          opacity: isDirty ? 1 : 0.35,
          hoverBackgroundColor: "var(--pupu-overlay-hover)",
        }}
      />

      {saved && (
        <Button
          label={t("model_providers.clear")}
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
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            color: accentColor,
            fontWeight: 500,
          }}
        >
          {label}
        </span>

        {saved && (
          <span
            style={{
              fontSize: 11,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              color: successColor,
              opacity: 0.85,
            }}
          >
            ✓ {t("model_providers.saved")}
          </span>
        )}
      </div>

      <Input
        label={label}
        placeholder={saved && !value ? "••••••••" : placeholder}
        value={value}
        set_value={handleChange}
        type={visible ? "text" : "password"}
        postfix_component={PostfixControls}
        style={{ width: "100%", fontSize: 13, height: 34 }}
      />

      <span
        style={{
          fontSize: 11,
          fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
          color: mutedColor,
          lineHeight: 1.4,
        }}
      >
        {t("model_providers.key_storage_desc")}
      </span>

      <ConfirmDeleteApiKeyModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          handleClear().then((cleared) => {
            if (cleared) setConfirmOpen(false);
          });
        }}
        label={label}
        isDark={isDark}
      />
    </div>
  );
};

export default APIKeyInput;
