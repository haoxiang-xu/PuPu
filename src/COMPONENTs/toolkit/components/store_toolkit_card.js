import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { SOURCE_CONFIG, TRUST_CONFIG } from "../constants";
import { entryInstallState } from "../../../SERVICEs/mcp_install";
import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";

const Tag = ({ text, color, bg, fontFamily }) => (
  <span
    style={{
      fontSize: 10,
      fontFamily,
      fontWeight: 500,
      letterSpacing: "0.3px",
      padding: "1.5px 8px",
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

const StoreToolkitCard = ({
  entry,
  isDark,
  onClick,
  installedIds,
  onInstall,
  installing = false,
  installError = null,
}) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";

  const tools = Array.isArray(entry.tools) ? entry.tools : [];
  const installState = entryInstallState(entry, installedIds);
  const actionLabel = installing
    ? t("toolkit.store_installing")
    : installState === "installed"
      ? t("toolkit.store_installed")
      : installState === "installable"
        ? t("toolkit.store_install")
        : installState === "needs_review"
          ? t("toolkit.store_needs_review_action")
          : t("toolkit.store_coming_soon");
  const actionEnabled = installState === "installable" && !installing;
  const sourceConfig = SOURCE_CONFIG[entry.source] || SOURCE_CONFIG.builtin;
  const trustConfig = TRUST_CONFIG[entry.trustLevel] || TRUST_CONFIG.verified;
  const isReview = entry.status === "needs_review";
  const hasFileIcon = isFileToolkitIcon(entry.toolkitIcon);

  /* Card style mirrors the Ollama model card (settings → model providers):
     thin border, very faint background, 7px radius, hover lightens the fill. */
  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
  const cardHoverBg = isDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.025)";
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const licenseBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const licenseColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const warningColor = isDark ? "#fdba74" : "#c2410c";

  const iconWrapBackground = isBuiltinToolkitIcon(entry.toolkitIcon)
    ? entry.toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.05)"
      : "rgba(0,0,0,0.04)";

  const transportLabel = `${t(sourceConfig.labelKey)}${
    entry.mcp?.transport ? ` · ${entry.mcp.transport}` : ""
  }`;

  return (
    <div
      onClick={() => onClick?.(entry.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = cardHoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = cardBg;
      }}
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 7,
        backgroundColor: cardBg,
        padding: 13,
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
    >
      {/* icon + star / tool count */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 9,
        }}
      >
        {hasFileIcon ? (
          <ToolkitIcon
            icon={entry.toolkitIcon}
            size={40}
            fallbackColor={sourceConfig.color}
            style={{ borderRadius: 9 }}
          />
        ) : (
          <div
            data-testid="store-card-icon-wrap"
            style={{
              width: 40,
              height: 40,
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: iconWrapBackground,
            }}
          >
            <ToolkitIcon
              icon={entry.toolkitIcon}
              size={24}
              fallbackColor={sourceConfig.color}
            />
          </div>
        )}

        <span
          style={{
            fontSize: 11,
            fontFamily,
            color: mutedColor,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {tools.length > 0
            ? `${tools.length} ${t("toolkit.store_tools_count")}`
            : ""}
        </span>
      </div>

      {/* name */}
      <span
        style={{
          fontSize: 13,
          fontFamily,
          fontWeight: 600,
          color: textColor,
          letterSpacing: "0.1px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "block",
          marginBottom: 4,
        }}
      >
        {entry.toolkitName}
      </span>

      {/* description */}
      {entry.toolkitDescription && (
        <span
          style={{
            fontSize: 12,
            fontFamily,
            fontWeight: 400,
            color: mutedColor,
            lineHeight: 1.5,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: 11,
          }}
        >
          {entry.toolkitDescription}
        </span>
      )}

      {/* footer tags */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginTop: "auto",
          flexWrap: "wrap",
        }}
      >
        <Tag
          text={transportLabel}
          color={sourceConfig.color}
          bg={sourceConfig.bg}
          fontFamily={fontFamily}
        />
        <Tag
          text={t(trustConfig.labelKey)}
          color={trustConfig.color}
          bg={trustConfig.bg}
          fontFamily={fontFamily}
        />
        {!isReview && entry.license && (
          <Tag
            text={entry.license}
            color={licenseColor}
            bg={licenseBg}
            fontFamily={fontFamily}
          />
        )}

        <div
          style={{ marginLeft: "auto" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            label={actionLabel}
            disabled={!actionEnabled}
            onClick={() => actionEnabled && onInstall?.(entry)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              paddingVertical: 4,
              paddingHorizontal: 12,
              borderRadius: 999,
              color: actionEnabled
                ? isDark
                  ? "#fff"
                  : "#111"
                : isDark
                  ? "rgba(255,255,255,0.4)"
                  : "rgba(0,0,0,0.35)",
              root: {
                background: actionEnabled
                  ? isDark
                    ? "rgba(255,255,255,0.14)"
                    : "#111"
                  : isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.05)",
              },
              state: {
                disabled: {
                  root: { opacity: 0.6, cursor: "not-allowed" },
                  background: {},
                },
              },
            }}
          />
        </div>
      </div>

      {installError && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10.5,
            fontFamily,
            color: warningColor,
            lineHeight: 1.35,
          }}
        >
          {installError.code === "mcp_workspace_required"
            ? t("toolkit.store_workspace_required")
            : t("toolkit.store_install_error")}
        </div>
      )}
    </div>
  );
};

export default StoreToolkitCard;
