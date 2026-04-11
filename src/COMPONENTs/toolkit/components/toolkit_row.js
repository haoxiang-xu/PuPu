import { useContext } from "react";
import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";
import { SOURCE_CONFIG } from "../constants";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const toDisplayName = (toolkit, unknownLabel) => {
  const raw =
    toolkit.toolkitName ||
    toolkit.class_name ||
    toolkit.name ||
    unknownLabel;
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
};

const ToolkitRow = ({
  toolkit,
  isDark,
  isBuiltin,
  onToggleEnabled,
  onClick,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const displayName = toDisplayName(toolkit, t("toolkit.unknown_toolkit"));
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];
  const sc = SOURCE_CONFIG[toolkit.source] || SOURCE_CONFIG.builtin;
  const enabled = Boolean(toolkit.defaultEnabled);

  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  const hasFileIcon = isFileToolkitIcon(toolkit.toolkitIcon);
  const iconWrapSize = 36;
  const iconWrapBackground = isBuiltinToolkitIcon(toolkit.toolkitIcon)
    ? toolkit.toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.05)"
      : "rgba(0,0,0,0.04)";

  return (
    <div
      onClick={() => onClick?.(toolkit.toolkitId)}
      style={{
        cursor: "pointer",
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        borderRadius: 10,
      }}
    >
      {/* ── Icon ── */}
      {hasFileIcon ? (
        <ToolkitIcon
          icon={toolkit.toolkitIcon}
          size={iconWrapSize}
          fallbackColor={sc.color}
          style={{ borderRadius: 10, flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: iconWrapSize,
            height: iconWrapSize,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: iconWrapBackground,
            flexShrink: 0,
          }}
        >
          <ToolkitIcon
            icon={toolkit.toolkitIcon}
            size={18}
            fallbackColor={sc.color}
          />
        </div>
      )}

      {/* ── Name & meta ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 12.5,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              fontWeight: 500,
              color: textColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              fontWeight: 500,
              letterSpacing: "0.4px",
              textTransform: "lowercase",
              padding: "1px 7px",
              borderRadius: 999,
              backgroundColor: sc.bg,
              color: sc.color,
              lineHeight: 1.8,
              whiteSpace: "nowrap",
            }}
          >
            {t(sc.labelKey)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          {toolkit.toolkitDescription && (
            <span
              style={{
                fontSize: 11,
                fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                color: mutedColor,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {toolkit.toolkitDescription}
            </span>
          )}
          {tools.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                color: mutedColor,
                flexShrink: 0,
              }}
            >
              · {tools.length} tool{tools.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Actions (only for non-builtin) ── */}
      {!isBuiltin && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip
            label={t("toolkit.auto_enable_card")}
            position="top"
            style={{ whiteSpace: "nowrap" }}
            wrapper_style={{ flexShrink: 0 }}
          >
            <SemiSwitch
              on={enabled}
              set_on={(val) => {
                if (onToggleEnabled) onToggleEnabled(toolkit.toolkitId, val);
              }}
              style={{ width: 56, height: 28 }}
            />
          </Tooltip>
        </div>
      )}
    </div>
  );
};

export default ToolkitRow;
