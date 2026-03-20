import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";
import { SOURCE_CONFIG } from "../constants";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import Card from "../../../BUILTIN_COMPONENTs/card/card";

const toDisplayName = (toolkit) => {
  const raw =
    toolkit.toolkitName ||
    toolkit.class_name ||
    toolkit.name ||
    "Unknown Toolkit";
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
};

const ToolkitCard = ({ toolkit, isDark, onToggleEnabled, onClick }) => {
  const displayName = toDisplayName(toolkit);
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];
  const sc = SOURCE_CONFIG[toolkit.source] || SOURCE_CONFIG.builtin;
  const enabled = Boolean(toolkit.defaultEnabled);

  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const hasFileIcon = isFileToolkitIcon(toolkit.toolkitIcon);
  const iconWrapSize = 44;
  const iconWrapBackground = isBuiltinToolkitIcon(toolkit.toolkitIcon)
    ? toolkit.toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.05)"
      : "rgba(0,0,0,0.04)";

  return (
    <div
      className="toolkit-card-wrapper"
      onClick={() => onClick?.(toolkit.toolkitId)}
      style={{ cursor: "pointer" }}
    >
      <style>{`
        .toolkit-card-wrapper > div > div {
          box-shadow: none !important;
        }
      `}</style>
      <Card
        width="100%"
        height="100%"
        disabled
        border_radius={12}
        style={{
          cursor: "pointer",
        }}
        body_style={{
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        {/* ── Icon + Toggle row ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          {hasFileIcon ? (
            <ToolkitIcon
              icon={toolkit.toolkitIcon}
              size={iconWrapSize}
              fallbackColor={sc.color}
              style={{ borderRadius: 12 }}
            />
          ) : (
            <div
              data-testid="toolkit-card-icon-wrap"
              style={{
                width: iconWrapSize,
                height: iconWrapSize,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: iconWrapBackground,
              }}
            >
              <ToolkitIcon
                icon={toolkit.toolkitIcon}
                size={26}
                fallbackColor={sc.color}
              />
            </div>
          )}

          <div onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
            <Tooltip
              label="Auto-enable for new chats"
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
        </div>

        {/* ── Name ── */}
        <span
          style={{
            fontSize: 11.5,
            fontFamily: "Jost",
            fontWeight: 500,
            color: textColor,
            letterSpacing: "0.15px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "block",
            marginBottom: 3,
          }}
        >
          {displayName}
        </span>

        {/* ── Description ── */}
        {toolkit.toolkitDescription && (
          <span
            style={{
              fontSize: 11.5,
              fontFamily: "Jost",
              fontWeight: 400,
              color: mutedColor,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginBottom: 8,
            }}
          >
            {toolkit.toolkitDescription}
          </span>
        )}

        {/* ── Footer: source badge + tool count ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: "auto",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontFamily: "Jost",
              fontWeight: 500,
              letterSpacing: "0.4px",
              textTransform: "lowercase",
              padding: "1px 6px",
              borderRadius: 999,
              backgroundColor: sc.bg,
              color: sc.color,
              lineHeight: 1.8,
            }}
          >
            {sc.label}
          </span>

          {tools.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontFamily: "Jost",
                color: mutedColor,
              }}
            >
              {tools.length} tool{tools.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ToolkitCard;
