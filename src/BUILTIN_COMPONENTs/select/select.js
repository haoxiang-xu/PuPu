import {
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import {
  themeHighlightColor,
  themeHighlightRgba,
} from "../../CONTAINERs/config/theme_highlight";
import Tooltip from "../tooltip/tooltip";
import Icon from "../icon/icon";
import ScaleHighlight from "../class/scale_highlight";
import SlidingHighlight from "../class/sliding_highlight";
import useSelect, {
  render_icon,
  useDropdownWheelGuard,
} from "./use_select";
import OptionList, { OptionItem } from "./option_list";
import { useTranslation } from "../mini_react/use_translation";

/* ── palette-rail provider icon (Button-style scale-in highlight) ── */
const RailItem = ({
  group,
  active,
  dimmed,
  holdsSelection,
  accentColor,
  baseColor,
  fontFamily,
  isDark,
  onPick,
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      title={group.group}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: 34,
        height: 34,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        opacity: dimmed ? 0.35 : active || hovered ? 1 : 0.6,
        transition: "opacity 0.15s ease",
      }}
    >
      <ScaleHighlight
        visible={active || (hovered && !dimmed)}
        color={isDark ? "rgba(var(--pupu-text-rgb),0.10)" : "rgba(var(--pupu-text-rgb),0.06)"}
        borderRadius={12}
      />
      <span
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {group.icon ? (
          render_icon(group.icon, 16, baseColor)
        ) : (
          <span
            style={{
              fontFamily,
              fontSize: 12,
              fontWeight: 600,
              color: baseColor,
            }}
          >
            {String(group.group || "?")
              .slice(0, 1)
              .toUpperCase()}
          </span>
        )}
      </span>
      {active ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: -8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 3,
            height: 14,
            borderRadius: 2,
            backgroundColor: accentColor,
            zIndex: 1,
          }}
        />
      ) : null}
      {holdsSelection ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: 3,
            top: 3,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: accentColor,
            border: "1.5px solid rgb(var(--pupu-surface-rgb))",
            zIndex: 1,
          }}
        />
      ) : null}
    </div>
  );
};

const default_gap_width = 8;
const default_left_right_padding = 8;
const default_top_bottom_padding = 6;

const SinkingSelect = ({
  options = [],
  value,
  set_value = () => {},
  placeholder = "Select...",
  filterable = true,
  filter_mode = "trigger",
  search_placeholder = "Search...",
  style,
  dropdown_style,
  dropdown_position = "bottom",
  option_style,
  disabled = false,
  show_trigger_icon = true,
  open,
  on_open_change = () => {},
  on_group_toggle = () => {},
}) => {
  const { theme } = useContext(ConfigContext);
  const select_theme = theme?.select || {};
  const dropdown_theme = select_theme?.dropdown || {};
  const option_theme = select_theme?.option || {};
  const search_theme = select_theme?.search || {};
  const group_theme = select_theme?.group || {};

  const [isTriggerFocused, setIsTriggerFocused] = useState(false);
  const dropdownPanelRef = useRef(null);
  const dropdownListRef = useRef(null);

  const hook = useSelect({
    options,
    value,
    set_value,
    filterable,
    filter_mode,
    disabled,
    open,
    on_open_change,
    on_group_toggle,
  });

  const {
    selectedValue,
    selectedOption,
    selectedTriggerText,
    mergedOpen,
    query,
    highlightedIndex,
    setHighlightedIndex,
    setHighlightedIndexFromHover,
    triggerWidth,
    hasGroups,
    filteredGroups,
    filteredUngrouped,
    flatSelectable,
    triggerRef,
    triggerInputRef,
    searchInputRef,
    optionRefs,
    listboxIdRef,
    emit_open_change,
    select_option,
    handle_key_down,
    handle_query_change,
  } = hook;

  useDropdownWheelGuard(mergedOpen, dropdownPanelRef, dropdownListRef);

  const baseFontSize =
    style?.fontSize ?? select_theme?.fontSize ?? theme?.input?.fontSize ?? 16;
  const baseHeight =
    style?.height ??
    select_theme?.height ??
    theme?.input?.height ??
    baseFontSize + 16;
  const baseColor =
    style?.color ?? select_theme?.color ?? theme?.color ?? "black";
  const placeholderColor =
    style?.placeholderColor ??
    select_theme?.placeholderColor ??
    "rgba(0, 0, 0, 0.45)";
  const fontFamily = style?.fontFamily || theme?.font?.fontFamily || "Jost";

  const focusOutline =
    select_theme?.outline?.onFocus ??
    theme?.input?.outline?.onFocus ??
    "2px solid rgba(10, 133, 255, 1)";
  const blurOutline =
    select_theme?.outline?.onBlur ??
    theme?.input?.outline?.onBlur ??
    "1px solid #CCCCCC";
  const outlineValue =
    style?.outline ||
    (isTriggerFocused || mergedOpen ? focusOutline : blurOutline);
  const triggerInputColor = mergedOpen
    ? query
      ? baseColor
      : placeholderColor
    : selectedTriggerText
      ? baseColor
      : placeholderColor;

  const dropdownMaxWidth =
    dropdown_style?.maxWidth ??
    dropdown_theme?.maxWidth ??
    (triggerWidth || undefined);
  const dropdownMinWidth = triggerWidth || undefined;
  const dropdownMaxHeight =
    dropdown_style?.maxHeight ?? dropdown_theme?.maxHeight ?? "auto";

  const selectedIcon = selectedOption?.icon;
  const showSelectedIcon =
    show_trigger_icon &&
    selectedIcon &&
    (typeof selectedIcon === "string" || isValidElement(selectedIcon));

  const triggerContent = (
    <div
      ref={triggerRef}
      role="combobox"
      aria-controls={listboxIdRef.current}
      aria-expanded={mergedOpen}
      aria-disabled={disabled}
      tabIndex={filter_mode === "panel" ? (disabled ? -1 : 0) : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: `${default_gap_width}px`,
        padding:
          style?.padding ??
          `${default_top_bottom_padding}px ${default_left_right_padding}px`,
        height: baseHeight,
        minWidth: style?.minWidth,
        width: style?.width,
        backgroundColor:
          style?.backgroundColor ??
          select_theme?.backgroundColor ??
          theme?.input?.backgroundColor ??
          "white",
        borderRadius:
          style?.borderRadius ??
          select_theme?.borderRadius ??
          theme?.input?.borderRadius ??
          4,
        boxShadow:
          style?.boxShadow ??
          select_theme?.boxShadow ??
          theme?.input?.boxShadow ??
          "none",
        outline: outlineValue,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1,
        ...style,
      }}
      onFocus={() => setIsTriggerFocused(true)}
      onBlur={() => setIsTriggerFocused(false)}
      onKeyDown={filter_mode === "panel" ? handle_key_down : undefined}
    >
      {showSelectedIcon ? (
        <div style={{ display: "flex", alignItems: "center" }}>
          {render_icon(selectedIcon, baseFontSize + 4, baseColor)}
        </div>
      ) : null}
      {filter_mode === "trigger" ? (
        <input
          ref={triggerInputRef}
          type="text"
          disabled={disabled}
          readOnly={!filterable}
          value={mergedOpen ? query : selectedTriggerText}
          placeholder={placeholder}
          style={{
            flex: 1,
            fontFamily,
            fontSize: baseFontSize,
            border: "1px solid rgba(255, 255, 255, 0)",
            backgroundColor: "rgba(0,0,0,0)",
            color: triggerInputColor,
            caretColor: baseColor,
            outline: "none",
            minWidth: 0,
          }}
          onFocus={() => {
            if (!mergedOpen) emit_open_change(true);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handle_key_down}
          onChange={(e) => handle_query_change(e.target.value)}
        />
      ) : (
        <div
          style={{
            flex: 1,
            fontFamily,
            fontSize: baseFontSize,
            color: selectedOption ? baseColor : placeholderColor,
            userSelect: "none",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {selectedTriggerText || placeholder}
        </div>
      )}
      <Icon
        src="arrow_down"
        color={baseColor}
        style={{
          width: baseFontSize + 4,
          height: baseFontSize + 4,
          transition: "transform 120ms ease",
          transform: mergedOpen ? "rotate(180deg)" : "rotate(0deg)",
          flex: "none",
        }}
      />
    </div>
  );

  const dropdownContent = (
    <div
      ref={dropdownPanelRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: dropdownMinWidth - 12,
        maxWidth: dropdownMaxWidth - 12,
        padding: dropdown_theme?.padding ?? 6,
        backgroundColor:
          dropdown_style?.backgroundColor ??
          dropdown_theme?.backgroundColor ??
          theme?.backgroundColor ??
          "white",
        border: "1px solid var(--pupu-menu-border, transparent)",
        borderRadius:
          dropdown_style?.borderRadius ?? dropdown_theme?.borderRadius ?? 10,
        boxShadow:
          dropdown_style?.boxShadow ??
          dropdown_theme?.boxShadow ??
          "0 12px 20px rgba(0, 0, 0, 0.12)",
        ...dropdown_style,
      }}
      onKeyDown={filter_mode === "panel" ? handle_key_down : undefined}
    >
      {filterable && filter_mode === "panel" ? (
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          placeholder={search_placeholder}
          onChange={(e) => handle_query_change(e.target.value)}
          onKeyDown={handle_key_down}
          style={{
            fontFamily,
            fontSize: baseFontSize,
            padding: search_theme?.padding ?? "6px 10px",
            borderRadius: search_theme?.borderRadius ?? 5,
            border: "1px solid rgba(255, 255, 255, 0)",
            outline: "none",
            backgroundColor:
              search_theme?.backgroundColor ?? "rgba(0, 0, 0, 0.05)",
            color: baseColor,
          }}
        />
      ) : null}
      <div
        ref={dropdownListRef}
        id={listboxIdRef.current}
        role="listbox"
        className="scrollable"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
          overscrollBehavior: "contain",
          maxHeight: dropdownMaxHeight,
          padding: 2,
        }}
      >
        <OptionList
          hasGroups={hasGroups}
          filteredGroups={filteredGroups}
          filteredUngrouped={filteredUngrouped}
          flatSelectable={flatSelectable}
          selectedValue={selectedValue}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          setHighlightedIndexFromHover={setHighlightedIndexFromHover}
          select_option={select_option}
          on_group_toggle={on_group_toggle}
          optionRefs={optionRefs}
          fontSize={baseFontSize}
          fontFamily={fontFamily}
          baseColor={baseColor}
          placeholderColor={placeholderColor}
          option_theme={option_theme}
          group_theme={group_theme}
          option_style={option_style}
          isDark={false}
        />
      </div>
    </div>
  );

  return (
    <Tooltip
      trigger={["click"]}
      position={dropdown_position}
      offset={8}
      align="start"
      show_arrow={false}
      tooltip_component={dropdownContent}
      style={{
        padding: 0,
        backgroundColor: "transparent",
        boxShadow: "none",
      }}
      open={mergedOpen}
      on_open_change={emit_open_change}
      wrapper_style={{ width: style?.width }}
    >
      {triggerContent}
    </Tooltip>
  );
};

/* ── FloatingSelect ───────────────────────────────────────────────────────── */
const FloatingSelect = ({
  options = [],
  value,
  set_value = () => {},
  placeholder = "Select...",
  filterable = true,
  filter_mode = "trigger",
  search_placeholder = "Search...",
  label,
  style,
  dropdown_style,
  dropdown_position = "bottom",
  option_style,
  disabled = false,
  show_trigger_icon = true,
  open,
  on_open_change = () => {},
  on_group_toggle = () => {},
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const dropdown_theme = theme?.select?.dropdown || {};
  const option_theme = theme?.select?.option || {};
  const search_theme = theme?.select?.search || {};
  const group_theme = theme?.select?.group || {};

  const [isTriggerFocused, setIsTriggerFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const dropdownPanelRef = useRef(null);
  const dropdownListRef = useRef(null);

  const hook = useSelect({
    options,
    value,
    set_value,
    filterable,
    filter_mode,
    disabled,
    open,
    on_open_change,
    on_group_toggle,
  });

  const {
    selectedValue,
    selectedOption,
    selectedTriggerText,
    mergedOpen,
    query,
    highlightedIndex,
    setHighlightedIndex,
    setHighlightedIndexFromHover,
    triggerWidth,
    hasGroups,
    filteredGroups,
    filteredUngrouped,
    flatSelectable,
    triggerRef,
    triggerInputRef,
    searchInputRef,
    optionRefs,
    listboxIdRef,
    emit_open_change,
    select_option,
    handle_key_down,
    handle_query_change,
  } = hook;

  useDropdownWheelGuard(mergedOpen, dropdownPanelRef, dropdownListRef);

  /* ── card-like derived styles ── */
  const isDark = onThemeMode === "dark_mode";
  const baseColor = style?.color || theme?.color || (isDark ? "#CCC" : "#222");
  const fontSize =
    style?.fontSize || theme?.select?.fontSize || theme?.input?.fontSize || 16;
  const fontFamily = style?.fontFamily || theme?.font?.fontFamily || "Jost";
  const borderRadius =
    style?.borderRadius ||
    theme?.select?.borderRadius ||
    theme?.input?.borderRadius ||
    7;
  const bg =
    style?.backgroundColor ??
    (isDark ? "rgba(30, 30, 30, 0.95)" : "rgba(255, 255, 255, 0.95)");
  const cardBorder = isDark
    ? "1px solid rgba(255, 255, 255, 0.08)"
    : "1px solid rgba(0, 0, 0, 0.06)";
  const shadow = isDark
    ? "0 4px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)"
    : "0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)";
  const shadowHover = isDark
    ? "0 12px 36px rgba(0, 0, 0, 0.55), 0 3px 8px rgba(0, 0, 0, 0.35)"
    : "0 12px 36px rgba(0, 0, 0, 0.10), 0 3px 8px rgba(0, 0, 0, 0.06)";
  const placeholderColor = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const labelColor =
    isTriggerFocused || mergedOpen ? baseColor : placeholderColor;

  const hasValue = !!selectedTriggerText;
  const isActive = isTriggerFocused || mergedOpen || hasValue;
  const dropdownMinWidth = triggerWidth || undefined;
  const dropdownMaxHeight =
    dropdown_style?.maxHeight ?? dropdown_theme?.maxHeight ?? "auto";

  const selectedIcon = selectedOption?.icon;
  const showSelectedIcon =
    show_trigger_icon &&
    selectedIcon &&
    (typeof selectedIcon === "string" || isValidElement(selectedIcon));

  const triggerContent = (
    <div
      ref={triggerRef}
      role="combobox"
      aria-controls={listboxIdRef.current}
      aria-expanded={mergedOpen}
      aria-disabled={disabled}
      tabIndex={filter_mode === "panel" ? (disabled ? -1 : 0) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setIsTriggerFocused(true)}
      onBlur={() => setIsTriggerFocused(false)}
      onKeyDown={filter_mode === "panel" ? handle_key_down : undefined}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: style?.width || "100%",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* card-like container */}
      <div
        style={{
          position: "relative",
          flex: 1,
          display: "flex",
          alignItems: "center",
          gap: 6,
          backgroundColor: bg,
          border: cardBorder,
          borderRadius,
          boxShadow:
            hovered || isTriggerFocused || mergedOpen ? shadowHover : shadow,
          transition: "box-shadow 0.3s ease",
          padding: `${Math.round(fontSize * 0.55)}px ${Math.round(fontSize * 0.75)}px`,
        }}
      >
        {showSelectedIcon && (
          <div style={{ display: "flex", alignItems: "center" }}>
            {render_icon(selectedIcon, fontSize + 2, baseColor)}
          </div>
        )}
        {filter_mode === "trigger" ? (
          <input
            ref={triggerInputRef}
            type="text"
            disabled={disabled}
            readOnly={!filterable}
            value={mergedOpen ? query : selectedTriggerText}
            placeholder={!label || isActive ? placeholder || "" : ""}
            style={{
              flex: 1,
              fontFamily,
              fontSize,
              border: "none",
              background: "transparent",
              color: mergedOpen
                ? query
                  ? baseColor
                  : placeholderColor
                : selectedTriggerText
                  ? baseColor
                  : placeholderColor,
              caretColor: baseColor,
              outline: "none",
              padding: 0,
              minWidth: 0,
              cursor: disabled ? "not-allowed" : "text",
            }}
            onFocus={() => {
              if (!mergedOpen) emit_open_change(true);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handle_key_down}
            onChange={(e) => handle_query_change(e.target.value)}
          />
        ) : (
          <div
            style={{
              flex: 1,
              fontFamily,
              fontSize,
              color: selectedOption ? baseColor : placeholderColor,
              userSelect: "none",
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {selectedTriggerText || placeholder}
          </div>
        )}
        <Icon
          src="arrow_down"
          color={baseColor}
          style={{
            width: fontSize + 2,
            height: fontSize + 2,
            transition: "transform 120ms ease",
            transform: mergedOpen ? "rotate(180deg)" : "rotate(0deg)",
            flex: "none",
          }}
        />
        {/* floating label */}
        {label && (
          <span
            style={{
              position: "absolute",
              left: Math.round(fontSize * 0.75),
              top: isActive
                ? `calc(0% - ${(fontSize * 0.75) / 2 + 6}px)`
                : "50%",
              transform: "translateY(-50%)",
              fontSize: isActive ? fontSize * 0.75 : fontSize,
              fontFamily,
              color: labelColor,
              opacity: isActive ? 0.6 : 0.45,
              transition: "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)",
              pointerEvents: "none",
              userSelect: "none",
              zIndex: 1,
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );

  const dropdownContent = (
    <div
      ref={dropdownPanelRef}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: dropdownMinWidth ? dropdownMinWidth - 12 : undefined,
        padding: dropdown_theme?.padding ?? 6,
        backgroundColor:
          dropdown_style?.backgroundColor ??
          dropdown_theme?.backgroundColor ??
          theme?.backgroundColor ??
          "white",
        border: "1px solid var(--pupu-menu-border, transparent)",
        borderRadius:
          dropdown_style?.borderRadius ?? dropdown_theme?.borderRadius ?? 10,
        boxShadow:
          dropdown_style?.boxShadow ??
          dropdown_theme?.boxShadow ??
          "0 12px 20px rgba(0,0,0,0.12)",
        ...dropdown_style,
      }}
      onKeyDown={filter_mode === "panel" ? handle_key_down : undefined}
    >
      {filterable && filter_mode === "panel" ? (
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          placeholder={search_placeholder}
          onChange={(e) => handle_query_change(e.target.value)}
          onKeyDown={handle_key_down}
          style={{
            fontFamily,
            fontSize,
            padding: search_theme?.padding ?? "6px 10px",
            borderRadius: search_theme?.borderRadius ?? 5,
            border: "1px solid rgba(255,255,255,0)",
            outline: "none",
            backgroundColor:
              search_theme?.backgroundColor ?? "rgba(0, 0, 0, 0.05)",
            color: baseColor,
          }}
        />
      ) : null}
      <div
        ref={dropdownListRef}
        id={listboxIdRef.current}
        role="listbox"
        className="scrollable"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
          overscrollBehavior: "contain",
          maxHeight: dropdownMaxHeight,
          padding: 2,
        }}
      >
        <OptionList
          hasGroups={hasGroups}
          filteredGroups={filteredGroups}
          filteredUngrouped={filteredUngrouped}
          flatSelectable={flatSelectable}
          selectedValue={selectedValue}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          setHighlightedIndexFromHover={setHighlightedIndexFromHover}
          select_option={select_option}
          on_group_toggle={on_group_toggle}
          optionRefs={optionRefs}
          fontSize={fontSize}
          fontFamily={fontFamily}
          baseColor={baseColor}
          placeholderColor={placeholderColor}
          option_theme={option_theme}
          group_theme={group_theme}
          option_style={option_style}
          isDark={isDark}
        />
      </div>
    </div>
  );

  return (
    <Tooltip
      trigger={["click"]}
      position={dropdown_position}
      offset={8}
      align="start"
      show_arrow={false}
      tooltip_component={dropdownContent}
      style={{ padding: 0, backgroundColor: "transparent", boxShadow: "none" }}
      open={mergedOpen}
      on_open_change={emit_open_change}
      wrapper_style={{ width: style?.width || "100%" }}
    >
      {triggerContent}
    </Tooltip>
  );
};

/* ── Select ───────────────────────────────────────────────────────────────── */
/**
 * Ghost-style select — no background, just icon + label + arrow.
 * On hover the background scales from center (same animation as Button).
 */
const Select = ({
  options = [],
  value,
  set_value = () => {},
  multi = false,
  multi_label,
  placeholder = "Select...",
  filterable = true,
  filter_mode = "panel",
  search_placeholder = "Search...",
  icon,
  custom_trigger,
  style,
  dropdown_style,
  dropdown_position = "bottom",
  option_style,
  dropdown_footer,
  disabled = false,
  show_trigger_icon = true,
  open,
  on_open_change = () => {},
  on_group_toggle = () => {},
  variant,
  palette_chip,
  palette_actions,
  palette_rail = false,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const isPalette = variant === "palette";
  const tf = theme?.textfield || {};
  const dropdown_theme = theme?.select?.dropdown || {};
  const base_option_theme = theme?.select?.option || {};
  const search_theme = theme?.select?.search || {};
  const base_group_theme = theme?.select?.group || {};

  /* ── palette variant: the command-palette family look ──
     Same language as CommandPalettePanel / QueuePanel: translucent
     blur(20px) surface, radius 22, 8px inset, 28px rows at radius 14
     (concentric), theme-highlight selected rows, mini group headers with
     spring chevron + staggered row entrance, and the search living in the
     bottom header row next to an 18px r9 chip (inset 13 = concentric). */
  const option_theme = isPalette
    ? {
        ...base_option_theme,
        height: 28,
        borderRadius: 14,
        padding: "0 8px",
        paddingWithDesc: "5px 8px",
        gap: 8,
        hoverBackgroundColor: isDark
          ? "rgba(255,255,255,0.10)"
          : "rgba(0,0,0,0.06)",
        selectedBackgroundColor: themeHighlightRgba(theme, 0.14),
        selectedHighlightedBackgroundColor: themeHighlightRgba(theme, 0.22),
        /* hover is drawn by the host's SlidingHighlight gliding between
           rows — rows themselves only paint the persistent selected tint */
        externalHighlight: true,
      }
    : base_option_theme;
  const group_theme = isPalette
    ? {
        ...base_group_theme,
        headerHeight: 26,
        /* group name matches the option rows' 13px, but stays faint */
        headerFontSize: 13,
        headerPadding: "0 8px",
        headerBorderRadius: 13,
        expandIconSize: 10,
        iconGap: 5,
        separatorColor: "transparent",
        separatorMargin: "1px 0",
        /* indent option rows under their group: 15 + the row's own 8px
           padding lands the option text at 23px — where the group ICON
           sits (8 pad + 10 chevron + 5), a moderate nest */
        childIndent: 15,
        accentBarWidth: 0,
        childBarGap: 0,
        childPaddingTop: 1,
        showCount: true,
        rowStagger: true,
        expandIconTransition:
          "transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
      }
    : base_group_theme;

  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const dropdownPanelRef = useRef(null);
  const dropdownListRef = useRef(null);

  const hook = useSelect({
    options,
    value,
    set_value,
    multi,
    filterable,
    filter_mode,
    disabled,
    open,
    on_open_change,
    on_group_toggle,
  });

  const {
    selectedValue,
    selectedOption,
    selectedTriggerText,
    selectedValuesSet,
    mergedOpen,
    query,
    highlightedIndex,
    setHighlightedIndex,
    setHighlightedIndexFromHover,
    triggerWidth,
    hasGroups,
    filteredGroups,
    filteredUngrouped,
    flatSelectable,
    triggerRef,
    searchInputRef,
    optionRefs,
    listboxIdRef,
    emit_open_change,
    select_option,
    handle_key_down,
    handle_query_change,
  } = hook;

  useDropdownWheelGuard(mergedOpen, dropdownPanelRef, dropdownListRef);

  useEffect(() => {
    if (!disabled) return;
    setHovered(false);
    setPressed(false);
  }, [disabled]);

  /* ── design tokens (ghost style, similar to Button) ── */
  const fontSize = style?.fontSize || tf.fontSize || 16;
  const fontFamily =
    style?.fontFamily || theme?.font?.fontFamily || "Jost, sans-serif";
  const borderRadius = style?.borderRadius || tf.borderRadius || 7;
  const baseColor = style?.color || theme?.color || (isDark ? "#CCC" : "#222");
  const placeholderColor = isDark
    ? "rgba(255,255,255,0.4)"
    : "rgba(0,0,0,0.38)";
  const hoverBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const activeBg = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)";
  const paddingV = style?.paddingVertical ?? 6;
  const paddingH = style?.paddingHorizontal ?? 12;
  const iconSize = style?.iconSize || Math.round(fontSize * 1.05);
  const arrowSize = Math.round(fontSize * 0.85);
  const gap = style?.gap ?? 6;
  const pressedInset =
    style?.pressedInset ?? theme?.button?.background?.pressedInset ?? 2;
  const minPressedRadius =
    style?.minPressedRadius ?? theme?.button?.background?.minPressedRadius ?? 2;
  const pressedBorderRadius =
    typeof borderRadius === "number"
      ? Math.max(borderRadius - 1, minPressedRadius)
      : borderRadius;

  const showBg = hovered || pressed || mergedOpen;

  const selectedIcon = multi ? null : selectedOption?.icon;
  const resolvedIcon =
    show_trigger_icon && selectedIcon ? selectedIcon : icon ? icon : null;
  const showIcon =
    resolvedIcon &&
    (typeof resolvedIcon === "string" || isValidElement(resolvedIcon));

  /* multi trigger text: count-based label */
  const multiCount = multi
    ? Array.isArray(selectedValue)
      ? selectedValue.length
      : 0
    : 0;
  const triggerLabel = multi
    ? multiCount > 0
      ? multi_label
        ? typeof multi_label === "function"
          ? multi_label(multiCount)
          : `${multiCount} ${multi_label}`
        : `${multiCount} selected`
      : placeholder
    : selectedTriggerText || placeholder;
  const triggerLabelIsPlaceholder = multi
    ? multiCount === 0
    : !selectedTriggerText;

  const dropdownMinWidth = triggerWidth || undefined;
  const dropdownMaxHeight =
    dropdown_style?.maxHeight ?? dropdown_theme?.maxHeight ?? "auto";

  /* ── trigger ── */
  const triggerContent = (
    <div
      ref={triggerRef}
      role="combobox"
      aria-controls={listboxIdRef.current}
      aria-expanded={mergedOpen}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onMouseEnter={() => {
        if (disabled) return;
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => {
        if (disabled) return;
        setPressed(true);
      }}
      onMouseUp={() => setPressed(false)}
      onKeyDown={handle_key_down}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap,
        fontFamily,
        fontSize,
        color: baseColor,
        background: "transparent",
        border: "none",
        outline: "none",
        borderRadius,
        padding: `${paddingV}px ${paddingH}px`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        overflow: "hidden",
        userSelect: "none",
        WebkitUserSelect: "none",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {/* ── Hover background (scales from center) ── */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: pressed ? pressedInset : 0,
          borderRadius: pressed ? pressedBorderRadius : borderRadius,
          backgroundColor: pressed ? activeBg : hoverBg,
          transform: showBg ? "scale(1)" : "scale(0.5, 0)",
          opacity: showBg ? 1 : 0,
          transition: showBg
            ? "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.0), opacity 0.18s ease"
            : "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* icon */}
      {showIcon && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          {render_icon(resolvedIcon, iconSize, baseColor)}
        </span>
      )}

      {/* label */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          color: triggerLabelIsPlaceholder ? placeholderColor : baseColor,
        }}
      >
        {triggerLabel}
      </span>

      {/* arrow */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Icon
          src="arrow_down"
          style={{
            width: arrowSize,
            height: arrowSize,
            transition: "transform 120ms ease",
            transform: mergedOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </span>
    </div>
  );

  /* ── dropdown ── */
  const paletteChipEl =
    isPalette && palette_chip != null ? (
      <span
        style={{
          boxSizing: "border-box",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          height: 18,
          padding: "0 8px",
          borderRadius: 9,
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily,
          color: isDark ? "#9ad9a0" : "rgba(25,125,65,0.95)",
          backgroundColor: isDark
            ? "rgba(120,200,150,0.14)"
            : "rgba(40,150,80,0.12)",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {palette_chip}
      </span>
    ) : null;

  /* ── palette rail (design B): a provider icon rail on the left, only the
     active (sole expanded) group's options on the right, cross-group flat
     results while searching, and a FIXED panel height so nothing ever
     jumps. Reuses the caller's collapse state as an exclusive accordion. */
  const isRail = isPalette && palette_rail && hasGroups;
  const railQueryActive = filterable && query.trim() !== "";
  const railCheckColor = themeHighlightColor(theme);
  const railGroupNames = new Map();
  if (isRail) {
    filteredGroups.forEach((g) =>
      g.options.forEach((o) => railGroupNames.set(o, g.group)),
    );
  }
  const rail_pick_group = (target) => {
    (options || []).forEach((item) => {
      if (!item || typeof item !== "object" || !item.group) return;
      const shouldCollapse = item.group !== target;
      if (!!item.collapsed !== shouldCollapse) on_group_toggle(item.group);
    });
    if (query) handle_query_change("");
  };

  /* one hover pill gliding between rows (palette lists) */
  const slidingHoverColor = isDark
    ? "rgba(var(--pupu-text-rgb),0.10)"
    : "rgba(var(--pupu-text-rgb),0.06)";
  const slidingMeasureKey = `${query}|${flatSelectable.length}|${
    flatSelectable[0]?.value ?? ""
  }`;

  /* rail invariant: exactly ONE group expanded. The caller's collapse
     state can drift (all collapsed, or several open from the pre-rail
     UI) — on open, snap it to the group holding the selection, else the
     first group. */
  useEffect(() => {
    if (!isRail || !mergedOpen) return;
    const groups = (options || []).filter(
      (item) => item && typeof item === "object" && item.group,
    );
    if (!groups.length) return;
    const expanded = groups.filter((g) => !g.collapsed);
    if (expanded.length === 1) return;
    const holder =
      groups.find(
        (g) =>
          Array.isArray(g.options) &&
          g.options.some((o) => o?.value === selectedValue),
      ) || groups[0];
    rail_pick_group(holder.group);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRail, mergedOpen, options, selectedValue]);

  /* ── rail keyboard focus: ← jumps to the provider rail, ↑↓ switch the
     provider live (the list swaps), →/Enter/typing return to the list.
     While the rail holds focus, the list dims. */
  const [railFocus, setRailFocus] = useState(false);
  useEffect(() => {
    if (!mergedOpen || railQueryActive) setRailFocus(false);
  }, [mergedOpen, railQueryActive]);

  const rail_key_down = (e) => {
    /* the same event bubbles from the search input to the panel div —
       handling it twice double-toggles the exclusive accordion (a no-op) */
    if (e.defaultPrevented) return;
    if (!isRail) {
      handle_key_down(e);
      return;
    }
    if (!railFocus) {
      if (
        e.key === "ArrowLeft" &&
        !railQueryActive &&
        (e.target?.selectionStart ?? 0) === 0
      ) {
        e.preventDefault();
        setRailFocus(true);
        return;
      }
      handle_key_down(e);
      return;
    }
    /* rail focused */
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const groups = filteredGroups;
      if (!groups.length) return;
      const activeIdx = Math.max(
        0,
        groups.findIndex((g) => !g.collapsed),
      );
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = (activeIdx + delta + groups.length) % groups.length;
      rail_pick_group(groups[next].group);
      return;
    }
    if (e.key === "ArrowRight" || e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      setRailFocus(false);
      return;
    }
    setRailFocus(false);
    handle_key_down(e);
  };

  const dropdownContent = (
    <div
      ref={dropdownPanelRef}
      style={
        isPalette
          ? {
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              width: isRail ? 300 : 280,
              maxWidth: "calc(100vw - 40px)",
              padding: 8,
              backgroundColor: isDark
                ? "rgba(var(--pupu-surface-rgb),0.85)"
                : "rgba(var(--pupu-surface-rgb),0.9)",
              /* blurred surfaces always carry an edge; menuBorder overrides */
              border: isDark
                ? "1px solid var(--pupu-menu-border, rgba(var(--pupu-text-rgb),0.10))"
                : "1px solid var(--pupu-menu-border, rgba(var(--pupu-text-rgb),0.09))",
              borderRadius: 22,
              backdropFilter: "blur(20px) saturate(130%)",
              WebkitBackdropFilter: "blur(20px) saturate(130%)",
              boxShadow: isDark
                ? "0 10px 34px rgba(0,0,0,0.5)"
                : "0 10px 34px rgba(0,0,0,0.12)",
              /* maxHeight belongs to the listbox (dropdownMaxHeight), not
                 the panel — the panel must keep room for its header */
              ...(dropdown_style
                ? { ...dropdown_style, maxHeight: undefined }
                : {}),
              /* rail mode: FIXED height — search/switch never move the
                 panel; short content leaves blank space, long scrolls */
              ...(isRail ? { height: dropdown_style?.height ?? 322 } : {}),
            }
          : {
              display: "flex",
              flexDirection: "column",
              gap: 6,
              minWidth: dropdownMinWidth ? dropdownMinWidth - 12 : undefined,
              padding: dropdown_theme?.padding ?? 6,
              backgroundColor:
                dropdown_style?.backgroundColor ??
                dropdown_theme?.backgroundColor ??
                "rgba(var(--pupu-surface-rgb),0.95)",
              border: "1px solid var(--pupu-menu-border, transparent)",
              borderRadius:
                dropdown_style?.borderRadius ??
                dropdown_theme?.borderRadius ??
                10,
              boxShadow:
                dropdown_style?.boxShadow ??
                dropdown_theme?.boxShadow ??
                "0 12px 20px rgba(0,0,0,0.12)",
              ...dropdown_style,
            }
      }
      onKeyDown={rail_key_down}
    >
      {/* default variant: search on top */}
      {filterable && !isPalette ? (
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          placeholder={search_placeholder}
          onChange={(e) => handle_query_change(e.target.value)}
          onKeyDown={handle_key_down}
          style={{
            fontFamily,
            fontSize,
            padding: search_theme?.padding ?? "6px 10px",
            borderRadius: search_theme?.borderRadius ?? 5,
            border: "1px solid rgba(255,255,255,0)",
            outline: "none",
            backgroundColor:
              search_theme?.backgroundColor ?? "rgba(0,0,0,0.05)",
            color: baseColor,
          }}
        />
      ) : null}
      {isRail ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/* provider rail — active gets the highlight + accent bar; the
              provider holding the current selection carries a green dot */}
          <div
            style={{
              width: 40,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingRight: 5,
              marginRight: 7,
              borderRight: "1px solid rgba(var(--pupu-text-rgb),0.06)",
            }}
          >
            {filteredGroups.map((g) => (
              <RailItem
                key={g.group}
                group={g}
                active={!railQueryActive && !g.collapsed}
                dimmed={railQueryActive}
                holdsSelection={
                  multi
                    ? g.options.some((o) => selectedValuesSet?.has(o?.value))
                    : g.options.some((o) => o?.value === selectedValue)
                }
                accentColor={railCheckColor}
                baseColor={baseColor}
                fontFamily={fontFamily}
                isDark={isDark}
                onPick={() => rail_pick_group(g.group)}
              />
            ))}
          </div>

          {/* flat rows of the visible pool (= flatSelectable, so keyboard
              highlight indices line up 1:1); provider tag while searching */}
          <div
            ref={dropdownListRef}
            id={listboxIdRef.current}
            role="listbox"
            className="scrollable"
            data-sb-wall={2}
            data-sb-edge={12}
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 1,
              overflowY: "auto",
              overscrollBehavior: "contain",
              opacity: railFocus ? 0.5 : 1,
              transition: "opacity 150ms ease",
            }}
          >
            <SlidingHighlight
              refs={optionRefs}
              index={highlightedIndex}
              color={slidingHoverColor}
              borderRadius={14}
              measureKey={slidingMeasureKey}
            />
            {flatSelectable.length === 0 ? (
              <div
                style={{
                  padding: "10px 8px",
                  color: placeholderColor,
                  fontFamily,
                  fontSize: 11,
                }}
              >
                {t("common.no_results")}
              </div>
            ) : (
              flatSelectable.map((option, fi) => (
                <OptionItem
                  key={`${option?.value ?? fi}`}
                  option={option}
                  flatIndex={fi}
                  isSelected={
                    multi
                      ? selectedValuesSet?.has(option?.value)
                      : option?.value === selectedValue
                  }
                  isHighlighted={fi === highlightedIndex}
                  multi={multi}
                  isDark={isDark}
                  onMouseEnter={() => {
                    if (!option?.disabled) setHighlightedIndexFromHover(fi);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select_option(option)}
                  refCallback={(el) => {
                    optionRefs.current[fi] = el;
                  }}
                  fontSize={13}
                  fontFamily={fontFamily}
                  baseColor={baseColor}
                  placeholderColor={placeholderColor}
                  option_theme={option_theme}
                  option_style={option_style}
                  checkColor={railCheckColor}
                  group_tag={
                    railQueryActive ? railGroupNames.get(option) : null
                  }
                />
              ))
            )}
          </div>
        </div>
      ) : (
      <div
        ref={dropdownListRef}
        id={listboxIdRef.current}
        role="listbox"
        className="scrollable"
        data-sb-wall={isPalette ? 2 : undefined}
        data-sb-edge={isPalette ? 12 : undefined}
        style={{
          position: isPalette ? "relative" : undefined,
          display: "flex",
          flexDirection: "column",
          gap: isPalette ? 1 : 4,
          overflowY: "auto",
          overscrollBehavior: "contain",
          maxHeight: dropdownMaxHeight,
          padding: isPalette ? 0 : 2,
        }}
      >
        {isPalette ? (
          <SlidingHighlight
            refs={optionRefs}
            index={highlightedIndex}
            color={slidingHoverColor}
            borderRadius={14}
            measureKey={slidingMeasureKey}
          />
        ) : null}
        <OptionList
          hasGroups={hasGroups}
          filteredGroups={filteredGroups}
          filteredUngrouped={filteredUngrouped}
          flatSelectable={flatSelectable}
          selectedValue={selectedValue}
          selectedValuesSet={selectedValuesSet}
          multi={multi}
          highlightedIndex={highlightedIndex}
          setHighlightedIndex={setHighlightedIndex}
          setHighlightedIndexFromHover={setHighlightedIndexFromHover}
          select_option={select_option}
          on_group_toggle={on_group_toggle}
          optionRefs={optionRefs}
          fontSize={isPalette ? 13 : fontSize}
          fontFamily={fontFamily}
          baseColor={baseColor}
          placeholderColor={placeholderColor}
          option_theme={option_theme}
          group_theme={group_theme}
          option_style={option_style}
          isDark={isDark}
        />
      </div>
      )}
      {/* palette variant: bottom header — chip + search + actions, the
          command palette's header slot (chip inset 13 = concentric r9+13=22) */}
      {isPalette ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "7px 6px 5px 5px",
            flexShrink: 0,
          }}
        >
          {paletteChipEl}
          {filterable ? (
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              placeholder={search_placeholder}
              onChange={(e) => handle_query_change(e.target.value)}
              onKeyDown={rail_key_down}
              style={{
                flex: 1,
                minWidth: 40,
                border: "none",
                outline: "none",
                backgroundColor: "transparent",
                fontFamily,
                fontSize: 11.5,
                color: baseColor,
                padding: 0,
              }}
            />
          ) : (
            <span style={{ flex: 1 }} />
          )}
          {palette_actions}
        </div>
      ) : null}

      {/* optional footer (e.g. clear all, add workspace) */}
      {!isPalette && dropdown_footer != null && (
        <div
          style={{
            borderTop: `1px solid ${
              isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"
            }`,
            padding: "4px 6px",
          }}
        >
          {dropdown_footer}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip
      trigger={["click"]}
      position={dropdown_position}
      offset={8}
      align="start"
      show_arrow={false}
      tooltip_component={dropdownContent}
      style={{
        padding: 0,
        backgroundColor: "transparent",
        boxShadow: "none",
      }}
      open={mergedOpen}
      on_open_change={emit_open_change}
    >
      {custom_trigger || triggerContent}
    </Tooltip>
  );
};

export { Select, Select as default, SinkingSelect, FloatingSelect };
