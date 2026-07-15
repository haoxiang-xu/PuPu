import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { ToolkitIconFrame } from "./toolkit_icon";

/* PluginListRow — the settings-isomorphic list row shared by Installed,
   Discover and Categories (T3). Ground truth: mockup screen ③ (Installed
   list), `.lrow`/`.lic`/`.lnm`/`.ldes`/`.cchip` blocks. 36px icon, name +
   optional mono command chip, muted single-line description, and a
   caller-supplied right slot (auto-enable SemiSwitch on Installed, an
   UPDATE pill, or a Get/Open pill on Discover/Categories) passed as
   `children`. No divider between rows — sections (SettingsSection) provide
   the visual grouping instead. */
const PluginListRow = ({
  icon,
  isDark = false,
  name,
  command,
  description,
  onOpenDetail,
  fallbackColor,
  testId,
  children,
}) => {
  const { theme } = useContext(ConfigContext) || {};
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const nameColor = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.85)";
  const descColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.40)";
  const chipColor = isDark ? "#9aa8ff" : "#2563eb";
  const chipBg = "rgba(124,140,248,0.10)";

  return (
    <div
      data-testid={testId}
      onClick={onOpenDetail}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "11px 0",
        cursor: onOpenDetail ? "pointer" : "default",
      }}
    >
      <ToolkitIconFrame
        icon={icon}
        isDark={isDark}
        size={36}
        iconSize={18}
        borderRadius={10}
        fallbackColor={fallbackColor}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 550,
              fontFamily,
              color: nameColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
          {command && (
            <span
              style={{
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 10,
                color: chipColor,
                background: chipBg,
                borderRadius: 5,
                padding: "1px 6px",
                flexShrink: 0,
              }}
            >
              {command}
            </span>
          )}
        </div>
        {description && (
          <div
            style={{
              fontSize: 11,
              fontFamily,
              color: descColor,
              marginTop: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {description}
          </div>
        )}
      </div>

      {children && (
        <div
          onClick={(event) => event.stopPropagation()}
          style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default PluginListRow;
