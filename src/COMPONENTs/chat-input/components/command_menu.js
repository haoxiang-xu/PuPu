/**
 * CommandMenu — selector-style slash-command autocomplete list.
 *
 * Minimal seed of PuPu's future main command system: pure presentational
 * component, prefix-filtered items are handed in by the caller (chat_input),
 * this only renders the scrolling list + active-row highlight. No fuzzy
 * search, no categories, no param hints — those are explicitly out of scope
 * for this seed.
 */
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const ROW_HEIGHT = 32;
const MAX_VISIBLE_ROWS = 6;

/**
 * `bare` strips the floating-card chrome so the list can live inside another
 * surface (the command palette panel). `visible` drives the Elevator Push
 * row entrance there: rows start hidden (translateY(-9px), transparent) and
 * cascade in top-down once visible flips true.
 */
const CommandMenu = ({
  items = [],
  activeIndex = 0,
  onPick = () => {},
  isDark = false,
  bare = false,
  visible = true,
}) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const surfaceBg = isDark
    ? "rgba(24, 24, 26, 0.66)"
    : "rgba(255, 255, 255, 0.72)";
  const border = isDark
    ? "1px solid rgba(255,255,255,0.12)"
    : "1px solid rgba(0,0,0,0.10)";
  const shadow = isDark
    ? "0 10px 30px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.22)"
    : "0 10px 30px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)";

  const chrome = bare
    ? { padding: "5px 5px 0" }
    : {
        backgroundColor: surfaceBg,
        backdropFilter: "blur(18px) saturate(1.4)",
        WebkitBackdropFilter: "blur(18px) saturate(1.4)",
        border,
        borderRadius: 10,
        boxShadow: shadow,
        padding: 3,
      };

  return (
    <div
      role="listbox"
      aria-label="斜杠命令"
      className="scrollable"
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT,
        overflowY: "auto",
        overscrollBehavior: "contain",
        ...chrome,
      }}
    >
      {items.map((item, index) => (
        <CommandRow
          key={item.name}
          item={item}
          active={index === activeIndex}
          isDark={isDark}
          onPick={onPick}
          entrance={
            bare
              ? {
                  visible,
                  delayMs: 130 + Math.min(index, MAX_VISIBLE_ROWS) * 35,
                }
              : null
          }
        />
      ))}
    </div>
  );
};

const CommandRow = ({ item, active, isDark, onPick, entrance = null }) => {
  const activeBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)";
  const nameColor = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.86)";
  const descColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.44)";
  const iconColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)";

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
      role="option"
      aria-selected={active}
      data-command-row
      data-active={active}
      onMouseDown={(e) => {
        // avoid stealing focus away from the textarea before the pick lands
        e.preventDefault();
        onPick(item);
      }}
      style={{
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: ROW_HEIGHT,
        padding: "0 8px",
        borderRadius: 7,
        backgroundColor: active ? activeBg : "transparent",
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
    </div>
  );
};

export default CommandMenu;
