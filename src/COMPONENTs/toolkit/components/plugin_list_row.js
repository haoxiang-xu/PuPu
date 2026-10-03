import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { ToolkitIconFrame } from "./toolkit_icon";
import TypeTag from "./type_tag";

/* PluginListRow — the settings-isomorphic list row shared by Installed,
   Discover and Store (T3). Ground truth: mockup screen ③ (Installed
   list), `.lrow`/`.lic`/`.lnm`/`.ldes`/`.cchip` blocks. 36px icon, name +
   optional mono command chip, muted single-line description, and a
   caller-supplied right slot (auto-enable SemiSwitch on Installed, an
   UPDATE pill, or a Get/Open pill on Discover/Store) passed as
   `children`. No divider between rows — sections (SettingsSection) provide
   the visual grouping instead.

   `commandFirst` (store-final, 2026-07-17): the Store page's Skills segment
   puts the command chip BEFORE the name — "this view, you're picking a
   command" — per mockup screen ② `.rnm` order, with a slightly larger chip
   (11px/2px 7px vs the default 10px/1px 6px). Off by default; every other
   caller (Installed, Discover, Store's All/Toolkits/MCP segments) keeps the
   name-first order. */
const PluginListRow = ({
  icon,
  isDark = false,
  name,
  types,
  command,
  description,
  onOpenDetail,
  fallbackColor,
  testId,
  commandFirst = false,
  children,
}) => {
  const { theme } = useContext(ConfigContext) || {};
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const nameColor = isDark ? "rgba(var(--pupu-text-rgb),0.88)" : "rgba(var(--pupu-text-rgb),0.85)";
  const descColor = isDark ? "rgba(var(--pupu-text-rgb),0.38)" : "rgba(var(--pupu-text-rgb),0.40)";
  /* The command chip used to be a tinted pill. It is a caption now: the
     store carries no colour fills, and a mono face already separates a
     /command from the name beside it. */
  const chipColor = "rgba(var(--pupu-text-rgb),0.42)";

  const commandChip = command && (
    <span
      style={{
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: commandFirst ? 11 : 10,
        color: chipColor,
        padding: commandFirst ? "2px 7px" : "1px 6px",
        /* The name is the row's only scanning cue (13 of 24 registry entries
           share one grey glyph), so a trailing chip takes only the space the
           name leaves over. A shrink ratio is not enough: it still hands the
           name a sliver of every overflow, and ellipsis fires on any sliver. */
        ...(commandFirst ? { flexShrink: 1000 } : { flex: "1 1 0px" }),
        minWidth: 0,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {command}
    </span>
  );

  return (
    <div
      data-testid={testId}
      onClick={onOpenDetail}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        padding: "8px 0",
        cursor: onOpenDetail ? "pointer" : "default",
      }}
    >
      <ToolkitIconFrame
        icon={icon}
        isDark={isDark}
        size={26}
        iconSize={15}
        borderRadius={7}
        fallbackColor={fallbackColor}
        style={{ alignSelf: "center" }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          {commandFirst && commandChip}
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 400,
              fontFamily,
              color: nameColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
          <TypeTag types={types} />
          {!commandFirst && commandChip}
        </div>
        {description && (
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 300,
              fontFamily,
              color: descColor,
              marginTop: 2,
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
          style={{ flexShrink: 0, display: "flex", alignItems: "center", alignSelf: "center", gap: 8 }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default PluginListRow;
