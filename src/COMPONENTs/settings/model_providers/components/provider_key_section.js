import { useCallback, useContext, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SettingsSection } from "../../appearance";
import ConfirmDeleteApiKeyModal from "./confirm_delete_api_key_modal";
import { readModelProviders, writeModelProviders } from "../storage";
import { emitModelCatalogRefresh } from "../../../../SERVICEs/model_catalog_refresh";
import { providerSecretConfigured } from "../../../../SERVICEs/provider_secret_status";
import { toast } from "../../../../SERVICEs/toast";
import {
  customProviderKey,
  setCustomProviderSecret,
  removeCustomProviderSecret,
} from "../../../../SERVICEs/custom_provider_store";
import { shippedSiteHost } from "../../../../SERVICEs/shipped_provider_registry";

/**
 * provider_key_section.js — the ONE provider section in Settings → Model
 * Providers (#202).
 *
 * Before this, OpenAI/Anthropic/Gemini rendered `api_key_input.js` and
 * DeepSeek/Kimi rendered `preset_provider_section.js`: two near-duplicate
 * components whose saved states looked different, which is exactly what "ship
 * DeepSeek and Kimi as first-class providers" forbids. Both are replaced here.
 *
 * What differs between a native and a shipped provider is ONLY where the
 * credential is written — the rendered section is identical:
 *
 *   native  — settings.model_providers.<storage_key>, through writeModelProviders
 *             (dual legacy/SQL write, awaited for durable acknowledgement).
 *   shipped — custom_provider_secrets[<slug>], through setCustomProviderSecret,
 *             the same call the custom provider editor makes. A shipped
 *             provider has no stored definition to enable: the store derives
 *             availability from "is a credential configured", so saving the key
 *             is the whole activation and clearing it is the whole deactivation.
 *
 * Form (design pick A3): at rest a configured key is a flat settings row —
 * label left, a fixed mask plus Replace and Clear on the right, no box.
 * Replace shows the 34 px field, which is also the empty state.
 *
 * The mask is fixed (never the key's own characters). In the Phase 4 steady
 * state the secret lives encrypted in SQL and is not readable by the renderer
 * at all, so a "last four characters" tail could only be shown for some
 * providers on some machines. A mask that is sometimes real and sometimes not
 * is worse than one that is never real.
 */

const MASK = "••••••••";

const nativeBackend = ({ storageKey, credentialId, label }) => ({
  isConfigured: () =>
    credentialId
      ? providerSecretConfigured(credentialId)
      : !!readModelProviders()[storageKey],
  write: async (value) => {
    const results = await writeModelProviders({ [storageKey]: value });
    const durable =
      Array.isArray(results) && results.every((r) => r.ok === true);
    if (durable) {
      emitModelCatalogRefresh();
    }
    return durable;
  },
  failureLabel: label,
});

const shippedBackend = ({ slug, label }) => ({
  isConfigured: () => providerSecretConfigured(customProviderKey(slug)),
  write: async (value) => {
    const result = value
      ? await setCustomProviderSecret(slug, value)
      : await removeCustomProviderSecret(slug);
    return !!result && result.ok === true;
  },
  failureLabel: label,
});

/**
 * One provider's credential section.
 *
 * Either `storage_key` (native) or `sites` (shipped) is given, never both.
 * `sites` is the registry's site list: one entry renders no switcher, more than
 * one renders the Platform select (design pick B2) and each site keeps its own
 * independent key.
 */
export const ProviderKeySection = ({
  title,
  icon,
  storage_key,
  credential_id,
  sites,
  placeholder,
}) => {
  const { t } = useTranslation();
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const siteList = Array.isArray(sites) ? sites.filter(Boolean) : [];
  const isShipped = siteList.length > 0;
  const multiSite = siteList.length > 1;

  const [activeSlug, setActiveSlug] = useState(() =>
    isShipped ? siteList[0].slug : "",
  );

  const backend = isShipped
    ? shippedBackend({ slug: activeSlug, label: title })
    : nativeBackend({
        storageKey: storage_key,
        credentialId: credential_id,
        label: title,
      });

  const [seedKey, setSeedKey] = useState(activeSlug);
  const [saved, setSaved] = useState(() => backend.isConfigured());
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Re-seed when the selected platform changes — each site has its own key, so
  // switching must never carry the previous site's state (or its typed value)
  // across. Mirrors the seed-key re-derivation CustomProviderEditor uses.
  if (isShipped && activeSlug !== seedKey) {
    setSeedKey(activeSlug);
    setSaved(providerSecretConfigured(customProviderKey(activeSlug)));
    setValue("");
    setEditing(false);
    setVisible(false);
    setConfirmOpen(false);
  }

  const mutedColor = "var(--pupu-text-faint)";
  const accentColor = "var(--pupu-text-secondary)";

  const handleSave = useCallback(async () => {
    if (busy) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    setBusy(true);
    try {
      const durable = await backend.write(trimmed);
      if (!durable) {
        toast.error(`${title} could not be saved securely. Please try again.`, {
          dedupeKey: `provider_key_save_failed_${title}`,
        });
        return false;
      }
      setValue("");
      setVisible(false);
      setEditing(false);
      setSaved(true);
      toast.success(`${title} saved`, {
        dedupeKey: `provider_key_saved_${title}`,
      });
      return true;
    } catch (_error) {
      toast.error(`${title} could not be saved securely. Please try again.`, {
        dedupeKey: `provider_key_save_failed_${title}`,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }, [backend, busy, title, value]);

  const handleClear = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    try {
      const durable = await backend.write("");
      if (!durable) {
        toast.error(`${title} could not be cleared securely. Please try again.`, {
          dedupeKey: `provider_key_clear_failed_${title}`,
        });
        return false;
      }
      setValue("");
      setVisible(false);
      setEditing(false);
      setSaved(false);
      return true;
    } catch (_error) {
      toast.error(`${title} could not be cleared securely. Please try again.`, {
        dedupeKey: `provider_key_clear_failed_${title}`,
      });
      return false;
    } finally {
      setBusy(false);
    }
  }, [backend, busy, title]);

  const showField = !saved || editing;

  const siteOptions = siteList.map((site) => ({
    value: site.slug,
    label: site.labelKey
      ? `${t(site.labelKey)} · ${shippedSiteHost(site.slug)}`
      : shippedSiteHost(site.slug),
  }));

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
      {editing && (
        <Button
          label={t("common.cancel")}
          onClick={() => {
            setEditing(false);
            setValue("");
            setVisible(false);
          }}
          style={{
            paddingVertical: 2,
            paddingHorizontal: 8,
            borderRadius: 4,
            fontSize: 13,
            hoverBackgroundColor: "var(--pupu-overlay-hover)",
          }}
        />
      )}
      <Button
        label={t("model_providers.save")}
        onClick={handleSave}
        disabled={busy || !value.trim()}
        style={{
          paddingVertical: 2,
          paddingHorizontal: 8,
          borderRadius: 4,
          fontSize: 13,
          opacity: value.trim() ? 1 : 0.35,
          hoverBackgroundColor: "var(--pupu-overlay-hover)",
        }}
      />
    </div>
  );

  return (
    <SettingsSection title={title} icon={icon}>
      <div
        data-testid={`provider-key-section-${isShipped ? siteList[0].slug : storage_key}`}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingTop: 4,
          paddingBottom: 12,
        }}
      >
        {multiSite && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontFamily,
                color: accentColor,
                fontWeight: 500,
              }}
            >
              {t("model_providers.platform")}
            </span>
            <span data-testid="provider-key-platform-select">
              <Select
                options={siteOptions}
                value={activeSlug}
                set_value={setActiveSlug}
                filterable={false}
                style={{
                  minWidth: 190,
                  fontSize: 13,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.05)",
                }}
                dropdown_style={{ width: 224, maxHeight: 220 }}
                option_style={{ height: 24, borderRadius: 14 }}
              />
            </span>
          </div>
        )}

        {showField ? (
          <>
            <span
              style={{
                fontSize: 13,
                fontFamily,
                color: accentColor,
                fontWeight: 500,
              }}
            >
              {t("model_providers.api_key")}
            </span>
            <Input
              label={t("model_providers.api_key")}
              placeholder={placeholder}
              value={value}
              set_value={setValue}
              type={visible ? "text" : "password"}
              postfix_component={PostfixControls}
              style={{ width: "100%", fontSize: 13, height: 34 }}
            />
          </>
        ) : (
          <div
            data-testid="provider-key-saved-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              minHeight: 30,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontFamily,
                color: accentColor,
                fontWeight: 500,
              }}
            >
              {t("model_providers.api_key")}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  fontSize: 13,
                  fontFamily,
                  color: mutedColor,
                  letterSpacing: 2,
                  marginRight: 4,
                }}
              >
                {MASK}
              </span>
              <Button
                label={t("model_providers.replace")}
                onClick={() => {
                  setEditing(true);
                  setValue("");
                }}
                style={{
                  paddingVertical: 2,
                  paddingHorizontal: 8,
                  borderRadius: 4,
                  fontSize: 13,
                  hoverBackgroundColor: "var(--pupu-overlay-hover)",
                }}
              />
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
            </span>
          </div>
        )}

        <span
          style={{
            fontSize: 11,
            fontFamily,
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
          label={
            multiSite ? `${title} (${shippedSiteHost(activeSlug)})` : title
          }
          isDark={isDark}
        />
      </div>
    </SettingsSection>
  );
};

export default ProviderKeySection;
