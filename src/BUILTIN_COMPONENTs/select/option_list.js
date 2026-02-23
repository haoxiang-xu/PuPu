import { isValidElement, useState } from "react";
import AnimatedChildren from "../class/animated_children";
import { get_option_text, render_icon } from "./use_select";
import Icon from "../icon/icon";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  OptionItem — single selectable option
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const OptionItem = ({
  option,
  flatIndex,
  isSelected,
  isHighlighted,
  onMouseEnter,
  onMouseDown,
  onClick,
  refCallback,
  fontSize,
  fontFamily,
  baseColor,
  option_theme,
  option_style,
}) => {
  const isDisabled = !!option?.disabled;
  const optionColor = isDisabled
    ? (option_theme?.disabledColor ?? "rgba(0, 0, 0, 0.35)")
    : baseColor;
  const iconValue = option?.icon;
  const showIcon =
    iconValue && (typeof iconValue === "string" || isValidElement(iconValue));

  const itemHeight = option_theme?.height ?? 28;
  const itemPadding = option_theme?.padding ?? "0 10px";

  return (
    <div
      key={`${option?.value ?? flatIndex}`}
      ref={refCallback}
      role="option"
      aria-selected={isSelected}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        position: "relative",
        height: itemHeight,
        padding: itemPadding,
        borderRadius: option_theme?.borderRadius ?? 5,
        cursor: isDisabled ? "not-allowed" : "pointer",
        color: optionColor,
        backgroundColor: isHighlighted
          ? (option_theme?.hoverBackgroundColor ?? "rgba(0, 0, 0, 0.06)")
          : isSelected
            ? (option_theme?.selectedBackgroundColor ??
              "rgba(10, 133, 255, 0.14)")
            : "transparent",
        ...option_style,
        gap: showIcon ? (option_theme?.gap ?? 6) : 0,
      }}
    >
      {showIcon ? <>{render_icon(iconValue, fontSize, optionColor)}</> : null}
      <span
        style={{
          position: "relative",
          fontFamily,
          fontSize,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {option?.label ?? get_option_text(option)}
      </span>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  GroupHeader — clickable header that toggles collapse
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const GroupHeader = ({
  group,
  collapsed,
  onToggle,
  fontSize,
  fontFamily,
  baseColor,
  group_theme,
  isDark,
}) => {
  const [hovered, setHovered] = useState(false);

  const headerFontSize =
    group_theme?.headerFontSize ?? Math.round(fontSize * 0.72);
  const headerColor =
    group_theme?.headerColor ??
    (isDark ? "rgba(255, 255, 255, 0.45)" : "rgba(0, 0, 0, 0.45)");
  const headerFontWeight = group_theme?.headerFontWeight ?? 600;
  const headerHeight = group_theme?.headerHeight ?? 36;
  const headerPadding = group_theme?.headerPadding ?? "0 10px";
  const expandIconSize = group_theme?.expandIconSize ?? 12;
  const iconSize = group_theme?.iconSize ?? 13;
  const iconGap = group_theme?.iconGap ?? 4;
  const hoverBg =
    group_theme?.headerHoverBackgroundColor ??
    (isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)");

  const groupIcon = group.icon;
  const showGroupIcon =
    groupIcon && (typeof groupIcon === "string" || isValidElement(groupIcon));

  return (
    <div
      role="button"
      aria-expanded={!collapsed}
      tabIndex={-1}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onToggle(group.group)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: showGroupIcon ? iconGap : 2,
        height: headerHeight,
        padding: headerPadding,
        borderRadius: 5,
        cursor: "pointer",
        backgroundColor: hovered ? hoverBg : "transparent",
        transition: "background-color 0.15s ease",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* expand/collapse chevron */}
      <Icon
        src="arrow_down"
        color={headerColor}
        style={{
          width: expandIconSize,
          height: expandIconSize,
          transition: "transform 0.2s cubic-bezier(0.32, 1, 0.32, 1)",
          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          flex: "none",
          opacity: 0.7,
        }}
      />

      {/* group icon */}
      {showGroupIcon && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "100%",
            flex: "none",
          }}
        >
          {render_icon(groupIcon, iconSize, headerColor)}
        </div>
      )}

      {/* group label */}
      <span
        style={{
          fontFamily,
          fontSize: headerFontSize,
          fontWeight: headerFontWeight,
          color: headerColor,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {group.group}
      </span>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  OptionList — the dropdown content (groups + options)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Renders the listbox content — either flat or grouped.
 *
 * When `hasGroups` is true, iterates `filteredGroups`, rendering a
 * GroupHeader + AnimatedChildren wrapper for each group, plus any
 * ungrouped items at the end.
 *
 * `flatSelectable` is the flat array used by the hook for keyboard nav;
 * each option's position in that array is its `flatIndex`, which must
 * match `highlightedIndex`.
 */
const OptionList = ({
  // grouped data from useSelect
  hasGroups,
  filteredGroups,
  filteredUngrouped,
  flatSelectable,
  // state
  selectedValue,
  highlightedIndex,
  setHighlightedIndex,
  select_option,
  on_group_toggle,
  // refs
  optionRefs,
  // styling
  fontSize,
  fontFamily,
  baseColor,
  placeholderColor,
  option_theme,
  group_theme,
  option_style,
  isDark,
}) => {
  if (!hasGroups) {
    /* ── flat mode (backward compatible) ── */
    if (filteredUngrouped.length === 0) {
      return (
        <div
          style={{
            padding: "8px 10px",
            color: placeholderColor,
            fontFamily,
            fontSize: fontSize * 0.9,
          }}
        >
          No results
        </div>
      );
    }
    return filteredUngrouped.map((option, index) => (
      <OptionItem
        key={`${option?.value ?? index}`}
        option={option}
        flatIndex={index}
        isSelected={option?.value === selectedValue}
        isHighlighted={index === highlightedIndex}
        onMouseEnter={() => {
          if (!option?.disabled) setHighlightedIndex(index);
        }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => select_option(option)}
        refCallback={(el) => {
          optionRefs.current[index] = el;
        }}
        fontSize={fontSize}
        fontFamily={fontFamily}
        baseColor={baseColor}
        option_theme={option_theme}
        option_style={option_style}
      />
    ));
  }

  /* ── grouped mode ── */
  // Build a mapping: option ⇒ flatIndex
  // flatSelectable comes from the hook; we need to figure out each option's
  // position there to match highlightedIndex.
  const optionToFlatIndex = new Map();
  flatSelectable.forEach((opt, i) => {
    // Use object identity — each option object should be unique
    if (!optionToFlatIndex.has(opt)) optionToFlatIndex.set(opt, i);
  });

  const totalGroups = filteredGroups.length;
  const hasUngrouped = filteredUngrouped.length > 0;
  const noResults = totalGroups === 0 && !hasUngrouped;

  if (noResults) {
    return (
      <div
        style={{
          padding: "8px 10px",
          color: placeholderColor,
          fontFamily,
          fontSize: fontSize * 0.9,
        }}
      >
        No results
      </div>
    );
  }

  return (
    <>
      {filteredGroups.map((g, gi) => {
        const isCollapsed = g.collapsed && !g.forceOpen;
        const separatorMargin = group_theme?.separatorMargin ?? "3px 10px";
        return (
          <div key={`group-${g.group}`}>
            {/* separator above group (except first) */}
            {gi > 0 ? (
              <div
                style={{
                  height: 1,
                  margin: separatorMargin,
                  backgroundColor:
                    group_theme?.separatorColor ??
                    (isDark
                      ? "rgba(255, 255, 255, 0.06)"
                      : "rgba(0, 0, 0, 0.06)"),
                }}
              />
            ) : null}
            <GroupHeader
              group={g}
              collapsed={isCollapsed}
              onToggle={on_group_toggle}
              fontSize={fontSize}
              fontFamily={fontFamily}
              baseColor={baseColor}
              group_theme={group_theme}
              isDark={isDark}
            />
            <AnimatedChildren open={!isCollapsed}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  marginLeft: group_theme?.childIndent ?? 15,
                  borderLeft: `${group_theme?.accentBarWidth ?? 2}px solid ${
                    group_theme?.accentBarColor ??
                    (isDark
                      ? "rgba(255, 255, 255, 0.07)"
                      : "rgba(0, 0, 0, 0.07)")
                  }`,
                  paddingLeft: group_theme?.childBarGap ?? 6,
                  paddingTop: 3,
                  paddingBottom: 0,
                }}
              >
                {g.options.map((option) => {
                  const fi = optionToFlatIndex.get(option) ?? -1;
                  return (
                    <OptionItem
                      key={`${option?.value ?? fi}`}
                      option={option}
                      flatIndex={fi}
                      isSelected={option?.value === selectedValue}
                      isHighlighted={fi === highlightedIndex}
                      onMouseEnter={() => {
                        if (!option?.disabled && fi >= 0)
                          setHighlightedIndex(fi);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => select_option(option)}
                      refCallback={(el) => {
                        if (fi >= 0) optionRefs.current[fi] = el;
                      }}
                      fontSize={fontSize}
                      fontFamily={fontFamily}
                      baseColor={baseColor}
                      option_theme={option_theme}
                      option_style={option_style}
                    />
                  );
                })}
              </div>
            </AnimatedChildren>
          </div>
        );
      })}

      {/* separator before ungrouped items */}
      {hasUngrouped && totalGroups > 0 ? (
        <div
          style={{
            height: 1,
            margin: group_theme?.separatorMargin ?? "3px 10px",
            backgroundColor:
              group_theme?.separatorColor ??
              (isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"),
          }}
        />
      ) : null}

      {/* ungrouped items at the end */}
      {filteredUngrouped.map((option) => {
        const fi = optionToFlatIndex.get(option) ?? -1;
        return (
          <OptionItem
            key={`${option?.value ?? fi}`}
            option={option}
            flatIndex={fi}
            isSelected={option?.value === selectedValue}
            isHighlighted={fi === highlightedIndex}
            onMouseEnter={() => {
              if (!option?.disabled && fi >= 0) setHighlightedIndex(fi);
            }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => select_option(option)}
            refCallback={(el) => {
              if (fi >= 0) optionRefs.current[fi] = el;
            }}
            fontSize={fontSize}
            fontFamily={fontFamily}
            baseColor={baseColor}
            option_theme={option_theme}
            option_style={option_style}
          />
        );
      })}
    </>
  );
};

export default OptionList;
