import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { SOURCE_CONFIG, STORE_CATEGORY_CONFIG } from "../constants";
import { ToolkitIconFrame } from "../components/toolkit_icon";
import { SettingsSection, SettingsRow } from "../../settings/appearance";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { usePluginInstallState } from "../hooks/use_plugin_install_state";
import {
  isEntryOAuthConnectable,
  setupKindForEntry,
} from "../../../SERVICEs/mcp_install";
import { withMcpStoreIcon } from "../../../SERVICEs/mcp_toolkit_store";
import { dispatchComposerPrefill } from "../../../SERVICEs/composer_prefill";
import api from "../../../SERVICEs/api";
import {
  isToolkitAutoApprove,
  setToolkitAutoApprove,
} from "../../../SERVICEs/toolkit_auto_approve_store";

/* Settings-isomorphic product page (T2) — the detail surface for both the
   Installed list and the store (Discover/Categories), rebuilt on top of the
   REAL SettingsSection/SettingsRow (src/COMPONENTs/settings/appearance.js)
   so it reads as one system with the Settings modal instead of its own
   App-Store hero shell. Ground truth:
   docs/superpowers/specs/2026-07-14-plugins-settings-isomorphic-mockup.html
   (screens ① Plan detail / ② Grafana MCP detail / ④ Core detail).

   Layout is a fixed header (back + 48px icon + name/source-pill + tagline +
   Get/Installed action) over a scrollable body of SettingsSections in a
   fixed order — Commands → Status → Setup → Risk → About → Permission —
   each one absent entirely when it has nothing to show. The 5-cell stat
   strip and the old "What it can do" checklist grid are gone; capability
   tags now live inside About (see plugin_presentation.js's canDo, which
   this task changed from bare label strings to {label, confirm} objects so
   the ⚠ marker can be styled on its own).

   Install/OAuth/toggle/delete/approve/revoke/secrets LOGIC is unchanged —
   only the shell and section grouping around it moved. See per-section
   comments below for where each block used to live. */
const ToolkitAutoApproveConfirmModal = ({ open, onClose, onConfirm, isDark }) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 420,
        padding: "28px 28px 20px",
        backgroundColor: "var(--pupu-background)",
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
          fontWeight: 500,
          color: isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)",
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
          color: "rgba(var(--pupu-text-rgb),0.45)",
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
        backgroundColor: "var(--pupu-background)",
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
          fontWeight: 500,
          color: isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)",
          marginBottom: 8,
          lineHeight: 1.3,
        }}
      >
        {t("toolkit.delete_confirm_title", { name: toolkitLabel })}
      </div>

      <div
        style={{
          fontSize: 13,
          color: "rgba(var(--pupu-text-rgb),0.45)",
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
     store_toolkit_detail_panel.js's showSecondaryOAuthAction, then moved
     from the header into the Setup section in T2 — mockup screen ② groups
     every setup affordance, secrets or OAuth, under one "Setup" section) —
     entries that install via secrets/http but also carry an OAuth recipe as
     an alternative get a low-key "Connect with OAuth" link alongside the
     secret fields. ── */
  const showSecondaryOAuthAction =
    isEntryOAuthConnectable(entry) &&
    installMachine.installState === "installable" &&
    Boolean(onOAuthConnect);

  /* ── Approval risk summary (ported from store_toolkit_detail_panel.js's
     approvalRiskRows, ~lines 256-266) — now the Risk section's two-column kv
     grid (T2), showing an external-registry entry's transport / command /
     secrets / oauth / workspace footprint. ── */
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
  const commandRowLabel = t("toolkit.store_review_command");
  const approvalRiskRows = [
    [t("toolkit.store_review_transport"), entry?.mcp?.transport || ""],
    [commandRowLabel, commandSummary],
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
  const autoApproveMutationRef = useRef(0);
  const activeToolkitIdRef = useRef(entry?.toolkitId);
  // Keep this current during render so an old promise cannot win the small
  // window before the entry-change effect runs.
  activeToolkitIdRef.current = entry?.toolkitId;
  useEffect(() => {
    autoApproveMutationRef.current += 1;
    setShowApproveAutoConfirm(false);
    setAutoApprove(isToolkitAutoApprove(entry?.toolkitId));
  }, [entry?.toolkitId]);
  const handleAutoApproveToggle = (val) => {
    if (val) {
      setShowApproveAutoConfirm(true);
      return;
    }
    const toolkitId = entry?.toolkitId;
    const mutationId = ++autoApproveMutationRef.current;
    const toolNames = toolList.map((tool) => tool.name || tool.title || "");
    const result = setToolkitAutoApprove(
      toolkitId,
      false,
      toolNames,
    );
    setAutoApprove(false);
    result?.persistence?.catch(() => {
      if (
        activeToolkitIdRef.current !== toolkitId ||
        autoApproveMutationRef.current !== mutationId
      ) {
        return;
      }
      // The store has rolled back to its last SQL-confirmed state.
      setAutoApprove(isToolkitAutoApprove(toolkitId));
    });
  };
  const confirmAutoApprove = () => {
    const toolkitId = entry?.toolkitId;
    const mutationId = ++autoApproveMutationRef.current;
    const toolNames = toolList.map((tool) => tool.name || tool.title || "");
    const result = setToolkitAutoApprove(toolkitId, true, toolNames);
    setAutoApprove(true);
    result?.persistence?.catch(() => {
      if (
        activeToolkitIdRef.current !== toolkitId ||
        autoApproveMutationRef.current !== mutationId
      ) {
        return;
      }
      setAutoApprove(isToolkitAutoApprove(toolkitId));
    });
  };

  /* ── Docs (About kv row) — store entries already embed readmeMarkdown
     statically (mcp_toolkit_registry.json); installed entries that don't
     carry one fetch it via api.unchain.getToolkitDetail, same split the old
     installed panel used. The row itself is an inline expand toggle (I1):
     clicking "Docs → README ›" flips the chevron and reveals the markdown
     body below the About kv grid via the same BUILTIN Markdown component
     the pre-T2 page used; clicking again collapses it. The row is omitted
     entirely once the fetch resolves with no readme. ── */
  const [readmeState, setReadmeState] = useState(() => ({
    loading: false,
    content: entry?.readmeMarkdown || "",
  }));
  const [readmeExpanded, setReadmeExpanded] = useState(false);
  useEffect(() => {
    setReadmeExpanded(false);
  }, [entry?.toolkitId]);
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

  const textColor = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const mutedColor = "rgba(var(--pupu-text-rgb),0.45)";
  const tertiaryColor = isDark ? "rgba(var(--pupu-text-rgb),0.30)" : "rgba(var(--pupu-text-rgb),0.35)";
  const chipColor = isDark ? "#9aa8ff" : "#2563eb";
  const dangerColor = "var(--pupu-danger)";
  /* Warning tokens ported verbatim from store_toolkit_detail_panel.js —
     used for the needs-review approve affordance and the revoke action. */
  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const warningBg = isDark ? "rgba(251,146,60,0.14)" : "rgba(251,146,60,0.12)";
  const hotColor = isDark ? "#fdba74" : "#c2410c";
  const tagBg = isDark ? "rgba(var(--pupu-text-rgb),0.06)" : "rgba(var(--pupu-text-rgb),0.04)";

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
  const versionValue = entry?.version || "";

  const pillIsOpen = installMachine.installState === "installed";
  /* M-a: the shell never wires an onOpen handler (there is nothing to
     "open" for an installed plugin — no separate window/view). Rendering
     the pill as enabled anyway made it look actionable while silently
     doing nothing on click. Only treat the installed pill as a real
     (enabled) action when a caller actually supplied onOpen; otherwise it's
     the quiet, disabled "Installed" label the mockup shows. */
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

  const commands = Array.isArray(presentation.commands) ? presentation.commands : [];
  const canDo = Array.isArray(presentation.canDo) ? presentation.canDo : [];

  const subtitle = [presentation.tagline, providerName && `by ${providerName}`, versionValue && `v${versionValue}`]
    .filter(Boolean)
    .join(" · ");

  /* M5: the pill next to the plugin name used to render the raw source
     slug ("mcp_registry") verbatim. SOURCE_CONFIG (constants.js) carries a
     labelKey per source ("toolkit.source_mcp_registry" -> "registry", same
     i18n vocabulary presentation.sourceBadge.label draws its provider name
     from) — route the pill through it instead. sourceConfig always
     resolves (falls back to SOURCE_CONFIG.builtin above), so this is never
     empty. */
  const sourcePillLabel = t(sourceConfig.labelKey);

  const showSetup =
    installMachine.installState === "installable" &&
    (requiresSecretInput || showSecondaryOAuthAction);
  const showStatus = isExternalEntry && (canApproveExternal || canRevokeExternal);
  const showRisk = isExternalEntry && approvalRiskRows.length > 0;

  /* About kv — Provider/Version/Category/Stars, only present fields.
     Provider prefers the repo identity (matches the mockup's MCP screen,
     "grafana/mcp-grafana") and falls back to the generic source mapping
     plugin_presentation.js already computes ("PuPu built-in" / "MCP
     server" / …). Labels here are short attribute names, not translated —
     same precedent plugin_presentation.js's own "Provider" row already
     set. Docs is rendered separately below (I1) — it's a click-to-expand
     row, not a static kv line. */
  const informationProvider =
    (Array.isArray(presentation.information) ? presentation.information : []).find(
      (row) => row.k === "Provider",
    )?.v || "";
  const aboutKvRows = [
    { k: t("toolkit.info_provider"), v: entry?.repoFullName || informationProvider },
    { k: t("toolkit.info_version"), v: versionValue },
    { k: t("toolkit.info_category"), v: categoryLabel },
    { k: t("toolkit.info_stars"), v: entry?.repoStars != null ? String(entry.repoStars) : "" },
  ].filter((row) => String(row.v || "").trim());
  const aboutDescription = entry?.toolkitDescription || presentation.tagline || "";
  const hasReadme = Boolean(readmeState.content);

  const miniButtonStyle = {
    fontSize: 11.5,
    fontFamily,
    color: isDark ? "rgba(var(--pupu-text-rgb),0.75)" : "rgba(var(--pupu-text-rgb),0.65)",
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 6,
    flexShrink: 0,
    root: { background: isDark ? "rgba(var(--pupu-text-rgb),0.08)" : "rgba(var(--pupu-text-rgb),0.06)" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — back link, 48px icon, name + source pill, tagline,
           right-aligned Get/Installed action. ── */}
      <div style={{ flexShrink: 0, paddingRight: 24 }}>
        <div style={{ marginBottom: 4 }}>
          <Button
            prefix_icon="arrow_left"
            onClick={onBack}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: isDark ? "rgba(var(--pupu-text-rgb),0.72)" : "rgba(var(--pupu-text-rgb),0.68)",
              paddingVertical: 5,
              paddingHorizontal: 5,
              borderRadius: 8,
              root: { background: isDark ? "rgba(var(--pupu-text-rgb),0.05)" : "rgba(var(--pupu-text-rgb),0.04)" },
              hoverBackgroundColor: isDark ? "rgba(var(--pupu-text-rgb),0.08)" : "rgba(var(--pupu-text-rgb),0.07)",
              activeBackgroundColor: isDark ? "rgba(var(--pupu-text-rgb),0.12)" : "rgba(var(--pupu-text-rgb),0.1)",
              content: {
                prefixIconWrap: { display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 },
                icon: { width: 14, height: 14 },
              },
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "10px 0 18px",
          }}
        >
          <ToolkitIconFrame
            icon={withMcpStoreIcon(entry)?.toolkitIcon}
            isDark={isDark}
            size={48}
            iconSize={24}
            borderRadius={12}
            fallbackColor={sourceConfig.color}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em", fontFamily, color: textColor }}>
                {toolkitLabel}
              </span>
              {sourcePillLabel && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 500,
                    letterSpacing: "0.4px",
                    textTransform: "lowercase",
                    padding: "1px 7px",
                    borderRadius: 999,
                    color: sourceConfig.color,
                    background: sourceConfig.bg,
                  }}
                >
                  {sourcePillLabel}
                </span>
              )}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11, color: mutedColor, marginTop: 2, fontFamily }}>{subtitle}</div>
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
              {pillIsOpen ? (
                <Button
                  label={t("toolkit.nav_installed")}
                  disabled={!pillEnabled}
                  onClick={handlePillClick}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    fontFamily,
                    color: mutedColor,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    root: { background: "transparent" },
                    state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} } },
                  }}
                />
              ) : (
                <Button
                  label={installMachine.stateLabel}
                  disabled={!pillEnabled}
                  onClick={handlePillClick}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    fontFamily,
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    color: "#fff",
                    root: { background: "var(--pupu-accent)" },
                    state: { disabled: { root: { opacity: 0.45, cursor: "not-allowed" }, background: {} } },
                  }}
                />
              )}
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
      </div>

      {/* ── Scrollable body — Commands → Status → Setup → Risk → About →
           Permission, each section absent entirely when empty. ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px 0" }}>
        {/* ── Commands ── */}
        {commands.length > 0 && (
          <SettingsSection title={t("toolkit.section_commands")}>
            {commands.map((command) => (
              <SettingsRow
                key={command.name}
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        fontFamily: "ui-monospace, Menlo, monospace",
                        fontSize: 12.5,
                        fontWeight: 500,
                        color: chipColor,
                      }}
                    >
                      {command.name}
                    </span>
                    {command.title && (
                      <span style={{ fontSize: 12, color: textColor, fontFamily }}>{command.title}</span>
                    )}
                  </span>
                }
                description={command.description}
              >
                <Button
                  label={t("toolkit.try_in_chat")}
                  onClick={() => handleTryCommand(command)}
                  style={miniButtonStyle}
                />
              </SettingsRow>
            ))}
          </SettingsSection>
        )}

        {/* ── Status (MCP only) — needs-review line + approve, or the
             revoke action for an already-approved external entry. Ported
             verbatim from store_toolkit_detail_panel.js's approve/revoke
             workflow; only the shell (SettingsRow instead of a manual flex
             row) changed. ── */}
        {showStatus && (
          <SettingsSection title={t("toolkit.section_status")}>
            {canApproveExternal && (
              <SettingsRow
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span
                      style={{ width: 7, height: 7, borderRadius: "50%", background: warningColor, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: warningColor, fontFamily }}>
                      {t("toolkit.store_needs_review_action")}
                    </span>
                  </span>
                }
                description={t("toolkit.store_needs_review_phase2a")}
              >
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <Button
                    label={approvalBusy ? t("toolkit.store_approving_entry") : t("toolkit.store_approve_entry")}
                    disabled={!approveActionEnabled}
                    onClick={() =>
                      onApproveEntry?.(entry, {
                        acknowledgedRisk: riskAcknowledged || !requiresRiskAcknowledgement,
                      })
                    }
                    style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      fontFamily,
                      color: warningColor,
                      paddingVertical: 4,
                      paddingHorizontal: 13,
                      borderRadius: 8,
                      flexShrink: 0,
                      root: {
                        background: "transparent",
                        border: `1px solid ${isDark ? "rgba(253,186,116,0.35)" : "rgba(194,65,12,0.35)"}`,
                      },
                      state: { disabled: { root: { opacity: 0.55, cursor: "not-allowed" }, background: {} } },
                    }}
                  />
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
              </SettingsRow>
            )}

            {canRevokeExternal && (
              <SettingsRow label={t("toolkit.store_revoke_approval")}>
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
                    borderRadius: 8,
                    flexShrink: 0,
                    root: { background: warningBg, border: "none" },
                    state: { disabled: { root: { opacity: 0.55, cursor: "not-allowed" }, background: {} } },
                  }}
                />
              </SettingsRow>
            )}
          </SettingsSection>
        )}

        {/* ── Setup (MCP only) — secrets as password SettingsRows, plus the
             dual-auth "Connect with OAuth" link. Gated on the entry's actual
             setup path (requiresSecretInput / showSecondaryOAuthAction),
             installable-state only — there is no update-secrets flow for an
             already-installed entry, and a needs-review/workspace-only
             entry's secrets (if any) aren't collected here either. ── */}
        {showSetup && (
          <SettingsSection title={t("toolkit.section_setup")}>
            {secrets.map((secret) => (
              <SettingsRow
                key={secret.key}
                label={secret.label || secret.key}
                description={secret.optional ? "(optional)" : undefined}
              >
                <Input
                  type="password"
                  value={secretValues[secret.key] || ""}
                  set_value={(value) => setSecretValues((prev) => ({ ...prev, [secret.key]: value }))}
                  placeholder={secret.label || secret.key}
                  style={{
                    width: 230,
                    fontSize: 12,
                    fontFamily,
                    borderRadius: 7,
                    color: textColor,
                    paddingVertical: 7,
                    paddingHorizontal: 11,
                  }}
                />
              </SettingsRow>
            ))}
            {requiresSecretInput && !hasRequiredSecrets && (
              <div style={{ fontSize: 10.5, lineHeight: 1.4, color: warningColor, fontFamily, paddingBottom: 10 }}>
                {t("toolkit.store_secret_required")}
              </div>
            )}
            {showSecondaryOAuthAction && (
              <div style={{ padding: "6px 0 10px" }}>
                <Button
                  label={t("toolkit.store_connect_oauth")}
                  disabled={installMachine.installing}
                  onClick={() => onOAuthConnect?.(entry)}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    fontFamily,
                    color: isDark ? "#93c5fd" : "#2563eb",
                    paddingVertical: 4,
                    paddingHorizontal: 0,
                    borderRadius: 0,
                    root: { background: "transparent" },
                    state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} } },
                  }}
                />
              </div>
            )}
          </SettingsSection>
        )}

        {/* ── Risk (MCP only) — two-column kv grid, ported from
             store_toolkit_detail_panel.js's approvalRiskRows table; the
             Command row is highlighted (hot) same as the mockup. ── */}
        {showRisk && (
          <SettingsSection title={t("toolkit.section_risk")}>
            <div style={{ padding: "12px 0 14px" }}>
              {riskLevel && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
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
                        background: isDark ? "rgba(var(--pupu-text-rgb),0.05)" : "rgba(var(--pupu-text-rgb),0.035)",
                        borderRadius: 999,
                        padding: "3px 10px",
                      }}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 24px", fontSize: 11 }}>
                {approvalRiskRows.map(([label, value]) => {
                  const isHot = label === commandRowLabel;
                  return (
                    <div key={label} style={{ display: "flex", gap: 8, padding: "3px 0", lineHeight: 1.5 }}>
                      <span style={{ color: tertiaryColor, fontFamily, flexShrink: 0 }}>{label}</span>
                      <span
                        style={{
                          color: isHot ? hotColor : mutedColor,
                          fontWeight: 500,
                          fontFamily,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {value}
                      </span>
                    </div>
                  );
                })}
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
                              background: isDark ? "rgba(var(--pupu-text-rgb),0.05)" : "rgba(var(--pupu-text-rgb),0.035)",
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

              {recipeDiff.length > 0 && (
                <div
                  style={{
                    margin: "12px 0 0",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: warningBg,
                    color: warningColor,
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 500, display: "block", marginBottom: 8, color: warningColor, fontFamily }}>
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
            </div>
          </SettingsSection>
        )}

        {/* ── About — description paragraph + capability tag cloud (canDo,
             ⚠ suffix on requires-confirmation items) + kv grid. Replaces the
             old "What it can do" checklist grid and the separate
             Information section — About now carries both. ── */}
        <SettingsSection title={t("toolkit.store_about")}>
          <div style={{ padding: "12px 0 14px" }}>
            {aboutDescription && (
              <p style={{ fontSize: 11.5, lineHeight: 1.7, color: mutedColor, margin: 0, maxWidth: "58ch", fontFamily }}>
                {aboutDescription}
              </p>
            )}

            {canDo.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: aboutDescription ? 12 : 0 }}>
                {canDo.map((item, idx) => (
                  <span
                    key={`${item.label}-${idx}`}
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      fontFamily,
                      color: mutedColor,
                      background: tagBg,
                      borderRadius: 6,
                      padding: "3px 10px",
                    }}
                  >
                    {item.label}
                    {item.confirm && (
                      <span style={{ color: isDark ? "#d9a75a" : "#a06a1f" }}>{" ⚠"}</span>
                    )}
                  </span>
                ))}
              </div>
            )}

            {(aboutKvRows.length > 0 || hasReadme) && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "2px 24px",
                  fontSize: 11,
                  marginTop: 14,
                }}
              >
                {aboutKvRows.map((row) => (
                  <div key={row.k} style={{ display: "flex", gap: 8, padding: "3px 0", lineHeight: 1.5 }}>
                    <span style={{ color: tertiaryColor, fontFamily, flexShrink: 0 }}>{row.k}</span>
                    <span style={{ color: mutedColor, fontWeight: 500, fontFamily }}>{row.v}</span>
                  </div>
                ))}

                {/* ── I1: Docs is a click-to-expand row, not a static kv
                     line — clicking reveals the README below the grid
                     (same BUILTIN Markdown component the pre-T2 page used),
                     clicking again collapses it. Omitted entirely once
                     readmeState resolves with no content (hasReadme
                     false). ── */}
                {hasReadme && (
                  <div
                    key="docs"
                    role="button"
                    tabIndex={0}
                    onClick={() => setReadmeExpanded((prev) => !prev)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setReadmeExpanded((prev) => !prev);
                      }
                    }}
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "3px 0",
                      lineHeight: 1.5,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ color: tertiaryColor, fontFamily, flexShrink: 0 }}>{t("toolkit.info_docs")}</span>
                    <span style={{ color: mutedColor, fontWeight: 500, fontFamily }}>
                      {`README ${readmeExpanded ? "⌄" : "›"}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {hasReadme && readmeExpanded && (
              <div style={{ marginTop: 12 }}>
                {readmeState.loading ? (
                  <ArcSpinner
                    size={14}
                    stroke_width={2}
                    color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)"}
                  />
                ) : (
                  <Markdown content={readmeState.content} />
                )}
              </div>
            )}
          </div>
        </SettingsSection>

        {/* ── Permission — rename of the old "Manage" section, identical
             logic: auto-enable / auto-approve (red on-state + confirm
             modal) / delete. ── */}
        <SettingsSection title={t("toolkit.section_permission")}>
          {pillIsOpen && onToggleAutoEnable && (
            <SettingsRow label={t("toolkit.auto_enable_label")} description={t("toolkit.auto_enable_desc")}>
              <SemiSwitch
                on={Boolean(defaultEnabled)}
                set_on={(val) => onToggleAutoEnable?.(entry?.toolkitId, val)}
                style={{ width: 56, height: 28 }}
              />
            </SettingsRow>
          )}

          {pillIsOpen && (
            <SettingsRow label={t("toolkit.auto_approve_plugin_label")} description={t("toolkit.auto_approve_plugin_desc")}>
              <SemiSwitch
                on={autoApprove}
                set_on={handleAutoApproveToggle}
                style={{ width: 56, height: 28, backgroundColor_on: dangerColor }}
              />
            </SettingsRow>
          )}

          <SettingsRow
            label={
              <span style={{ color: isBuiltin ? tertiaryColor : dangerColor }}>{t("toolkit.delete_label")}</span>
            }
            description={isBuiltin ? t("toolkit.delete_desc_builtin") : t("toolkit.delete_desc")}
          >
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
                color: isBuiltin ? "rgba(var(--pupu-text-rgb),0.25)" : dangerColor,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 7,
                gap: 5,
                flexShrink: 0,
                root: { background: "transparent", border: "none" },
                hoverBackgroundColor: isDark ? "rgba(229,72,77,0.14)" : "rgba(229,72,77,0.10)",
                activeBackgroundColor: isDark ? "rgba(229,72,77,0.22)" : "rgba(229,72,77,0.16)",
                content: {
                  icon: {
                    width: 14,
                    height: 14,
                    color: isBuiltin ? "rgba(var(--pupu-text-rgb),0.25)" : dangerColor,
                  },
                },
                state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} } },
              }}
            />
          </SettingsRow>
        </SettingsSection>

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
      </div>
    </div>
  );
};

export default PluginDetailPage;
