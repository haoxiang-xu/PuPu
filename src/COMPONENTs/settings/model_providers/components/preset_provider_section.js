import { useContext, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SettingsSection } from "../../appearance";
import ConfirmDeleteApiKeyModal from "./confirm_delete_api_key_modal";
import { readPresetEnvelopes } from "../custom-providers/preset_picker";
import { toast } from "../../../../SERVICEs/toast";
import {
  findCustomProvider,
  addCustomProvider,
  normalizeCustomProvider,
  setCustomProviderEnabled,
  getCustomProviderSecret,
  setCustomProviderSecret,
  removeCustomProviderSecret,
  hasCustomProviderSecret,
} from "../../../../SERVICEs/custom_provider_store";

/**
 * preset_provider_section.js — first-class settings sections for the
 * built-in custom-provider presets (DeepSeek, Kimi). Renders like an
 * official provider section (SettingsSection + a single API-key control),
 * but every mutation is delegated to the SAME custom-provider store /
 * import sequence the Custom Providers preset picker + editor already use
 * (see custom_provider_editor.js handleSave and
 * custom-providers/import_pipeline.js commitImport):
 *
 *   1. definition: findCustomProvider(slug); if missing, resolve the preset
 *      envelope via readPresetEnvelopes(), normalizeCustomProvider() it, and
 *      addCustomProvider({ ...provider, enabled: false, source: "preset" }).
 *      An existing definition (e.g. already imported/edited by the user via
 *      the Custom Providers UI) is never touched.
 *   2. secret: setCustomProviderSecret(slug, trimmed) — this is the exact
 *      store call the editor makes; internally it round-trips through
 *      persistCustomProviderSecret (provider_credential_persistence.js) for
 *      the dual legacy/SQL write. We never call persistCustomProviderSecret
 *      directly.
 *   3. enable: setCustomProviderEnabled(slug, true) only after the secret
 *      write is durably acknowledged (ok === true) — mirrors the editor's
 *      "disabled until credential is confirmed" ordering.
 *
 * Deleting a key removes ONLY the secret (removeCustomProviderSecret), never
 * the provider definition; the provider is disabled afterward (matching the
 * editor's autoEnabled=false-on-empty-key-for-required-auth invariant) so a
 * required-auth provider can never sit enabled with no key.
 */

const awaitDefinitionPersistence = async (result) => {
  const persistence = result?.persistence;
  if (!persistence || typeof persistence.then !== "function") {
    const error = new Error("Provider definition write was not acknowledged");
    error.code = "provider_definition_write_failed";
    throw error;
  }
  await persistence;
};

/** First slug that already has a stored secret, else the first slug. */
const pickInitialSlug = (slugList) => {
  const found = slugList.find((slug) => hasCustomProviderSecret(slug));
  return found || slugList[0] || "";
};

/** Hostname of a preset's base_url (e.g. "api.moonshot.ai"), else the slug itself. */
const derivePillLabel = (slug) => {
  const envelope = readPresetEnvelopes().find((e) => e?.provider?.id === slug);
  const baseUrl = envelope?.provider?.base_url;
  if (typeof baseUrl === "string" && baseUrl) {
    try {
      return new URL(baseUrl).hostname;
    } catch (_error) {
      // fall through to slug
    }
  }
  return slug;
};

const findPresetEnvelope = (slug) =>
  readPresetEnvelopes().find((e) => e?.provider?.id === slug) || null;

export const PresetProviderSection = ({ title, icon, slugs, placeholder }) => {
  const { t } = useTranslation();
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const normalizedSlugs = Array.isArray(slugs) ? slugs.filter(Boolean) : [];
  const multiSite = normalizedSlugs.length > 1;

  const [activeSlug, setActiveSlug] = useState(() =>
    pickInitialSlug(normalizedSlugs),
  );
  const [seedSlug, setSeedSlug] = useState(activeSlug);
  const [value, setValue] = useState(() =>
    hasCustomProviderSecret(activeSlug) ? getCustomProviderSecret(activeSlug) : "",
  );
  const [saved, setSaved] = useState(() => hasCustomProviderSecret(activeSlug));
  const [visible, setVisible] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-seed value/saved when the active slug changes (pill switch). Mirrors
  // the seed-key re-derivation pattern used by CustomProviderEditor.
  if (activeSlug !== seedSlug) {
    const nowSaved = hasCustomProviderSecret(activeSlug);
    setValue(nowSaved ? getCustomProviderSecret(activeSlug) : "");
    setSaved(nowSaved);
    setSeedSlug(activeSlug);
    setJustSaved(false);
    setConfirmOpen(false);
  }

  const mutedColor = "var(--pupu-text-faint)";
  const accentColor = "var(--pupu-text-secondary)";
  const successColor = "#4CAF50";
  const pillActiveBg = "var(--pupu-overlay-active)";
  const pillHoverBg = "var(--pupu-overlay-selected)";
  const pillActiveTxt = "var(--pupu-text-strong)";
  const pillInactiveTxt = isDark
    ? "rgba(255,255,255,0.45)"
    : "rgba(0,0,0,0.42)";
  const activePillBorder = isDark
    ? "rgba(255,255,255,0.15)"
    : "rgba(0,0,0,0.15)";

  const pillLabel = multiSite ? derivePillLabel(activeSlug) : "";
  const deleteLabel = multiSite ? `${title} (${pillLabel})` : title;

  const handleChange = (v) => {
    setValue(v);
    setJustSaved(false);
  };

  const handleSave = async () => {
    if (saving) return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    setSaving(true);
    try {
      let existing = findCustomProvider(activeSlug);
      if (!existing) {
        const envelope = findPresetEnvelope(activeSlug);
        if (!envelope) {
          throw Object.assign(
            new Error(`No preset envelope found for slug: ${activeSlug}`),
            { code: "preset_envelope_missing" },
          );
        }
        const normalized = normalizeCustomProvider(envelope);
        if (!normalized.ok) {
          throw Object.assign(
            new Error("Preset envelope failed normalization"),
            { code: "invalid_provider_definition" },
          );
        }
        const added = addCustomProvider({
          ...normalized.provider,
          enabled: false,
          source: "preset",
        });
        await awaitDefinitionPersistence(added);
        existing = normalized.provider;
      }

      const credentialResult = await setCustomProviderSecret(
        activeSlug,
        trimmed,
      );
      if (!credentialResult || credentialResult.ok !== true) {
        toast.error(t("model_providers.custom.save_failed"), {
          dedupeKey: `preset_provider_credential_failed_${activeSlug}`,
        });
        return false;
      }

      const enabledResult = setCustomProviderEnabled(activeSlug, true);
      await awaitDefinitionPersistence(enabledResult);

      setValue(trimmed);
      setSaved(true);
      setJustSaved(true);
      toast.success(`${title} saved`, {
        dedupeKey: `preset_provider_saved_${activeSlug}`,
      });
      return true;
    } catch (_error) {
      toast.error(t("model_providers.custom.save_failed"), {
        dedupeKey: `preset_provider_save_failed_${activeSlug}`,
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (saving) return false;
    setSaving(true);
    try {
      const credentialResult = await removeCustomProviderSecret(activeSlug);
      if (!credentialResult || credentialResult.ok !== true) {
        toast.error(t("model_providers.custom.save_failed"), {
          dedupeKey: `preset_provider_delete_failed_${activeSlug}`,
        });
        return false;
      }
      const def = findCustomProvider(activeSlug);
      if (def && def.enabled === true) {
        const enabledResult = setCustomProviderEnabled(activeSlug, false);
        await awaitDefinitionPersistence(enabledResult);
      }
      setValue("");
      setSaved(false);
      setJustSaved(false);
      return true;
    } catch (_error) {
      toast.error(t("model_providers.custom.save_failed"), {
        dedupeKey: `preset_provider_delete_failed_${activeSlug}`,
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

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
        label={t("model_providers.save")}
        onClick={handleSave}
        disabled={saving || !value.trim()}
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
        data-testid={`preset-provider-section-${normalizedSlugs[0] || ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingTop: 4,
          paddingBottom: 12,
        }}
      >
        {multiSite && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {normalizedSlugs.map((slug) => {
              const active = slug === activeSlug;
              return (
                <button
                  key={slug}
                  data-testid={`preset-provider-pill-${slug}`}
                  onClick={() => setActiveSlug(slug)}
                  style={{
                    fontSize: 11,
                    fontFamily,
                    fontWeight: 500,
                    padding: "3px 10px",
                    borderRadius: 999,
                    border: `1px solid ${
                      active ? activePillBorder : "transparent"
                    }`,
                    backgroundColor: active ? pillActiveBg : "transparent",
                    color: active ? pillActiveTxt : pillInactiveTxt,
                    cursor: "pointer",
                    outline: "none",
                    transition: "background 0.12s, color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = pillHoverBg;
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {derivePillLabel(slug)}
                </button>
              );
            })}
          </div>
        )}

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
              fontFamily,
              color: accentColor,
              fontWeight: 500,
            }}
          >
            {t("model_providers.api_key")}
          </span>
          {saved && (
            <span
              style={{
                fontSize: 11,
                fontFamily,
                color: successColor,
                opacity: 0.85,
              }}
            >
              ✓ {t("model_providers.saved")}
            </span>
          )}
        </div>

        {saved ? (
          <div
            data-testid="preset-provider-masked-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 34,
              paddingLeft: 10,
              paddingRight: 4,
              borderRadius: 8,
              border: `1px solid ${
                "var(--pupu-overlay-active)"
              }`,
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontFamily,
                color: mutedColor,
                letterSpacing: 2,
              }}
            >
              ••••••••
            </span>
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
          </div>
        ) : (
          <Input
            label={t("model_providers.api_key")}
            placeholder={placeholder}
            value={value}
            set_value={handleChange}
            type={visible ? "text" : "password"}
            postfix_component={PostfixControls}
            style={{ width: "100%", fontSize: 13, height: 34 }}
          />
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
            handleDelete().then((cleared) => {
              if (cleared) setConfirmOpen(false);
            });
          }}
          label={deleteLabel}
          isDark={isDark}
        />
      </div>
    </SettingsSection>
  );
};

export default PresetProviderSection;
