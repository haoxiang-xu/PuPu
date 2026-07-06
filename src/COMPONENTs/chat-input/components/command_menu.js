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

const ROW_HEIGHT = 38;
const MAX_VISIBLE_ROWS = 6;

const CommandMenu = ({ items = [], activeIndex = 0, onPick = () => {}, isDark = false }) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const surfaceBg = isDark
    ? "var(--pupu-surface, rgba(30,30,30,0.98))"
    : "var(--pupu-surface, rgba(255,255,255,0.98))";
  const border = isDark
    ? "1px solid rgba(255,255,255,0.10)"
    : "1px solid rgba(0,0,0,0.08)";
  const shadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.35)"
    : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)";

  return (
    <div
      role="listbox"
      aria-label="斜杠命令"
      className="scrollable"
      style={{
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        maxHeight: MAX_VISIBLE_ROWS * ROW_HEIGHT,
        overflowY: "auto",
        overscrollBehavior: "contain",
        backgroundColor: surfaceBg,
        border,
        borderRadius: 12,
        boxShadow: shadow,
        padding: 4,
      }}
    >
      {items.map((item, index) => (
        <CommandRow
          key={item.name}
          item={item}
          active={index === activeIndex}
          isDark={isDark}
          onPick={onPick}
        />
      ))}
    </div>
  );
};

const CommandRow = ({ item, active, isDark, onPick }) => {
  const activeBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)";
  const nameColor = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.86)";
  const descColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.44)";
  const iconColor = isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)";

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
        gap: 10,
        height: ROW_HEIGHT,
        padding: "0 10px",
        borderRadius: 8,
        backgroundColor: active ? activeBg : "transparent",
        cursor: "pointer",
      }}
    >
      {item.icon ? (
        <span
          style={{
            flexShrink: 0,
            width: 16,
            height: 16,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            src={item.icon}
            color={iconColor}
            style={{ width: 16, height: 16 }}
          />
        </span>
      ) : null}
      <span
        style={{
          flexShrink: 0,
          fontSize: 13,
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
          fontSize: 12,
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
