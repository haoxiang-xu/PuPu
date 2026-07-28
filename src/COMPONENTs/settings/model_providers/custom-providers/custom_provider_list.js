import { useContext, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  flushCustomProviderMutations,
  hasCustomProviderSecret,
  removeCustomProvider,
  setCustomProviderEnabled,
} from "../../../../SERVICEs/custom_provider_store";
import ConfirmDeleteProviderModal from "./confirm_delete_provider_modal";
import { toast } from "../../../../SERVICEs/toast";

/** Human protocol badge label. */
const PROTOCOL_LABEL = {
  anthropic: "Anthropic",
  "openai-responses": "OpenAI Responses",
  ollama: "Ollama",
};

/** True when a base_url is http:// pointing at a non-local host (§2.3). */
const isInsecureRemote = (baseUrl) => {
  if (typeof baseUrl !== "string") {
    return false;
  }
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (_error) {
    return false;
  }
  if (parsed.protocol !== "http:") {
    return false;
  }
  return !["localhost", "127.0.0.1", "[::1]", "::1"].includes(parsed.hostname);
};

/**
 * A single custom-provider row. Presentation only: all mutations flow through
 * the store helpers (never localStorage directly) and up through callbacks.
 */
const CustomProviderRow = ({ provider, isDark, onEdit, onExport, onChanged }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mutating, setMutating] = useState(false);

  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const textColor = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.45)";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const badgeBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const warnColor = isDark ? "#fdba74" : "#c2410c";
  const warnBg = isDark ? "rgba(253,186,116,0.14)" : "rgba(194,65,12,0.10)";
  const keyOnColor = "#4CAF50";
  const keyOffColor = mutedColor;

  const enabled = provider.enabled === true;
  const hasKey = hasCustomProviderSecret(provider.id);
  const insecure = isInsecureRemote(provider.base_url);
  const modelCount = Array.isArray(provider.models) ? provider.models.length : 0;

  const toggleEnabled = async () => {
    if (mutating) return;
    setMutating(true);
    try {
      const result = setCustomProviderEnabled(provider.id, !enabled);
      if (!result?.persistence || typeof result.persistence.then !== "function") {
        throw new Error("Provider definition write was not acknowledged");
      }
      await result.persistence;
      onChanged?.();
    } catch (_error) {
      toast.error(t("model_providers.custom.save_failed"), {
        dedupeKey: `custom_provider_toggle_failed_${provider.id}`,
      });
      onChanged?.();
    } finally {
      setMutating(false);
    }
  };

  const confirmDelete = async () => {
    removeCustomProvider(provider.id);
    const results = await flushCustomProviderMutations();
    const failed = results.some((result) => result && result.ok === false);
    onChanged?.();
    if (failed) {
      toast.error(t("model_providers.custom.save_failed"), {
        dedupeKey: `custom_provider_delete_failed_${provider.id}`,
      });
      return;
    }
    setConfirmOpen(false);
  };

  const badgeStyle = {
    fontSize: 10,
    fontFamily,
    fontWeight: 500,
    padding: "1px 7px",
    borderRadius: 999,
    backgroundColor: badgeBg,
    color: mutedColor,
    whiteSpace: "nowrap",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        borderBottom: `1px solid ${borderColor}`,
      }}
    >
      {/* Identity + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 3,
          }}
        >
          <span
            style={{
              fontSize: 13.5,
              fontFamily,
              fontWeight: 500,
              color: textColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {provider.display_name || provider.id}
          </span>
          <span style={badgeStyle}>
            {PROTOCOL_LABEL[provider.protocol] || provider.protocol}
          </span>
          {insecure && (
            <span
              title={t("model_providers.custom.insecure_transport_hint")}
              style={{
                fontSize: 10,
                fontFamily,
                fontWeight: 500,
                padding: "1px 7px",
                borderRadius: 999,
                backgroundColor: warnBg,
                color: warnColor,
                whiteSpace: "nowrap",
              }}
            >
              {t("model_providers.custom.insecure_transport_badge")}
            </span>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11.5,
            fontFamily,
            color: mutedColor,
          }}
        >
          <span
            title={provider.base_url}
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 220,
            }}
          >
            {provider.base_url}
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ whiteSpace: "nowrap" }}>
            {t("model_providers.custom.model_count", { count: modelCount })}
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          {/* Key status dot */}
          <span
            title={
              hasKey
                ? t("model_providers.custom.key_set")
                : t("model_providers.custom.key_unset")
            }
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: hasKey ? keyOnColor : keyOffColor,
                opacity: hasKey ? 0.9 : 0.4,
                flexShrink: 0,
              }}
            />
            <span style={{ whiteSpace: "nowrap" }}>
              {hasKey
                ? t("model_providers.custom.key_set")
                : t("model_providers.custom.key_unset")}
            </span>
          </span>
        </div>
      </div>

      {/* Enabled toggle */}
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={t("model_providers.custom.enabled_label")}
        onClick={toggleEnabled}
        disabled={mutating}
        style={{
          flexShrink: 0,
          width: 34,
          height: 20,
          borderRadius: 999,
          border: "none",
          cursor: "pointer",
          padding: 0,
          position: "relative",
          backgroundColor: enabled
            ? isDark
              ? "rgba(76,175,80,0.55)"
              : "rgba(76,175,80,0.85)"
            : isDark
              ? "rgba(255,255,255,0.14)"
              : "rgba(0,0,0,0.14)",
          transition: "background-color 0.18s ease",
          outline: "none",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: enabled ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            backgroundColor: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
            transition: "left 0.18s cubic-bezier(0.32,1,0.32,1)",
          }}
        />
      </button>

      {/* Edit */}
      <Button
        ariaLabel={t("model_providers.custom.edit")}
        title={t("model_providers.custom.edit")}
        prefix_icon="edit"
        onClick={() => onEdit?.(provider.id)}
        style={{
          paddingVertical: 4,
          paddingHorizontal: 4,
          borderRadius: 6,
          content: { icon: { width: 15, height: 15 } },
          hoverBackgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
        }}
      />

      {/* Export */}
      <Button
        ariaLabel={t("model_providers.custom.export")}
        title={t("model_providers.custom.export")}
        prefix_icon="upload"
        onClick={() => onExport?.(provider.id)}
        style={{
          paddingVertical: 4,
          paddingHorizontal: 4,
          borderRadius: 6,
          content: { icon: { width: 15, height: 15 } },
          hoverBackgroundColor: isDark
            ? "rgba(255,255,255,0.08)"
            : "rgba(0,0,0,0.06)",
        }}
      />

      {/* Delete */}
      <Button
        ariaLabel={t("model_providers.custom.delete")}
        title={t("model_providers.custom.delete")}
        prefix_icon="delete"
        onClick={() => setConfirmOpen(true)}
        style={{
          paddingVertical: 4,
          paddingHorizontal: 4,
          borderRadius: 6,
          content: { icon: { width: 15, height: 15 } },
          hoverBackgroundColor: isDark
            ? "rgba(239,83,80,0.15)"
            : "rgba(239,83,80,0.1)",
        }}
      />

      <ConfirmDeleteProviderModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
        displayName={provider.display_name || provider.id}
        isDark={isDark}
      />
    </div>
  );
};

/**
 * Custom-provider list. `providers` is the already-read definition array;
 * empty renders a compact hint. Row mutations call `onChanged` so the parent
 * re-reads the store.
 */
const CustomProviderList = ({ providers, isDark, onEdit, onExport, onChanged }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const mutedColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.42)";

  if (!Array.isArray(providers) || providers.length === 0) {
    return (
      <div
        style={{
          padding: "18px 0 6px",
          fontSize: 12.5,
          fontFamily,
          color: mutedColor,
          lineHeight: 1.5,
        }}
      >
        {t("model_providers.custom.empty")}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {providers.map((provider) => (
        <CustomProviderRow
          key={provider.id}
          provider={provider}
          isDark={isDark}
          onEdit={onEdit}
          onExport={onExport}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
};

export default CustomProviderList;
export { CustomProviderRow, isInsecureRemote };
