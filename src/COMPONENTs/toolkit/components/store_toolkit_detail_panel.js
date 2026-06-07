import { useContext, useEffect, useMemo, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Code from "../../../BUILTIN_COMPONENTs/code/code";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SOURCE_CONFIG, TRUST_CONFIG } from "../constants";
import {
  entryInstallState,
  setupKindForEntry,
} from "../../../SERVICEs/mcp_install";
import { resolveMcpIcon } from "../../../SERVICEs/mcp_toolkit_store";
import ToolkitIcon, {
  hasTransparentToolkitIconBackground,
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";

/* Pill badge — header status chips (mcp / trust / license) */
const Badge = ({ text, color, bg, fontFamily }) => (
  <span
    style={{
      fontSize: 10,
      fontFamily,
      fontWeight: 500,
      letterSpacing: "0.3px",
      padding: "2px 8px",
      borderRadius: 999,
      backgroundColor: bg,
      color,
      lineHeight: 1.7,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </span>
);

/* Square content tag — matches the Installed toolkit detail panel's tool tags */
const Tag = ({ text, color, bg, fontFamily }) => (
  <span
    style={{
      fontSize: 11.5,
      fontFamily,
      fontWeight: 500,
      color,
      backgroundColor: bg,
      padding: "3px 10px",
      borderRadius: 6,
      whiteSpace: "nowrap",
    }}
  >
    {text}
  </span>
);

/* Section label — matches the Installed panel ("N TOOLS": 11px uppercase muted) */
const SectionTitle = ({ children, color, fontFamily }) => (
  <span
    style={{
      fontSize: 11,
      fontFamily,
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color,
    }}
  >
    {children}
  </span>
);

/* External link — leading link icon, then label */
const ExternalLink = ({ href, children, color, fontFamily }) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer"
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontSize: 12,
      fontFamily,
      fontWeight: 500,
      color,
      textDecoration: "none",
    }}
  >
    <Icon src="link" style={{ width: 13, height: 13 }} color={color} />
    {children}
  </a>
);

const StoreToolkitDetailPanel = ({
  entry,
  isDark,
  onBack,
  installedIds,
  onInstall,
  onOAuthConnect,
  onApproveEntry,
  onRevokeApproval,
  installing = false,
  approvalBusy = false,
  installError = null,
}) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";

  const installState = entry ? entryInstallState(entry, installedIds) : "coming_soon";
  const setupKind = setupKindForEntry(entry);
  const isExternalEntry = Boolean(entry?.externalReview || entry?.source === "mcp_registry");
  const approvalStatus = entry?.approvalStatus || (
    entry?.trustLevel === "external_approved" ? "approved" : "missing"
  );
  const canApproveExternal = isExternalEntry && approvalStatus !== "approved";
  const canRevokeExternal = isExternalEntry && approvalStatus === "approved";
  const hasOAuthRecipe = Boolean(entry?.auth?.oauth);
  const showSecondaryOAuthAction =
    hasOAuthRecipe && installState === "installable" && Boolean(onOAuthConnect);
  const [secretValues, setSecretValues] = useState({});
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  useEffect(() => {
    setSecretValues({});
  }, [entry?.id]);

  useEffect(() => {
    setRiskAcknowledged(false);
  }, [entry?.id, entry?.recipeHash, entry?.review?.recipeHash]);

  const secrets = useMemo(
    () => (Array.isArray(entry?.secrets) ? entry.secrets : []),
    [entry?.secrets],
  );
  const requiredSecrets = useMemo(
    () => secrets.filter((secret) => !secret.optional),
    [secrets],
  );
  const hasRequiredSecrets = requiredSecrets.every((secret) =>
    String(secretValues[secret.key] || "").trim(),
  );
  const requiresSecretInput = ["secrets", "http_secret"].includes(setupKind);
  const missingRequiredSecrets = requiresSecretInput && !hasRequiredSecrets;
  const missingSecretKeys = requiredSecrets
    .filter((secret) => !String(secretValues[secret.key] || "").trim())
    .map((secret) => secret.key)
    .filter(Boolean);
  const review = entry?.review || {};
  const riskLevel = String(review.riskLevel || "").trim();
  const permissionGroups = Array.isArray(review.permissionGroups)
    ? review.permissionGroups
    : [];
  const riskFlags = Array.isArray(review.riskFlags) ? review.riskFlags : [];
  const recipeDiff = Array.isArray(review.recipeDiff) ? review.recipeDiff : [];
  const requiresRiskAcknowledgement =
    canApproveExternal && Boolean(review.requiresAcknowledgement);
  const approveActionEnabled =
    !approvalBusy && (!requiresRiskAcknowledgement || riskAcknowledged);
  const actionLabel = installing
    ? installState === "oauth"
      ? t("toolkit.store_waiting_for_oauth")
      : t("toolkit.store_installing")
    : installState === "installed"
      ? t("toolkit.store_installed")
      : installState === "installable"
        ? missingRequiredSecrets
          ? t("toolkit.store_enter_required_secrets")
          : t("toolkit.store_install")
        : installState === "needs_review"
          ? t("toolkit.store_needs_review_action")
          : installState === "oauth"
            ? t("toolkit.store_connect")
            : t("toolkit.store_coming_soon");
  const actionEnabled =
    !installing &&
    (installState === "oauth" ||
      (installState === "installable" && !missingRequiredSecrets));
  const handleInstall = () => {
    if (!actionEnabled) return;
    if (installState === "oauth") {
      onOAuthConnect?.(entry);
      return;
    }
    if (requiresSecretInput) {
      const cleanedSecrets = {};
      for (const secret of secrets) {
        const value = String(secretValues[secret.key] || "").trim();
        if (value) cleanedSecrets[secret.key] = value;
      }
      onInstall?.(entry, { secrets: cleanedSecrets });
      return;
    }
    onInstall?.(entry);
  };

  if (!entry) return null;

  const sourceConfig = SOURCE_CONFIG[entry.source] || SOURCE_CONFIG.builtin;
  const trustConfig = TRUST_CONFIG[entry.trustLevel] || TRUST_CONFIG.verified;
  const toolkitIcon = resolveMcpIcon(entry);
  const hasFileIcon = isFileToolkitIcon(toolkitIcon);
  const iconWrapBackground = isBuiltinToolkitIcon(toolkitIcon)
    ? toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.05)"
      : "rgba(0,0,0,0.04)";
  const detailIconSize = hasTransparentToolkitIconBackground(iconWrapBackground)
    ? 24
    : 28;

  /* Color tokens aligned with Installed toolkit_detail_panel.js */
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const tagBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const tagColor = isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.45)";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const linkColor = isDark ? "#93c5fd" : "#2563eb";
  const warningBg = isDark ? "rgba(251,146,60,0.14)" : "rgba(251,146,60,0.12)";
  const warningColor = isDark ? "#fdba74" : "#c2410c";

  const transportLabel = `${t(sourceConfig.labelKey)}${
    entry.mcp?.transport ? ` · ${entry.mcp.transport}` : ""
  }`;
  const tools = Array.isArray(entry.tools) ? entry.tools : [];
  const requirements = Array.isArray(entry.prerequisites)
    ? entry.prerequisites
    : [];
  const policy = entry.policySummary || {};
  const oauthRecipe = entry.auth?.oauth || {};
  const commandSummary =
    entry.mcp?.transport === "stdio"
      ? [entry.mcp?.command, ...(entry.mcp?.args || [])].filter(Boolean).join(" ")
      : "";
  const urlSummary = entry.mcp?.transport === "http" ? entry.mcp?.url || "" : "";
  const secretSummary = secrets.map((secret) => secret.key).filter(Boolean).join(", ");
  const oauthSummary = oauthRecipe.provider
    ? [
        oauthRecipe.provider,
        (oauthRecipe.scopes || []).filter(Boolean).join(", "),
      ].filter(Boolean).join(" · ")
    : "";
  const workspaceSummary = [
    entry.workspace?.binding || entry.workspaceBinding,
    entry.workspace?.placeholder || entry.workspacePlaceholder,
  ].filter(Boolean).join(" · ");
  const approvalRiskRows = [
    [t("toolkit.store_review_transport"), entry.mcp?.transport || ""],
    [t("toolkit.store_review_command"), commandSummary],
    [t("toolkit.store_review_url"), urlSummary],
    [t("toolkit.store_review_secrets"), secretSummary],
    [t("toolkit.store_review_oauth"), oauthSummary],
    [t("toolkit.store_review_workspace"), workspaceSummary],
    [t("toolkit.store_review_permissions"), `${policy.defaultEnabledTools || 0} / ${policy.confirmationRequiredTools || 0}`],
    [t("toolkit.store_registry_source"), entry.registryId || entry.registryName || ""],
    [t("toolkit.store_recipe_hash"), entry.recipeHash || ""],
  ].filter(([, value]) => String(value || "").trim());

  const statusChip =
    installState === "installed"
      ? {
          label: t("toolkit.store_installed"),
          color: TRUST_CONFIG.verified.color,
          bg: TRUST_CONFIG.verified.bg,
        }
      : installState === "needs_review"
        ? {
            label: t("toolkit.store_needs_review_action"),
            color: warningColor,
            bg: warningBg,
          }
        : installState === "oauth"
          ? { label: t("toolkit.store_connect"), color: tagColor, bg: tagBg }
          : installState === "coming_soon"
          ? { label: t("toolkit.store_coming_soon"), color: tagColor, bg: tagBg }
          : {
              label: t("toolkit.store_status_available"),
              color: tagColor,
              bg: tagBg,
            };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        fontFamily,
      }}
    >
      {/* ── Fixed header region (does not scroll) ── */}
      <div style={{ flexShrink: 0, paddingRight: 24 }}>
        <div style={{ marginBottom: 12 }}>
          <Button
            prefix_icon="arrow_left"
            onClick={onBack}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.68)",
              paddingVertical: 5,
              paddingHorizontal: 5,
              borderRadius: 8,
              root: {
                background: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.04)",
              },
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.07)",
              activeBackgroundColor: isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.1)",
              content: {
                prefixIconWrap: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 0,
                },
                icon: { width: 14, height: 14 },
              },
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            {hasFileIcon ? (
              <ToolkitIcon
                icon={toolkitIcon}
                size={48}
                fallbackColor={sourceConfig.color}
                style={{ borderRadius: 12 }}
              />
            ) : (
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: iconWrapBackground,
                  flexShrink: 0,
                }}
              >
                <ToolkitIcon
                  icon={toolkitIcon}
                  size={detailIconSize}
                  fallbackColor={sourceConfig.color}
                />
              </div>
            )}

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: textColor,
                  marginBottom: 4,
                }}
              >
                {entry.toolkitName}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: mutedColor,
                  lineHeight: 1.55,
                  marginBottom: 8,
                }}
              >
                {entry.toolkitDescription}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Badge
                  text={transportLabel}
                  color={sourceConfig.color}
                  bg={sourceConfig.bg}
                  fontFamily={fontFamily}
                />
                <Badge
                  text={t(trustConfig.labelKey)}
                  color={trustConfig.color}
                  bg={trustConfig.bg}
                  fontFamily={fontFamily}
                />
                {entry.license && entry.status !== "needs_review" && (
                  <Badge
                    text={entry.license}
                    color={tagColor}
                    bg={tagBg}
                    fontFamily={fontFamily}
                  />
                )}
                {entry.repoFullName && (
                  <Badge
                    text={entry.repoFullName}
                    color={tagColor}
                    bg={tagBg}
                    fontFamily={fontFamily}
                  />
                )}
                {entry.repoStars != null && (
                  <Badge
                    text={`${Number(entry.repoStars).toLocaleString()} stars`}
                    color={tagColor}
                    bg={tagBg}
                    fontFamily={fontFamily}
                  />
                )}
                {entry.externalReview && (
                  <Badge
                    text={[t("toolkit.store_external_registry"), entry.registryName]
                      .filter(Boolean)
                      .join(" · ")}
                    color={warningColor}
                    bg={warningBg}
                    fontFamily={fontFamily}
                  />
                )}
                {riskLevel && (
                  <Badge
                    text={t(`toolkit.store_risk_${riskLevel}`)}
                    color={warningColor}
                    bg={warningBg}
                    fontFamily={fontFamily}
                  />
                )}
                <Badge
                  text={statusChip.label}
                  color={statusChip.color}
                  bg={statusChip.bg}
                  fontFamily={fontFamily}
                />
              </div>
            </div>
          </div>

          <div style={{ flexShrink: 0, textAlign: "right" }}>
            <Button
              label={actionLabel}
              disabled={!actionEnabled}
              onClick={handleInstall}
              style={{
                fontSize: 12,
                color: actionEnabled
                  ? "#fff"
                  : isDark
                    ? "rgba(255,255,255,0.5)"
                    : "rgba(0,0,0,0.4)",
                paddingVertical: 5,
                paddingHorizontal: 16,
                borderRadius: 999,
                root: {
                  background: actionEnabled
                    ? isDark
                      ? "rgba(110,120,240,0.95)"
                      : "#111"
                    : isDark
                      ? "rgba(255,255,255,0.10)"
                      : "#f1f5f9",
                  border: "none",
                },
                state: {
                  disabled: {
                    root: { opacity: 0.55, cursor: "not-allowed" },
                    background: {},
                  },
                },
              }}
            />
            {showSecondaryOAuthAction && (
              <div style={{ marginTop: 6 }}>
                <Button
                  label={t("toolkit.store_connect_oauth")}
                  disabled={installing}
                  onClick={() => onOAuthConnect?.(entry)}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: isDark ? "#93c5fd" : "#2563eb",
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    root: {
                      background: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.045)",
                      border: "none",
                    },
                  }}
                />
              </div>
            )}
            {canApproveExternal && (
              <div style={{ marginTop: 6 }}>
                {requiresRiskAcknowledgement && (
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 6,
                      fontSize: 10.5,
                      color: warningColor,
                      marginBottom: 6,
                      lineHeight: 1.35,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={riskAcknowledged}
                      onChange={(event) =>
                        setRiskAcknowledged(Boolean(event.target.checked))
                      }
                    />
                    {t("toolkit.store_acknowledge_risk")}
                  </label>
                )}
                <Button
                  label={approvalBusy
                    ? t("toolkit.store_approving_entry")
                    : t("toolkit.store_approve_entry")}
                  disabled={!approveActionEnabled}
                  onClick={() =>
                    onApproveEntry?.(entry, {
                      acknowledgedRisk:
                        riskAcknowledged || !requiresRiskAcknowledgement,
                    })
                  }
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: "#fff",
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    root: {
                      background: isDark ? "rgba(245,158,11,0.9)" : "#c2410c",
                      border: "none",
                    },
                    state: {
                      disabled: {
                        root: { opacity: 0.55, cursor: "not-allowed" },
                        background: {},
                      },
                    },
                  }}
                />
              </div>
            )}
            {canRevokeExternal && (
              <div style={{ marginTop: 6 }}>
                <Button
                  label={approvalBusy
                    ? t("toolkit.store_revoking_approval")
                    : t("toolkit.store_revoke_approval")}
                  disabled={approvalBusy}
                  onClick={() => onRevokeApproval?.(entry)}
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: isDark ? "#fdba74" : "#c2410c",
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    root: {
                      background: isDark
                        ? "rgba(251,146,60,0.12)"
                        : "rgba(251,146,60,0.12)",
                      border: "none",
                    },
                  }}
                />
              </div>
            )}
            {installError && (
              <div
                style={{
                  fontSize: 10.5,
                  color: warningColor,
                  marginTop: 5,
                  maxWidth: 170,
                  lineHeight: 1.4,
                }}
              >
                {installError.code === "mcp_workspace_required"
                  ? t("toolkit.store_workspace_required")
                  : t("toolkit.store_install_error")}
              </div>
            )}
            {!installError && missingRequiredSecrets && (
              <div
                style={{
                  fontSize: 10.5,
                  color: warningColor,
                  marginTop: 5,
                  maxWidth: 190,
                  lineHeight: 1.4,
                }}
              >
                {t("toolkit.store_secret_required")}{" "}
                {missingSecretKeys.join(", ")}
              </div>
            )}
          </div>
        </div>

        <div
          style={{ height: 1, backgroundColor: dividerColor, marginTop: 16 }}
        />
      </div>

      {/* ── Scrollable content ── */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "16px 24px 24px 0",
        }}
      >
        {(entry.status === "needs_review" ||
          entry.trustLevel === "needs_review" ||
          entry.trustLevel === "external_review") && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              padding: "10px 12px",
              borderRadius: 8,
              color: warningColor,
              backgroundColor: warningBg,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {t("toolkit.store_needs_review_title")}
            </span>
            <span style={{ fontSize: 11.5, lineHeight: 1.45 }}>
              {entry.approvalInvalidated
                ? t("toolkit.store_approval_stale")
                : t("toolkit.store_needs_review_phase2a")}
            </span>
          </div>
        )}

        {isExternalEntry && approvalRiskRows.length > 0 && (
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: tagBg,
              marginBottom: 16,
            }}
          >
            <SectionTitle color={mutedColor} fontFamily={fontFamily}>
              {t("toolkit.store_approval_risk_summary")}
            </SectionTitle>
            {riskLevel && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge
                  text={t(`toolkit.store_risk_${riskLevel}`)}
                  color={warningColor}
                  bg={warningBg}
                  fontFamily={fontFamily}
                />
                {riskFlags.map((flag) => (
                  <Tag
                    key={flag}
                    text={flag}
                    color={tagColor}
                    bg={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)"}
                    fontFamily={fontFamily}
                  />
                ))}
              </div>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              {approvalRiskRows.map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "96px minmax(0, 1fr)",
                    gap: 8,
                    alignItems: "baseline",
                    fontSize: 11.5,
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ color: mutedColor }}>{label}</span>
                  <span
                    style={{
                      color: textColor,
                      fontFamily,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
            {permissionGroups.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                {permissionGroups.map((group) => (
                  <div
                    key={`${group.kind}-${group.summary}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      paddingTop: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: mutedColor,
                        textTransform: "uppercase",
                      }}
                    >
                      {group.kind}
                      {group.summary ? ` · ${group.summary}` : ""}
                    </span>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(group.items || []).map((item) => (
                        <Tag
                          key={`${group.kind}-${item}`}
                          text={item}
                          color={tagColor}
                          bg={tagBg}
                          fontFamily={fontFamily}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {isExternalEntry && recipeDiff.length > 0 && (
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: warningBg,
              color: warningColor,
              marginBottom: 16,
            }}
          >
            <SectionTitle color={warningColor} fontFamily={fontFamily}>
              {t("toolkit.store_recipe_diff")}
            </SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {recipeDiff.map((item) => (
                <Tag
                  key={`${item.path}-${item.kind}`}
                  text={item.path}
                  color={warningColor}
                  bg={isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.65)"}
                  fontFamily={fontFamily}
                />
              ))}
            </div>
          </section>
        )}

        {(entry.sourceRepo || entry.docsUrl) && (
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            {entry.sourceRepo && (
              <ExternalLink
                href={entry.sourceRepo}
                color={linkColor}
                fontFamily={fontFamily}
              >
                {t("toolkit.store_repository")}
              </ExternalLink>
            )}
            {entry.docsUrl && (
              <ExternalLink
                href={entry.docsUrl}
                color={linkColor}
                fontFamily={fontFamily}
              >
                {t("toolkit.store_docs")}
              </ExternalLink>
            )}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle color={mutedColor} fontFamily={fontFamily}>
              {t("toolkit.store_setup_command")}
            </SectionTitle>
            <Code
              code={entry.setupPreview || entry.mcp?.url || ""}
              language="bash"
            />
          </section>

          {requirements.length > 0 && (
            <section
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <SectionTitle color={mutedColor} fontFamily={fontFamily}>
                {t("toolkit.store_requirements")}
              </SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {requirements.map((item) => (
                  <Tag
                    key={item}
                    text={item}
                    color={tagColor}
                    bg={tagBg}
                    fontFamily={fontFamily}
                  />
                ))}
              </div>
            </section>
          )}

          {secrets.length > 0 && (
            <section
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              <SectionTitle color={mutedColor} fontFamily={fontFamily}>
                {t("toolkit.store_secrets")}
              </SectionTitle>
              {requiresSecretInput && installState === "installable" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {secrets.map((secret) => (
                    <Input
                      key={secret.key}
                      type="password"
                      value={secretValues[secret.key] || ""}
                      set_value={(value) =>
                        setSecretValues((prev) => ({
                          ...prev,
                          [secret.key]: value,
                        }))
                      }
                      placeholder={secret.label || secret.key}
                      style={{
                        width: "100%",
                        fontSize: 12,
                        fontFamily,
                        borderRadius: 7,
                        color: textColor,
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                      }}
                    />
                  ))}
                  {!hasRequiredSecrets && (
                    <span
                      style={{
                        fontSize: 10.5,
                        lineHeight: 1.4,
                        color: warningColor,
                      }}
                    >
                      {t("toolkit.store_secret_required")}
                    </span>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {secrets.map((secret) => (
                  <Tag
                    key={secret.key}
                    text={`${secret.label || secret.key}${
                      secret.optional ? " (optional)" : ""
                    }`}
                    color={tagColor}
                    bg={tagBg}
                    fontFamily={fontFamily}
                  />
                ))}
              </div>
              )}
            </section>
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle color={mutedColor} fontFamily={fontFamily}>
              {tools.length} {t("toolkit.store_tools_count")}
            </SectionTitle>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tools.map((tool) => (
                <Tag
                  key={tool.name}
                  text={`${tool.requiresConfirmation ? "🔒 " : ""}${
                    tool.title || tool.name
                  }`}
                  color={tool.requiresConfirmation ? warningColor : tagColor}
                  bg={tool.requiresConfirmation ? warningBg : tagBg}
                  fontFamily={fontFamily}
                />
              ))}
            </div>
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionTitle color={mutedColor} fontFamily={fontFamily}>
              {t("toolkit.store_permissions")}
            </SectionTitle>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  backgroundColor: tagBg,
                  fontSize: 12,
                  color: tagColor,
                }}
              >
                <strong style={{ color: textColor }}>
                  {policy.defaultEnabledTools || 0}
                </strong>{" "}
                {t("toolkit.store_auto_enabled")}
              </div>
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  backgroundColor: tagBg,
                  fontSize: 12,
                  color: tagColor,
                }}
              >
                <strong style={{ color: textColor }}>
                  {policy.confirmationRequiredTools || 0}
                </strong>{" "}
                {t("toolkit.store_ask_before_run")}
              </div>
            </div>
          </section>
        </div>

        <div
          style={{
            height: 1,
            backgroundColor: dividerColor,
            margin: "18px 0 16px",
          }}
        />

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle color={mutedColor} fontFamily={fontFamily}>
            {t("toolkit.store_about")}
          </SectionTitle>
          <Markdown content={entry.readmeMarkdown || ""} />
        </section>
      </div>
    </div>
  );
};

export default StoreToolkitDetailPanel;
