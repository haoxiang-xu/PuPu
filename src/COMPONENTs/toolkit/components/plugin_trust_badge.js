import { useContext, useEffect, useId, useRef, useState } from "react";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { resolvePluginTrust } from "../../../SERVICEs/plugin_trust";

const ORIGIN_KEYS = {
  official: "toolkit.trust_origin_official",
  third_party: "toolkit.trust_origin_third_party",
  unknown: "toolkit.trust_origin_unknown",
};

const STATUS_CONFIG = {
  verified: {
    labelKey: "toolkit.trust_status_verified",
    icon: "verified",
    tone: "verified",
  },
  pending: {
    labelKey: "toolkit.trust_status_pending",
    icon: "calendar",
    tone: "pending",
  },
  unverified: {
    labelKey: "toolkit.trust_status_unverified",
    icon: "question_mark",
    tone: "neutral",
  },
  unknown: {
    labelKey: "toolkit.trust_status_unknown",
    icon: "question_mark",
    tone: "neutral",
  },
};

const ORIGIN_EXPLANATION_KEYS = {
  official: "toolkit.trust_official_explanation",
  third_party: "toolkit.trust_third_party_explanation",
  unknown: "toolkit.trust_unknown_explanation",
};

const STATUS_EXPLANATION_KEYS = {
  pending: "toolkit.trust_pending_explanation",
  unverified: "toolkit.trust_unverified_explanation",
  unknown: "toolkit.trust_unknown_status_explanation",
};

const SCOPE_KEYS = {
  publisher_identity: "toolkit.trust_scope_publisher_identity",
  source_ownership: "toolkit.trust_scope_source_ownership",
  permissions: "toolkit.trust_scope_permissions",
  content: "toolkit.trust_scope_content",
};

const PluginTrustBadge = ({ entry, isDark = false }) => {
  const { t } = useTranslation();
  const { theme } = useContext(ConfigContext) || {};
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const [expansion, setExpansion] = useState({ entry: null, open: false });
  const toggleRef = useRef(null);
  const generatedId = useId();
  const detailsId = `plugin-trust-details-${generatedId.replace(/:/g, "")}`;

  const resolved = resolvePluginTrust(entry) || {};
  const origin = Object.prototype.hasOwnProperty.call(
    ORIGIN_KEYS,
    resolved.origin,
  )
    ? resolved.origin
    : "unknown";
  const status = Object.prototype.hasOwnProperty.call(
    STATUS_CONFIG,
    resolved.status,
  )
    ? resolved.status
    : "unknown";
  const statusConfig = STATUS_CONFIG[status];
  const scope = Array.isArray(resolved.scope)
    ? [
        ...new Set(
          resolved.scope.filter((code) =>
            Object.prototype.hasOwnProperty.call(SCOPE_KEYS, code),
          ),
        ),
      ]
    : [];
  const publisher =
    typeof resolved.publisher === "string" && resolved.publisher.trim()
      ? resolved.publisher.trim()
      : t("toolkit.trust_publisher_unknown");
  const reviewedAt =
    typeof resolved.reviewedAt === "string" ? resolved.reviewedAt.trim() : "";
  const reviewedBy =
    typeof resolved.reviewedBy === "string" ? resolved.reviewedBy.trim() : "";
  const reference =
    typeof resolved.reference === "string" ? resolved.reference.trim() : "";
  const expanded = expansion.open && expansion.entry === entry;

  useEffect(() => {
    setExpansion((current) =>
      current.entry === entry ? current : { entry, open: false },
    );
  }, [entry]);

  const originLabel = t(ORIGIN_KEYS[origin]);
  const statusLabel = t(statusConfig.labelKey);
  const toggleLabel = t("toolkit.trust_toggle", {
    origin: originLabel,
    status: statusLabel,
  });

  const palette = {
    border: isDark
      ? "rgba(var(--pupu-text-rgb),0.18)"
      : "rgba(var(--pupu-text-rgb),0.15)",
    origin: isDark
      ? "rgba(var(--pupu-text-rgb),0.64)"
      : "rgba(var(--pupu-text-rgb),0.60)",
    originOfficial: isDark ? "#9aa8ff" : "#2563eb",
    verified: isDark ? "#9aa8ff" : "#2563eb",
    pending: isDark ? "#f5c66f" : "#a46108",
    neutral: isDark
      ? "rgba(var(--pupu-text-rgb),0.58)"
      : "rgba(var(--pupu-text-rgb),0.54)",
    detailsBackground: isDark
      ? "rgba(var(--pupu-text-rgb),0.055)"
      : "rgba(var(--pupu-text-rgb),0.035)",
    detailsText: isDark
      ? "rgba(var(--pupu-text-rgb),0.66)"
      : "rgba(var(--pupu-text-rgb),0.62)",
    detailsMuted: isDark
      ? "rgba(var(--pupu-text-rgb),0.46)"
      : "rgba(var(--pupu-text-rgb),0.44)",
  };

  const handleToggle = (event) => {
    event.stopPropagation();
    setExpansion((current) => ({
      entry,
      open: !(current.open && current.entry === entry),
    }));
  };

  const handleKeyDown = (event) => {
    if (event.key !== "Escape" || !expanded) return;
    event.preventDefault();
    event.stopPropagation();
    setExpansion({ entry, open: false });
    toggleRef.current?.focus();
  };

  return (
    <span
      data-testid="plugin-trust-badge"
      data-origin={origin}
      data-status={status}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "stretch",
        maxWidth: "100%",
        minWidth: 0,
        fontFamily,
      }}
    >
      <span
        data-testid="plugin-trust-marker"
        style={{
          display: "inline-flex",
          alignItems: "stretch",
          alignSelf: "flex-start",
          maxWidth: "100%",
          minWidth: 0,
          border: `1px solid ${palette.border}`,
          borderRadius: 6,
        }}
      >
        <span
          data-testid="plugin-trust-origin"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minWidth: 0,
            padding: "3px 7px",
            color:
              origin === "official" ? palette.originOfficial : palette.origin,
            fontSize: 10.5,
            fontWeight: 500,
            lineHeight: 1.25,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
          }}
        >
          {originLabel}
        </span>
        <button
          ref={toggleRef}
          type="button"
          data-testid="plugin-trust-toggle"
          aria-label={toggleLabel}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={handleToggle}
          style={{
            appearance: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            minWidth: 0,
            margin: 0,
            padding: "3px 7px",
            border: 0,
            borderLeft: `1px solid ${palette.border}`,
            borderRadius: "0 5px 5px 0",
            background: "transparent",
            color: palette[statusConfig.tone],
            fontFamily,
            fontSize: 10.5,
            fontWeight: 500,
            lineHeight: 1.25,
            textAlign: "left",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            cursor: "pointer",
          }}
        >
          <Icon
            src={statusConfig.icon}
            color={palette[statusConfig.tone]}
            aria-hidden="true"
            style={{ width: 12, height: 12, flexShrink: 0 }}
          />
          <span>{statusLabel}</span>
        </button>
      </span>

      {expanded && (
        <span
          id={detailsId}
          role="region"
          aria-label={t("toolkit.trust_details")}
          data-testid="plugin-trust-details"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            width: "100%",
            minWidth: 0,
            boxSizing: "border-box",
            marginTop: 6,
            padding: "8px 9px",
            border: `1px solid ${palette.border}`,
            borderRadius: 6,
            background: palette.detailsBackground,
            color: palette.detailsText,
            fontSize: 10.5,
            lineHeight: 1.4,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
          }}
        >
          <strong style={{ fontSize: 11, fontWeight: 600 }}>
            {t("toolkit.trust_details")}
          </strong>
          <span>{t(ORIGIN_EXPLANATION_KEYS[origin])}</span>
          {status !== "verified" && (
            <span>{t(STATUS_EXPLANATION_KEYS[status])}</span>
          )}
          <span>{t("toolkit.trust_limits")}</span>
          <span>
            <span style={{ color: palette.detailsMuted }}>
              {t("toolkit.trust_publisher")}:{" "}
            </span>
            {publisher}
          </span>

          {status === "verified" && scope.length > 0 && (
            <span>
              <span
                style={{ display: "block", color: palette.detailsMuted }}
              >
                {t("toolkit.trust_scope")}:
              </span>
              <span
                data-testid="plugin-trust-scope"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "3px 10px",
                }}
              >
                {scope.map((code) => (
                  <span key={code}>• {t(SCOPE_KEYS[code])}</span>
                ))}
              </span>
            </span>
          )}

          {status === "verified" && reviewedBy && (
            <span>
              <span style={{ color: palette.detailsMuted }}>
                {t("toolkit.trust_reviewed_by")}:{" "}
              </span>
              {reviewedBy}
            </span>
          )}
          {status === "verified" && reviewedAt && (
            <span>
              <span style={{ color: palette.detailsMuted }}>
                {t("toolkit.trust_reviewed_at")}:{" "}
              </span>
              {reviewedAt}
            </span>
          )}
          {status === "verified" && reference && (
            <span>
              <span style={{ color: palette.detailsMuted }}>
                {t("toolkit.trust_reference")}:{" "}
              </span>
              {reference}
            </span>
          )}
        </span>
      )}
    </span>
  );
};

export default PluginTrustBadge;
