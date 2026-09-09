/**
 * CommandRow — one row of the slash-command surface.
 *
 * Lifted out of command_menu.js when issue #232 turned the flat list into a
 * tree: the palette and the skill organizer's preview must draw byte-identical
 * rows, and the only way to guarantee that over time is for there to be one
 * row component rather than two that agree today.
 */
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

export const ROW_HEIGHT = 32;
export const BARE_ROW_HEIGHT = 28;

const CommandRow = ({
  item,
  active,
  isDark,
  onPick,
  onHover = null,
  entrance = null,
  rowRadius = 7,
  rowHeight = ROW_HEIGHT,
  refCallback,
}) => {
  const nameColor = isDark ? "rgba(var(--pupu-text-rgb),0.92)" : "rgba(var(--pupu-text-rgb),0.86)";
  const descColor = isDark ? "rgba(var(--pupu-text-rgb),0.42)" : "rgba(var(--pupu-text-rgb),0.44)";
  const iconColor = isDark ? "rgba(var(--pupu-text-rgb),0.6)" : "rgba(var(--pupu-text-rgb),0.55)";
  const sourceColor = isDark ? "rgba(var(--pupu-text-rgb),0.30)" : "rgba(var(--pupu-text-rgb),0.32)";
  const hasSource =
    typeof item.sourceLabel === "string" && item.sourceLabel.length > 0;

  /* Elevator Push entrance (bare/palette mode only) */
  const entranceStyle = entrance
    ? entrance.visible
      ? {
          opacity: 1,
          transform: "translateY(0)",
          transition: `transform 160ms cubic-bezier(0.22,1,0.36,1) ${entrance.delayMs}ms, opacity 160ms linear ${entrance.delayMs}ms`,
        }
      : {
          opacity: 0,
          transform: "translateY(-9px)",
          transition: "transform 110ms cubic-bezier(0.4,0,1,1), opacity 110ms cubic-bezier(0.4,0,1,1)",
        }
    : null;

  return (
    <div
      ref={refCallback}
      role="option"
      aria-selected={active}
      data-command-row
      data-active={active}
      onMouseDown={(e) => {
        // avoid stealing focus away from the textarea before the pick lands
        e.preventDefault();
        onPick(item);
      }}
      onMouseEnter={onHover || undefined}
      style={{
        boxSizing: "border-box",
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: rowHeight,
        padding: "0 8px",
        borderRadius: rowRadius,
        cursor: "pointer",
        ...(entranceStyle || {}),
      }}
    >
      {item.icon ? (
        <span
          style={{
            flexShrink: 0,
            width: 14,
            height: 14,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            src={item.icon}
            color={iconColor}
            style={{ width: 14, height: 14 }}
          />
        </span>
      ) : null}
      <span
        style={{
          flexShrink: 0,
          fontSize: 12.5,
          lineHeight: "16px",
          fontWeight: 500,
          color: nameColor,
        }}
      >
        {item.name}
      </span>
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 11.5,
          lineHeight: "16px",
          color: descColor,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.description}
      </span>
      {hasSource ? (
        <span
          style={{
            flex: "none",
            fontSize: 10,
            lineHeight: "16px",
            color: sourceColor,
            whiteSpace: "nowrap",
          }}
        >
          {item.sourceLabel}
        </span>
      ) : null}
    </div>
  );
};

export default CommandRow;
