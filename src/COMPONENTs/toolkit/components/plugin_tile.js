import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { STORE_CATEGORY_CONFIG } from "../constants";
import { ToolkitIconFrame } from "./toolkit_icon";
import { usePluginInstallState } from "../hooks/use_plugin_install_state";

/* Shared 206px App-Store tile — Discover's Essentials rail, Collection
   expansion view and the Categories grid all render this one component.
   Ground truth: docs/superpowers/specs/2026-07-13-plugins-appstore-mockup.html
   (.tile block). `icon` is resolved by the caller (store entries go through
   resolveMcpIcon, catalog/builtin entries use their own toolkitIcon field)
   since the two sources need different resolution paths — the tile itself
   only renders whatever it's handed. */
const PluginTile = ({
  presentation,
  entry,
  icon,
  isDark,
  installedIds,
  installing = false,
  forceInstalled = false,
  onInstall,
  onOAuthConnect,
  onCancelOAuth,
  onClick,
  style,
  testId,
}) => {
  const { theme } = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

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

  if (!presentation) return null;

  const nameColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const catColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.40)";
  const taglineColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.50)";
  const cardBg = isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.03)";
  const cardBorder = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
  const chipColor = isDark ? "#7c8cf8" : "#2563eb";
  const pillBg = isDark ? "rgba(124,140,248,0.12)" : "rgba(37,99,235,0.08)";
  const pillOpenColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)";
  const pillOpenBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  const categoryKey = entry?.category || presentation.category;
  const categoryConfig = STORE_CATEGORY_CONFIG.find((c) => c.key === categoryKey);
  const categoryLabel = categoryConfig
    ? t(categoryConfig.labelKey)
    : presentation.category
      ? presentation.category.charAt(0).toUpperCase() + presentation.category.slice(1)
      : "";

  const isOpen = installMachine.installState === "installed";
  const pillEnabled = isOpen || installMachine.canInstall;
  const firstCommand = Array.isArray(presentation.commands) ? presentation.commands[0] : null;

  const handlePillClick = (event) => {
    event.stopPropagation();
    if (isOpen) {
      onClick?.();
      return;
    }
    /* opensSetup entries (secrets / http-secret / custom recipe) need their
       setup form — installing directly here would fire a secretless
       install. Open the detail page instead, same as the old
       store_toolkit_card.js's `if (opensSetup) { onClick?.(entry.id); }`
       branch this restores. */
    if (installMachine.opensSetup) {
      onClick?.();
      return;
    }
    installMachine.onInstall();
  };

  return (
    <div
      onClick={onClick}
      data-testid={testId}
      style={{
        width: 206,
        flexShrink: 0,
        borderRadius: 14,
        background: cardBg,
        border: `1px solid ${cardBorder}`,
        padding: 14,
        cursor: "pointer",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <ToolkitIconFrame
          icon={icon}
          isDark={isDark}
          size={38}
          iconSize={19}
          borderRadius={10}
          fallbackColor={presentation.sourceBadge?.color}
        />
        <div style={{ minWidth: 0 }}>
          <div
            data-testid={presentation.id ? `tile-name-${presentation.id}` : undefined}
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: nameColor,
              fontFamily,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {presentation.name}
          </div>
          {categoryLabel && (
            <div style={{ fontSize: 10.5, color: catColor, fontFamily }}>{categoryLabel}</div>
          )}
        </div>
      </div>

      {presentation.tagline && (
        <div
          style={{
            fontSize: 11,
            color: taglineColor,
            lineHeight: 1.45,
            margin: "9px 0 0",
            height: 32,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            fontFamily,
          }}
        >
          {presentation.tagline}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
        <span
          style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 10,
            color: chipColor,
          }}
        >
          {firstCommand ? firstCommand.name : ""}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          {installMachine.installing && (
            <ArcSpinner
              size={10}
              stroke_width={2}
              color={isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)"}
            />
          )}
          <Button
            label={installMachine.stateLabel}
            disabled={!pillEnabled}
            onClick={handlePillClick}
            style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily,
              paddingVertical: 3,
              paddingHorizontal: 13,
              borderRadius: 999,
              color: isOpen ? pillOpenColor : chipColor,
              root: { background: isOpen ? pillOpenBg : pillBg },
              state: {
                disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} },
              },
            }}
          />
        </span>
      </div>
    </div>
  );
};

export default PluginTile;
