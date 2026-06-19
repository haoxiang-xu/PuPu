import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { SOURCE_CONFIG } from "../constants";
import {
  entryInstallState,
  setupKindForEntry,
} from "../../../SERVICEs/mcp_install";
import { resolveMcpIcon } from "../../../SERVICEs/mcp_toolkit_store";
import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";

/* App-Store-style list row: icon · name/description · install action.
   No card chrome — rows are separated by a divider only. */
const StoreToolkitCard = ({
  entry,
  isDark,
  onClick,
  installedIds,
  onInstall,
  onOAuthConnect,
  installing = false,
  installError = null,
}) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";

  const installState = entryInstallState(entry, installedIds);
  const setupKind = setupKindForEntry(entry);
  const opensSetup =
    installState === "installable" &&
    ["secrets", "http_secret", "custom"].includes(setupKind);
  const actionLabel = installing
    ? installState === "oauth"
      ? t("toolkit.store_waiting_for_oauth")
      : t("toolkit.store_installing")
    : installState === "installed"
      ? t("toolkit.store_installed")
      : installState === "installable"
        ? opensSetup
          ? t("toolkit.store_setup")
          : t("toolkit.store_install")
        : installState === "needs_review"
          ? t("toolkit.store_needs_review_action")
          : installState === "oauth"
            ? t("toolkit.store_connect")
          : t("toolkit.store_coming_soon");
  const actionEnabled =
    ["installable", "oauth"].includes(installState) && !installing;

  const sourceConfig = SOURCE_CONFIG[entry.source] || SOURCE_CONFIG.builtin;
  const toolkitIcon = resolveMcpIcon(entry);
  const hasFileIcon = isFileToolkitIcon(toolkitIcon);

  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.45)";
  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const accentColor = isDark ? "#7c8cf8" : "#2563eb";
  const actionBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.055)";
  const installErrorText =
    installError?.code === "mcp_workspace_required"
      ? t("toolkit.store_workspace_required")
      : installError?.message || t("toolkit.store_install_error");
  const repoMeta = [
    entry.repoFullName,
    entry.repoStars != null ? `${Number(entry.repoStars).toLocaleString()} stars` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const externalMeta = entry.externalReview
    ? [t("toolkit.store_external_registry"), entry.registryName]
        .filter(Boolean)
        .join(" · ")
    : "";

  const iconWrapBackground = isBuiltinToolkitIcon(toolkitIcon)
    ? toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.05)"
      : "rgba(0,0,0,0.04)";

  return (
    <div
      onClick={() => onClick?.(entry.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderBottom: `1px solid ${dividerColor}`,
        cursor: "pointer",
      }}
    >
      {/* icon */}
      {hasFileIcon ? (
        <ToolkitIcon
          icon={toolkitIcon}
          size={36}
          fallbackColor={sourceConfig.color}
          style={{ borderRadius: 10, flexShrink: 0 }}
        />
      ) : (
        <div
          data-testid="store-card-icon-wrap"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: iconWrapBackground,
            flexShrink: 0,
          }}
        >
          <ToolkitIcon
            icon={toolkitIcon}
            size={18}
            fallbackColor={sourceConfig.color}
          />
        </div>
      )}

      {/* name + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontFamily,
            fontWeight: 500,
            color: textColor,
            letterSpacing: "0.1px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.toolkitName}
        </div>
        {entry.toolkitDescription && (
          <div
            style={{
              fontSize: 11,
              fontFamily,
              color: mutedColor,
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 1,
            }}
          >
            {entry.toolkitDescription}
          </div>
        )}
        {repoMeta && (
          <div
            style={{
              fontSize: 10.5,
              fontFamily,
              color: mutedColor,
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 1,
            }}
          >
            {repoMeta}
          </div>
        )}
        {externalMeta && (
          <div
            style={{
              fontSize: 10.5,
              fontFamily,
              color: warningColor,
              lineHeight: 1.35,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 1,
            }}
          >
            {externalMeta}
          </div>
        )}
        {installError && (
          <div
            style={{
              fontSize: 10.5,
              fontFamily,
              color: warningColor,
              lineHeight: 1.3,
              marginTop: 2,
            }}
          >
            {installErrorText}
          </div>
        )}
      </div>

      {/* install action */}
      <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
        <Button
          label={actionLabel}
          disabled={!actionEnabled}
          onClick={() => {
            if (!actionEnabled) return;
            if (installState === "oauth") {
              onOAuthConnect?.(entry);
              return;
            }
            if (opensSetup) {
              onClick?.(entry.id);
              return;
            }
            onInstall?.(entry);
          }}
          style={{
            fontSize: 11.5,
            fontFamily,
            paddingVertical: 4,
            paddingHorizontal: 13,
            borderRadius: 999,
            color: actionEnabled ? accentColor : mutedColor,
            root: { background: actionBg },
            state: {
              disabled: {
                root: { opacity: 0.7, cursor: "not-allowed" },
                background: {},
              },
            },
          }}
        />
      </div>
    </div>
  );
};

export default StoreToolkitCard;
