import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";
import { SOURCE_CONFIG } from "../constants";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";

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

const ToolkitCard = ({ toolkit, isDark, onToggleEnabled }) => {
  const displayName = toDisplayName(toolkit);
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];
  const sc = SOURCE_CONFIG[toolkit.source] || SOURCE_CONFIG.builtin;
  const enabled = Boolean(toolkit.defaultEnabled);

  const borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const tagBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)";
  const hasFileIcon = isFileToolkitIcon(toolkit.toolkitIcon);
  const iconWrapBackground = isBuiltinToolkitIcon(toolkit.toolkitIcon)
    ? toolkit.toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.04)"
      : "rgba(0,0,0,0.03)";

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        backgroundColor: cardBg,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Toolkit header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 14px 8px",
        }}
      >
        {hasFileIcon ? (
          <ToolkitIcon
            icon={toolkit.toolkitIcon}
            size={36}
            fallbackColor={sc.color}
            style={{ flexShrink: 0 }}
          />
        ) : (
          <div
            data-testid="toolkit-card-icon-wrap"
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              backgroundColor: iconWrapBackground,
            }}
          >
            <ToolkitIcon
              icon={toolkit.toolkitIcon}
              size={18}
              fallbackColor={sc.color}
            />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: 14,
              fontFamily: "Jost",
              fontWeight: 600,
              color: textColor,
              letterSpacing: "0.1px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "block",
            }}
          >
            {displayName}
          </span>
        </div>

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
            flexShrink: 0,
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
              flexShrink: 0,
            }}
          >
            {tools.length} tool{tools.length !== 1 ? "s" : ""}
          </span>
        )}

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
            style={{ width: 44, height: 22 }}
          />
        </Tooltip>
      </div>

      {/* ── Tool tags ── */}
      {tools.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "4px 14px 11px",
          }}
        >
          {tools.map((tool, idx) => (
            <span
              key={tool.name || idx}
              style={{
                fontSize: 11.5,
                fontFamily: "Jost",
                fontWeight: 500,
                color: mutedColor,
                background: tagBg,
                padding: "2px 8px",
                borderRadius: 5,
                whiteSpace: "nowrap",
              }}
            >
              {tool.title || tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolkitCard;
