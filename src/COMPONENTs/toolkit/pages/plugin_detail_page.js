import { useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { SOURCE_CONFIG, STORE_CATEGORY_CONFIG } from "../constants";
import { ToolkitIconFrame } from "../components/toolkit_icon";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { usePluginInstallState } from "../hooks/use_plugin_install_state";
import { setupKindForEntry } from "../../../SERVICEs/mcp_install";
import { dispatchComposerPrefill } from "../../../SERVICEs/composer_prefill";
import api from "../../../SERVICEs/api";
import {
  isToolkitAutoApprove,
  setToolkitAutoApprove,
} from "../../../SERVICEs/toolkit_auto_approve_store";

/* App-Store product page — the unified detail surface for both the
   Installed list and the store (Discover/Categories). Ground truth:
   docs/superpowers/specs/2026-07-13-plugins-appstore-mockup.html, screen 2
   (.dhero / .statrow / .cmdcard / .cando / .inforow). Install/OAuth/toggle/
   delete LOGIC is lifted verbatim from store_toolkit_card.js (via the shared
   usePluginInstallState hook) and toolkit_detail_panel.js's Settings
   section — only the shell around it is new.

   T4b restoration: the secrets sub-form and the external-registry
   approve/revoke workflow were dropped when this page replaced
   store_toolkit_detail_panel.js (Task 3) — both are ported back here
   verbatim (same fields, same onInstall({secrets}) / onApproveEntry /
   onRevokeApproval call shapes as the old panel), restyled to this page's
   section-header language instead of the old panel's uppercase SectionTitle.

   T4c restoration: four more capabilities the parity audit found missing —
   the approvalRiskRows security table + recipe-diff warning (both from
   store_toolkit_detail_panel.js, shown before the approve action), the
   dual-auth secondary "Connect with OAuth" action, the Auto Approve Tools
   toggle (from toolkit_detail_panel.js's Settings section, installed-only —
   the store panel never had it either), and the README markdown section
   (store entries embed it statically; installed entries fetch it via
   api.unchain.getToolkitDetail, same split the old panels used).

   T5 restoration: `ToolkitAutoApproveConfirmModal` and
   `ToolkitDeleteConfirmModal` used to live in (and be imported from)
   toolkit_detail_panel.js — that whole file is retired in T5 along with the
   rest of the legacy toolkit surfaces, so its only two still-live exports
   move here verbatim (copy wording reworded to plugin vocabulary; no
   behavior change — same open/onClose/onConfirm contract, same confirm-then-
   close semantics). */
const ToolkitAutoApproveConfirmModal = ({ open, onClose, onConfirm, isDark }) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 420,
        padding: "28px 28px 20px",
        backgroundColor: isDark ? "var(--pupu-surface, #1a1a1a)" : "var(--pupu-surface, #ffffff)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: isDark ? "rgba(255,160,0,0.13)" : "rgba(200,120,0,0.09)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z"
            fill={isDark ? "rgba(255,180,60,0.9)" : "rgba(160,100,0,0.9)"}
          />
        </svg>
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
          marginBottom: 8,
          lineHeight: 1.3,
        }}
      >
        {t("toolkit.enable_auto_approve_confirm_title")}
      </div>

      <div
        style={{
          fontSize: 13,
          lineHeight: 1.6,
          color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
          marginBottom: 20,
        }}
      >
        {t("toolkit.enable_auto_approve_confirm_body")}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          label={t("common.cancel")}
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
          label={t("toolkit.enable_auto_approve")}
          onClick={() => {
            onConfirm?.();
            onClose?.();
          }}
          style={{
            fontSize: 13,
            paddingVertical: 7,
            paddingHorizontal: 16,
            borderRadius: 7,
            backgroundColor: isDark ? "rgba(220,140,0,0.30)" : "rgba(200,120,0,0.12)",
            hoverBackgroundColor: isDark ? "rgba(220,140,0,0.48)" : "rgba(200,120,0,0.22)",
            color: isDark ? "rgba(255,200,80,1)" : "rgba(140,80,0,1)",
          }}
        />
      </div>
    </Modal>
  );
};

const ToolkitDeleteConfirmModal = ({ open, onClose, onConfirm, isDark, toolkitLabel }) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 360,
        padding: "28px 28px 20px",
        backgroundColor: isDark ? "var(--pupu-surface, #1a1a1a)" : "var(--pupu-surface, #ffffff)",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: isDark ? "rgba(220,50,50,0.15)" : "rgba(220,50,50,0.09)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
          flexShrink: 0,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
            fill={isDark ? "rgba(255,100,100,0.85)" : "rgba(200,40,40,0.85)"}
          />
        </svg>
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
          marginBottom: 8,
          lineHeight: 1.3,
        }}
      >
        {t("toolkit.delete_confirm_title", { name: toolkitLabel })}
      </div>

      <div
        style={{
          fontSize: 13,
          color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        {t("toolkit.delete_confirm_body")}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          label={t("common.cancel")}
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
          label={t("common.delete")}
          onClick={() => {
            onConfirm?.();
            onClose?.();
          }}
          style={{
            fontSize: 13,
            paddingVertical: 7,
            paddingHorizontal: 16,
            borderRadius: 7,
            backgroundColor: isDark ? "rgba(220,50,50,0.40)" : "rgba(220,50,50,0.12)",
            hoverBackgroundColor: isDark ? "rgba(220,50,50,0.58)" : "rgba(220,50,50,0.22)",
            color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
          }}
        />
      </div>
    </Modal>
  );
};

const PluginDetailPage = ({
  presentation,
  entry,
  isDark,
  isBuiltin = false,
  installedIds,
  installing = false,
  forceInstalled = false,
  onInstall,
  onOAuthConnect,
  onCancelOAuth,
  onOpen,
  defaultEnabled = false,
  onToggleAutoEnable,
  onDelete,
  onApproveEntry,
  onRevokeApproval,
  approvalBusy = false,
  installError = null,
  onBack,
  onCloseModal,
}) => {
  const { theme } = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const installMachine = usePluginInstallState({
    entry,
    installedIds,
    installing,
    forceInstalled,
    onInstall,
    onOAuthConnect,
    onCancelOAuth,
    t,
  });

  const secrets = useMemo(
    () => (Array.isArray(entry?.secrets) ? entry.secrets : []),
    [entry?.secrets],
  );
  const requiredSecrets = useMemo(
    () => secrets.filter((secret) => !secret.optional),
    [secrets],
  );
  const setupKind = setupKindForEntry(entry);
  const requiresSecretInput = ["secrets", "http_secret"].includes(setupKind);
  const [secretValues, setSecretValues] = useState({});
  useEffect(() => {
    setSecretValues({});
  }, [entry?.toolkitId]);
  const hasRequiredSecrets = requiredSecrets.every((secret) =>
    String(secretValues[secret.key] || "").trim(),
  );
  const missingRequiredSecrets = requiresSecretInput && !hasRequiredSecrets;

  const isExternalEntry = Boolean(
    entry?.externalReview || entry?.source === "mcp_registry",
  );
  const approvalStatus =
    entry?.approvalStatus ||
    (entry?.trustLevel === "external_approved" ? "approved" : "missing");
  const canApproveExternal = isExternalEntry && approvalStatus !== "approved";
  const canRevokeExternal = isExternalEntry && approvalStatus === "approved";
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  useEffect(() => {
    setRiskAcknowledged(false);
  }, [entry?.id, entry?.recipeHash, entry?.review?.recipeHash]);
  const requiresRiskAcknowledgement =
    canApproveExternal && Boolean(entry?.review?.requiresAcknowledgement);
  const approveActionEnabled =
    !approvalBusy && (!requiresRiskAcknowledgement || riskAcknowledged);

  /* ── Dual-auth secondary OAuth action (ported from
     store_toolkit_detail_panel.js's showSecondaryOAuthAction) — entries that
     install via secrets/http but also carry an OAuth recipe as an
     alternative get a second "Connect with OAuth" action next to the
     primary pill. ── */
  const hasOAuthRecipe = Boolean(entry?.auth?.oauth);
  const showSecondaryOAuthAction =
    hasOAuthRecipe &&
    installMachine.installState === "installable" &&
    Boolean(onOAuthConnect);

  /* ── Approval risk summary (ported from store_toolkit_detail_panel.js's
     approvalRiskRows, ~lines 256-266, and its rendering section) — shown
     before the approve action so an external-registry entry's transport /
     command / secrets / oauth / workspace footprint is visible ahead of the
     click. ── */
  const review = entry?.review || {};
  const riskLevel = String(review.riskLevel || "").trim();
  const permissionGroups = Array.isArray(review.permissionGroups)
    ? review.permissionGroups
    : [];
  const riskFlags = Array.isArray(review.riskFlags) ? review.riskFlags : [];
  const recipeDiff = Array.isArray(review.recipeDiff) ? review.recipeDiff : [];
  const policy = entry?.policySummary || {};
  const oauthRecipe = entry?.auth?.oauth || {};
  const commandSummary =
    entry?.mcp?.transport === "stdio"
      ? [entry.mcp?.command, ...(entry.mcp?.args || [])].filter(Boolean).join(" ")
      : "";
  const urlSummary = entry?.mcp?.transport === "http" ? entry.mcp?.url || "" : "";
  const secretSummary = secrets.map((secret) => secret.key).filter(Boolean).join(", ");
  const oauthSummary = oauthRecipe.provider
    ? [oauthRecipe.provider, (oauthRecipe.scopes || []).filter(Boolean).join(", ")]
        .filter(Boolean)
        .join(" · ")
    : "";
  const workspaceSummary = [
    entry?.workspace?.binding || entry?.workspaceBinding,
    entry?.workspace?.placeholder || entry?.workspacePlaceholder,
  ]
    .filter(Boolean)
    .join(" · ");
  const approvalRiskRows = [
    [t("toolkit.store_review_transport"), entry?.mcp?.transport || ""],
    [t("toolkit.store_review_command"), commandSummary],
    [t("toolkit.store_review_url"), urlSummary],
    [t("toolkit.store_review_secrets"), secretSummary],
    [t("toolkit.store_review_oauth"), oauthSummary],
    [t("toolkit.store_review_workspace"), workspaceSummary],
    [
      t("toolkit.store_review_permissions"),
      `${policy.defaultEnabledTools || 0} / ${policy.confirmationRequiredTools || 0}`,
    ],
    [t("toolkit.store_registry_source"), entry?.registryId || entry?.registryName || ""],
    [t("toolkit.store_recipe_hash"), entry?.recipeHash || ""],
  ].filter(([, value]) => String(value || "").trim());

  /* ── Auto Approve Tools (ported from toolkit_detail_panel.js's Settings
     section) — only meaningful once the plugin is actually installed;
     store_toolkit_detail_panel.js never had this control either, so it's
     gated the same way the old app split it across the two panels. ── */
  const toolList = useMemo(
    () => (Array.isArray(entry?.tools) ? entry.tools : []),
    [entry?.tools],
  );
  const [autoApprove, setAutoApprove] = useState(() =>
    isToolkitAutoApprove(entry?.toolkitId),
  );
  const [showApproveAutoConfirm, setShowApproveAutoConfirm] = useState(false);
  useEffect(() => {
    setAutoApprove(isToolkitAutoApprove(entry?.toolkitId));
  }, [entry?.toolkitId]);
  const handleAutoApproveToggle = (val) => {
    if (val) {
      setShowApproveAutoConfirm(true);
      return;
    }
    const toolNames = toolList.map((tool) => tool.name || tool.title || "");
    setToolkitAutoApprove(entry?.toolkitId, false, toolNames);
    setAutoApprove(false);
  };
  const confirmAutoApprove = () => {
    const toolNames = toolList.map((tool) => tool.name || tool.title || "");
    setToolkitAutoApprove(entry?.toolkitId, true, toolNames);
    setAutoApprove(true);
  };

  /* ── README markdown (ported from toolkit_detail_panel.js) — store entries
     already embed readmeMarkdown statically (mcp_toolkit_registry.json);
     installed entries (builtin/local/already-installed mcp) need the
     dedicated getToolkitDetail fetch the old installed panel used, since the
     catalog listing itself never carries the full markdown body. ── */
  const [readmeState, setReadmeState] = useState(() => ({
    loading: false,
    content: entry?.readmeMarkdown || "",
  }));
  useEffect(() => {
    if (entry?.readmeMarkdown) {
      setReadmeState({ loading: false, content: entry.readmeMarkdown });
      return undefined;
    }
    const toolkitId = entry?.toolkitId;
    if (!toolkitId) {
      setReadmeState({ loading: false, content: "" });
      return undefined;
    }
    let cancelled = false;
    setReadmeState({ loading: true, content: "" });
    api.unchain
      .getToolkitDetail(toolkitId, null)
      .then((payload) => {
        if (!cancelled) {
          setReadmeState({ loading: false, content: payload?.readmeMarkdown || "" });
        }
      })
      .catch(() => {
        if (!cancelled) setReadmeState({ loading: false, content: "" });
      });
    return () => {
      cancelled = true;
    };
  }, [entry?.toolkitId, entry?.readmeMarkdown]);

  if (!presentation) return null;

  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const tertiaryColor = isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.35)";
  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const cardBg = isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.03)";
  const cardBorder = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
  const chipColor = isDark ? "#7c8cf8" : "#2563eb";
  const chipBg = isDark ? "rgba(124,140,248,0.12)" : "rgba(37,99,235,0.08)";
  const checkColor = "#4cbe8b";
  const dangerColor = "#E5484D";
  /* Warning tokens ported verbatim from store_toolkit_detail_panel.js —
     used for the needs-review approve affordance and the revoke action. */
  const warningBg = isDark ? "rgba(251,146,60,0.14)" : "rgba(251,146,60,0.12)";
  const warningColor = isDark ? "#fdba74" : "#c2410c";

  const sourceConfig = SOURCE_CONFIG[entry?.source] || SOURCE_CONFIG.builtin;
  const sourceBadge = presentation.sourceBadge || { label: "", color: sourceConfig.color };
  const categoryConfig = STORE_CATEGORY_CONFIG.find(
    (c) => c.key === presentation.category,
  );
  const categoryLabel = categoryConfig
    ? t(categoryConfig.labelKey)
    : presentation.category
      ? presentation.category.charAt(0).toUpperCase() + presentation.category.slice(1)
      : "";
  const providerName = entry?.source === "builtin" ? "PuPu" : sourceBadge.label;

  /* Permissions stat only has real data for workspace-scoped plugins — we
     don't fabricate a permission taxonomy for the rest, so the cell is
     omitted rather than duplicating the Information section's confirmation
     row text (which already covers per-command confirmation requirements). */
  const permissionsValue =
    entry?.requiresWorkspace || entry?.workspace?.required
      ? t("toolkit.store_category_workspace")
      : "";
  const versionValue = entry?.version || "";

  const stats = [
    { key: "stat_source", label: t("toolkit.stat_source"), value: sourceBadge.label, color: sourceBadge.color },
    { key: "stat_commands", label: t("toolkit.stat_commands"), value: String(presentation.commandCount ?? 0) },
    { key: "stat_category", label: t("toolkit.stat_category"), value: categoryLabel },
    { key: "stat_permissions", label: t("toolkit.store_permissions"), value: permissionsValue },
    { key: "stat_version", label: t("toolkit.stat_version"), value: versionValue },
  ].filter((stat) => Boolean(stat.value));

  const pillIsOpen = installMachine.installState === "installed";
  /* M-a: the shell never wires an onOpen handler (there is nothing to
     "open" for an installed plugin — no separate window/view). Rendering
     the pill as enabled anyway made it look actionable while silently
     doing nothing on click. Only treat OPEN as a real (enabled) action when
     a caller actually supplied onOpen; otherwise it's a quiet, disabled
     label — same visual language the old "Installed" state used. */
  const pillEnabled = pillIsOpen
    ? Boolean(onOpen)
    : installMachine.canInstall &&
      !installMachine.installing &&
      !missingRequiredSecrets;
  const showOauthCancel =
    installMachine.installing && installMachine.installState === "oauth";

  /* Install/OAuth error surfacing (review I3) — ported from
     store_toolkit_detail_panel.js's installErrorText, including the
     mcp_workspace_required special case. */
  const installErrorText = installError
    ? installError.code === "mcp_workspace_required"
      ? t("toolkit.store_workspace_required")
      : installError.message || t("toolkit.store_install_error")
    : "";

  const handlePillClick = () => {
    if (pillIsOpen) {
      onOpen?.();
      return;
    }
    if (!installMachine.canInstall) return;
    /* Secrets-backed entries never go through usePluginInstallState's plain
       onInstall(entry) — the save path needs the cleaned {secrets} payload,
       same shape store_toolkit_detail_panel.js's handleInstall built. */
    if (requiresSecretInput) {
      if (missingRequiredSecrets) return;
      const cleanedSecrets = {};
      for (const secret of secrets) {
        const value = String(secretValues[secret.key] || "").trim();
        if (value) cleanedSecrets[secret.key] = value;
      }
      onInstall?.(entry, { secrets: cleanedSecrets });
      return;
    }
    installMachine.onInstall();
  };

  const handleTryCommand = (command) => {
    dispatchComposerPrefill(`${command.name} `);
    onCloseModal?.();
  };

  const toolkitLabel = presentation.name || entry?.toolkitId || "";

  const inforows = Array.isArray(presentation.information) ? presentation.information : [];
  const commands = Array.isArray(presentation.commands) ? presentation.commands : [];
  const canDo = Array.isArray(presentation.canDo) ? presentation.canDo : [];

  const subtitle = [presentation.tagline, categoryLabel, providerName && `by ${providerName}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flexShrink: 0, paddingRight: 24 }}>
        <div style={{ marginBottom: 16 }}>
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
              root: { background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)" },
              hoverBackgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
              activeBackgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)",
              content: {
                prefixIconWrap: { display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 },
                icon: { width: 14, height: 14 },
              },
            }}
          />
        </div>
      </div>

      <div
        className="scrollable"
        style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px 0" }}
      >
        {/* ── dhero ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "6px 0 20px",
            borderBottom: `1px solid ${dividerColor}`,
          }}
        >
          <ToolkitIconFrame
            icon={entry?.toolkitIcon}
            isDark={isDark}
            size={72}
            iconSize={36}
            borderRadius={17}
            fallbackColor={sourceConfig.color}
            style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.35)" }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", fontFamily, color: textColor }}>
              {toolkitLabel}
            </div>
            {subtitle && (
              <div style={{ fontSize: 12.5, color: mutedColor, marginTop: 2, fontFamily }}>{subtitle}</div>
            )}
          </div>

          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {installMachine.installing && (
                <ArcSpinner
                  size={12}
                  stroke_width={2}
                  color={isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)"}
                />
              )}
              <Button
                label={installMachine.stateLabel}
                disabled={!pillEnabled}
                onClick={handlePillClick}
                style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  fontFamily,
                  paddingVertical: 6,
                  paddingHorizontal: 18,
                  borderRadius: 999,
                  color: pillIsOpen ? (isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)") : "#fff",
                  root: {
                    background: pillIsOpen
                      ? isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)"
                      : "#4a5bd8",
                    boxShadow: pillIsOpen ? "none" : "0 6px 18px rgba(74,91,216,0.4)",
                  },
                  state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} } },
                }}
              />
            </div>
            {showOauthCancel && (
              <Button
                label={t("toolkit.store_cancel")}
                onClick={installMachine.onCancelOauth}
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  fontFamily,
                  color: mutedColor,
                  paddingVertical: 3,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  root: { background: "transparent" },
                }}
              />
            )}
            {showSecondaryOAuthAction && (
              <Button
                label={t("toolkit.store_connect_oauth")}
                disabled={installMachine.installing}
                onClick={() => onOAuthConnect?.(entry)}
                style={{
                  fontSize: 10.5,
                  fontWeight: 500,
                  fontFamily,
                  color: isDark ? "#93c5fd" : "#2563eb",
                  paddingVertical: 3,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  root: {
                    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.045)",
                  },
                  state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} } },
                }}
              />
            )}
            {installErrorText && (
              <div
                style={{
                  fontSize: 10.5,
                  color: warningColor,
                  maxWidth: 190,
                  lineHeight: 1.4,
                  textAlign: "right",
                  fontFamily,
                }}
              >
                {installErrorText}
              </div>
            )}
          </div>
        </div>

        {/* ── stat row ── */}
        {stats.length > 0 && (
          <div style={{ display: "flex", padding: "14px 0", borderBottom: `1px solid ${dividerColor}` }}>
            {stats.map((stat, idx) => (
              <div
                key={stat.key}
                style={{
                  flex: 1,
                  textAlign: "center",
                  borderRight: idx === stats.length - 1 ? "none" : `1px solid ${dividerColor}`,
                }}
              >
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: tertiaryColor, fontFamily }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: stat.color || mutedColor, marginTop: 2, fontFamily }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Commands ── */}
        {commands.length > 0 && (
          <div style={{ margin: "20px 0 0" }}>
            <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10, color: textColor, fontFamily }}>
              {t("toolkit.section_commands")}
            </span>
            {commands.map((command) => (
              <div
                key={command.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  borderRadius: 12,
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  padding: "12px 14px",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 13,
                    fontWeight: 600,
                    color: chipColor,
                    background: chipBg,
                    borderRadius: 8,
                    padding: "5px 11px",
                    flexShrink: 0,
                  }}
                >
                  {command.name}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {command.title && (
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)", fontFamily }}>
                      {command.title}
                    </div>
                  )}
                  {command.description && (
                    <div style={{ fontSize: 11, color: mutedColor, marginTop: 1, fontFamily }}>{command.description}</div>
                  )}
                </div>
                <Button
                  label={t("toolkit.try_in_chat")}
                  onClick={() => handleTryCommand(command)}
                  style={{
                    fontSize: 11,
                    fontFamily,
                    color: mutedColor,
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    flexShrink: 0,
                    root: { background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)" },
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {/* ── What it can do ── */}
        {canDo.length > 0 && (
          <div style={{ margin: "20px 0 0" }}>
            <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10, color: textColor, fontFamily }}>
              {t("toolkit.section_can_do")}
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px" }}>
              {canDo.map((item, idx) => (
                <div
                  key={`${item}-${idx}`}
                  style={{ fontSize: 12, color: mutedColor, paddingLeft: 20, position: "relative", lineHeight: 1.5, fontFamily }}
                >
                  <span style={{ position: "absolute", left: 0, color: checkColor, fontWeight: 700 }} aria-hidden="true">
                    {"✓"}
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Secrets (ported from store_toolkit_detail_panel.js) ── */}
        {secrets.length > 0 && (
          <div style={{ margin: "20px 0 0" }}>
            <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10, color: textColor, fontFamily }}>
              {t("toolkit.section_secrets")}
            </span>
            {requiresSecretInput && installMachine.installState === "installable" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {secrets.map((secret) => (
                  <Input
                    key={secret.key}
                    type="password"
                    value={secretValues[secret.key] || ""}
                    set_value={(value) =>
                      setSecretValues((prev) => ({ ...prev, [secret.key]: value }))
                    }
                    placeholder={secret.label || secret.key}
                    style={{
                      width: "100%",
                      fontSize: 12,
                      fontFamily,
                      borderRadius: 10,
                      color: textColor,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                    }}
                  />
                ))}
                {!hasRequiredSecrets && (
                  <span style={{ fontSize: 10.5, lineHeight: 1.4, color: warningColor, fontFamily }}>
                    {t("toolkit.store_secret_required")}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {secrets.map((secret) => (
                  <span
                    key={secret.key}
                    style={{
                      fontSize: 11.5,
                      fontFamily,
                      fontWeight: 500,
                      color: mutedColor,
                      backgroundColor: cardBg,
                      border: `1px solid ${cardBorder}`,
                      padding: "5px 12px",
                      borderRadius: 999,
                    }}
                  >
                    {secret.label || secret.key}
                    {secret.optional ? " (optional)" : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Information ── */}
        {inforows.length > 0 && (
          <div style={{ margin: "20px 0 0" }}>
            <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10, color: textColor, fontFamily }}>
              {t("toolkit.section_information")}
            </span>
            {inforows.map((row) => (
              <div
                key={row.k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  padding: "8px 0",
                  borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
                  fontFamily,
                }}
              >
                <span style={{ color: tertiaryColor }}>{row.k}</span>
                <span style={{ color: mutedColor }}>{row.v}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Approval risk summary (ported from store_toolkit_detail_panel.js's
             approvalRiskRows table) — placed right before the Danger zone's
             approve action so the transport/command/secrets/oauth/workspace
             footprint is the last thing a user reads before approving. ── */}
        {isExternalEntry && approvalRiskRows.length > 0 && (
          <div
            style={{
              margin: "20px 0 0",
              padding: "12px 14px",
              borderRadius: 12,
              background: cardBg,
              border: `1px solid ${cardBorder}`,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10, color: textColor, fontFamily }}>
              {t("toolkit.store_approval_risk_summary")}
            </span>
            {riskLevel && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily,
                    color: warningColor,
                    background: warningBg,
                    borderRadius: 999,
                    padding: "3px 10px",
                  }}
                >
                  {t(`toolkit.store_risk_${riskLevel}`)}
                </span>
                {riskFlags.map((flag) => (
                  <span
                    key={flag}
                    style={{
                      fontSize: 11,
                      fontFamily,
                      color: mutedColor,
                      background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)",
                      borderRadius: 999,
                      padding: "3px 10px",
                    }}
                  >
                    {flag}
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                    fontFamily,
                  }}
                >
                  <span style={{ color: tertiaryColor }}>{label}</span>
                  <span style={{ color: mutedColor, overflowWrap: "anywhere" }}>{value}</span>
                </div>
              ))}
            </div>
            {permissionGroups.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {permissionGroups.map((group) => (
                  <div key={`${group.kind}-${group.summary}`} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 10.5, color: tertiaryColor, fontFamily, textTransform: "uppercase" }}>
                      {group.kind}
                      {group.summary ? ` · ${group.summary}` : ""}
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(group.items || []).map((item) => (
                        <span
                          key={`${group.kind}-${item}`}
                          style={{
                            fontSize: 11,
                            fontFamily,
                            color: mutedColor,
                            background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)",
                            borderRadius: 6,
                            padding: "3px 9px",
                          }}
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isExternalEntry && recipeDiff.length > 0 && (
          <div
            style={{
              margin: "12px 0 0",
              padding: "12px 14px",
              borderRadius: 12,
              background: warningBg,
              color: warningColor,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 8, color: warningColor, fontFamily }}>
              {t("toolkit.store_recipe_diff")}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {recipeDiff.map((item) => (
                <span
                  key={`${item.path}-${item.kind}`}
                  style={{
                    fontSize: 11,
                    fontFamily,
                    color: warningColor,
                    background: isDark ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.65)",
                    borderRadius: 6,
                    padding: "3px 9px",
                  }}
                >
                  {item.path}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Danger zone: approve/revoke + auto-enable + auto-approve +
             delete (approve/revoke ported from store_toolkit_detail_panel.js,
             auto-enable/auto-approve/delete from toolkit_detail_panel.js
             Settings) ── */}
        <div style={{ margin: "20px 0 0" }}>
          {canApproveExternal && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: "10px 0",
                borderBottom: `1px solid ${dividerColor}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: warningColor, fontFamily }}>
                    {t("toolkit.store_needs_review_action")}
                  </div>
                  <div style={{ fontSize: 11, color: mutedColor, marginTop: 1, fontFamily }}>
                    {t("toolkit.store_needs_review_phase2a")}
                  </div>
                </div>
                <Button
                  label={approvalBusy ? t("toolkit.store_approving_entry") : t("toolkit.store_approve_entry")}
                  disabled={!approveActionEnabled}
                  onClick={() =>
                    onApproveEntry?.(entry, {
                      acknowledgedRisk: riskAcknowledged || !requiresRiskAcknowledgement,
                    })
                  }
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily,
                    color: warningColor,
                    paddingVertical: 6,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    flexShrink: 0,
                    root: { background: warningBg, border: "none" },
                    state: { disabled: { root: { opacity: 0.55, cursor: "not-allowed" }, background: {} } },
                  }}
                />
              </div>
              {requiresRiskAcknowledgement && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10.5,
                    color: warningColor,
                    lineHeight: 1.35,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={riskAcknowledged}
                    onChange={(event) => setRiskAcknowledged(Boolean(event.target.checked))}
                  />
                  {t("toolkit.store_acknowledge_risk")}
                </label>
              )}
            </div>
          )}

          {canRevokeExternal && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: `1px solid ${dividerColor}`,
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: textColor, fontFamily }}>
                  {t("toolkit.store_revoke_approval")}
                </div>
              </div>
              <Button
                label={approvalBusy ? t("toolkit.store_revoking_approval") : t("toolkit.store_revoke_approval")}
                disabled={approvalBusy}
                onClick={() => onRevokeApproval?.(entry)}
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily,
                  color: warningColor,
                  paddingVertical: 6,
                  paddingHorizontal: 14,
                  borderRadius: 999,
                  flexShrink: 0,
                  root: { background: warningBg, border: "none" },
                  state: { disabled: { root: { opacity: 0.55, cursor: "not-allowed" }, background: {} } },
                }}
              />
            </div>
          )}

          {/* I6: only meaningful once the plugin is actually installed AND a
              caller wired up the toggle — store/Discover details for a
              not-yet-installed entry used to show this row too, where
              toggling it silently did nothing (no onToggleAutoEnable). */}
          {pillIsOpen && onToggleAutoEnable && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: `1px solid ${dividerColor}`,
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: textColor, fontFamily }}>
                  {t("toolkit.auto_enable_label")}
                </div>
                <div style={{ fontSize: 11, color: mutedColor, marginTop: 1, fontFamily }}>
                  {t("toolkit.auto_enable_desc")}
                </div>
              </div>
              <SemiSwitch
                on={Boolean(defaultEnabled)}
                set_on={(val) => onToggleAutoEnable?.(entry?.toolkitId, val)}
                style={{ width: 44, height: 25 }}
              />
            </div>
          )}

          {/* Auto Approve Tools — only meaningful once installed (pillIsOpen),
              same split as the old app: the store panel never had this
              control, only the installed toolkit_detail_panel.js did. */}
          {pillIsOpen && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: `1px solid ${dividerColor}`,
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: textColor, fontFamily }}>
                  {t("toolkit.auto_approve_plugin_label")}
                </div>
                <div style={{ fontSize: 11, color: mutedColor, marginTop: 1, fontFamily }}>
                  {t("toolkit.auto_approve_plugin_desc")}
                </div>
              </div>
              <SemiSwitch
                on={autoApprove}
                set_on={handleAutoApproveToggle}
                style={{ width: 44, height: 25, backgroundColor_on: "#E5484D" }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 0",
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: dangerColor, fontFamily }}>
                {t("toolkit.delete_label")}
              </div>
              <div style={{ fontSize: 11, color: mutedColor, marginTop: 1, fontFamily }}>
                {isBuiltin ? t("toolkit.delete_desc_builtin") : t("toolkit.delete_desc")}
              </div>
            </div>
            <Button
              prefix_icon="delete"
              label={t("toolkit.delete_label")}
              disabled={isBuiltin}
              onClick={() => {
                if (!isBuiltin) setShowDeleteConfirm(true);
              }}
              style={{
                fontSize: 12,
                fontWeight: 500,
                fontFamily,
                color: isBuiltin ? (isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)") : dangerColor,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 7,
                gap: 5,
                flexShrink: 0,
                root: { background: "transparent", border: "none" },
                hoverBackgroundColor: isDark ? "rgba(229,72,77,0.14)" : "rgba(229,72,77,0.10)",
                activeBackgroundColor: isDark ? "rgba(229,72,77,0.22)" : "rgba(229,72,77,0.16)",
                content: { icon: { width: 14, height: 14 } },
                state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} } },
              }}
            />
          </div>
        </div>

        <ToolkitDeleteConfirmModal
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={() => onDelete?.(entry?.toolkitId)}
          isDark={isDark}
          toolkitLabel={toolkitLabel}
        />

        <ToolkitAutoApproveConfirmModal
          open={showApproveAutoConfirm}
          onClose={() => setShowApproveAutoConfirm(false)}
          onConfirm={confirmAutoApprove}
          isDark={isDark}
        />

        {/* ── README (ported from toolkit_detail_panel.js) ── */}
        <div style={{ margin: "20px 0 0" }}>
          <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 10, color: textColor, fontFamily }}>
            {t("toolkit.store_about")}
          </span>
          {readmeState.loading ? (
            <ArcSpinner size={16} stroke_width={2} color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)"} />
          ) : readmeState.content ? (
            <Markdown content={readmeState.content} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: mutedColor, fontFamily }}>
                {t("toolkit.no_documentation_title")}
              </div>
              <div style={{ fontSize: 11.5, color: tertiaryColor, fontFamily }}>
                {t("toolkit.no_documentation_subtitle")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PluginDetailPage;
