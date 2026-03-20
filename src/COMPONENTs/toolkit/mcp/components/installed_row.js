import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import { StatusBadge, SourceBadge, RuntimeBadge, ActionButton } from "./shared";

const InstalledRow = ({
  server,
  isDark,
  onViewDetail,
  onRetest,
  onToggleEnable,
}) => {
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  const isNeedsSecret = server.status === "needs_secret";
  const isRevoked = server.status === "revoked";
  const isEnabled = server.status === "enabled";

  const toolCount = server.cached_tools?.length || 0;
  const updatedAt = server.updated_at
    ? new Date(server.updated_at).toLocaleDateString()
    : "—";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${
          isNeedsSecret
            ? "rgba(251,146,60,0.25)"
            : isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.05)"
        }`,
        background: isNeedsSecret
          ? isDark
            ? "rgba(251,146,60,0.04)"
            : "rgba(251,146,60,0.03)"
          : isDark
            ? "rgba(255,255,255,0.02)"
            : "rgba(0,0,0,0.01)",
        transition: "border-color 0.15s ease",
      }}
    >
      {/* ── Icon ── */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.04)",
          flexShrink: 0,
        }}
      >
        <Icon
          src={server.runtime === "remote" ? "globe" : "server"}
          style={{ width: 18, height: 18 }}
          color={isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"}
        />
      </div>

      {/* ── Name & meta ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 12.5, fontFamily: "Jost", fontWeight: 500, color: textColor,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {server.display_name}
          </span>
          <StatusBadge status={server.status} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <SourceBadge sourceKind={server.source_kind} />
          <RuntimeBadge runtime={server.runtime} />
          {toolCount > 0 && (
            <span style={{ fontSize: 11, fontFamily: "Jost", color: mutedColor }}>
              {toolCount} tool{toolCount !== 1 ? "s" : ""}
            </span>
          )}
          <span style={{ fontSize: 11, fontFamily: "Jost", color: mutedColor }}>
            · {updatedAt}
          </span>
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <ActionButton
          icon="search"
          label="Detail"
          isDark={isDark}
          onClick={() => onViewDetail?.(server)}
        />
        <ActionButton
          icon="refresh"
          label="Test"
          isDark={isDark}
          onClick={() => onRetest?.(server)}
        />
        {isRevoked ? (
          <ActionButton
            icon="warning"
            label="Revoked"
            isDark={isDark}
            disabled
            color="#ef4444"
          />
        ) : (
          <ActionButton
            icon={isEnabled ? "stop_mini" : "play"}
            label={isEnabled ? "Disable" : "Enable"}
            isDark={isDark}
            onClick={() => onToggleEnable?.(server)}
            color={isEnabled ? "#f87171" : "#34d399"}
          />
        )}
      </div>
    </div>
  );
};

export default InstalledRow;
