import { isValidElement, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Tooltip from "../tooltip/tooltip";
import Icon from "../icon/icon";
import useSelect, { render_icon } from "./use_select";
import OptionList from "./option_list";

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
        id={listboxIdRef.current}
        role="listbox"
        className="scrollable"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
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
      position="bottom"
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
        id={listboxIdRef.current}
        role="listbox"
        className="scrollable"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
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
      position="bottom"
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
  placeholder = "Select...",
  filterable = true,
  filter_mode = "panel",
  search_placeholder = "Search...",
  icon,
  style,
  dropdown_style,
  option_style,
  disabled = false,
  show_trigger_icon = true,
  open,
  on_open_change = () => {},
  on_group_toggle = () => {},
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const tf = theme?.textfield || {};
  const dropdown_theme = theme?.select?.dropdown || {};
  const option_theme = theme?.select?.option || {};
  const search_theme = theme?.select?.search || {};
  const group_theme = theme?.select?.group || {};

  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

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

  const selectedIcon = selectedOption?.icon;
  const resolvedIcon =
    show_trigger_icon && selectedIcon ? selectedIcon : icon ? icon : null;
  const showIcon =
    resolvedIcon &&
    (typeof resolvedIcon === "string" || isValidElement(resolvedIcon));

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
          color: selectedTriggerText ? baseColor : placeholderColor,
        }}
      >
        {selectedTriggerText || placeholder}
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
  const dropdownContent = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: dropdownMinWidth ? dropdownMinWidth - 12 : undefined,
        padding: dropdown_theme?.padding ?? 6,
        backgroundColor:
          dropdown_style?.backgroundColor ??
          dropdown_theme?.backgroundColor ??
          (isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)"),
        borderRadius:
          dropdown_style?.borderRadius ?? dropdown_theme?.borderRadius ?? 10,
        boxShadow:
          dropdown_style?.boxShadow ??
          dropdown_theme?.boxShadow ??
          "0 12px 20px rgba(0,0,0,0.12)",
        ...dropdown_style,
      }}
      onKeyDown={handle_key_down}
    >
      {filterable ? (
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
      <div
        id={listboxIdRef.current}
        role="listbox"
        className="scrollable"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
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
      position="bottom"
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
      {triggerContent}
    </Tooltip>
  );
};

export { Select, Select as default, SinkingSelect, FloatingSelect };
