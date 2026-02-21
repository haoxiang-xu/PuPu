import {
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLayoutEffect } from "../mini_react/mini_use";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Tooltip from "../tooltip/tooltip";
import Icon from "../icon/icon";

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
}) => {
  const { theme } = useContext(ConfigContext);
  const select_theme = theme?.select || {};
  const dropdown_theme = select_theme?.dropdown || {};
  const option_theme = select_theme?.option || {};
  const search_theme = select_theme?.search || {};

  const is_value_controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(value ?? null);
  const selectedValue = is_value_controlled ? value : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [triggerWidth, setTriggerWidth] = useState(0);
  const [isTriggerFocused, setIsTriggerFocused] = useState(false);

  const triggerRef = useRef(null);
  const triggerInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxIdRef = useRef(
    `mini-ui-select-listbox-${Math.random().toString(36).slice(2, 10)}`,
  );

  const is_open_controlled = open !== undefined;
  const mergedOpen = is_open_controlled ? open : isOpen;

  const get_option_text = useCallback((option) => {
    if (!option) return "";
    if (typeof option.search === "string") return option.search;
    if (typeof option.label === "string" || typeof option.label === "number") {
      return String(option.label);
    }
    if (typeof option.value === "string" || typeof option.value === "number") {
      return String(option.value);
    }
    return "";
  }, []);
  const get_trigger_text = useCallback(
    (option) => {
      if (!option) return "";
      const triggerLabel = option.trigger_label;
      if (
        typeof triggerLabel === "string" ||
        typeof triggerLabel === "number"
      ) {
        return String(triggerLabel);
      }
      return get_option_text(option);
    },
    [get_option_text],
  );

  const selectedOption = useMemo(() => {
    if (!Array.isArray(options)) return null;
    return options.find((option) => option?.value === selectedValue) || null;
  }, [options, selectedValue]);

  const selectedTriggerText = useMemo(
    () => get_trigger_text(selectedOption),
    [get_trigger_text, selectedOption],
  );

  const normalizedQuery = useMemo(
    () => (filterable ? query.trim().toLowerCase() : ""),
    [filterable, query],
  );

  const filteredOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const safeOptions = options.filter((option) => option);
    if (!filterable || normalizedQuery === "") return safeOptions;
    return safeOptions.filter((option) =>
      get_option_text(option).toLowerCase().includes(normalizedQuery),
    );
  }, [options, filterable, normalizedQuery, get_option_text]);

  const update_value = useCallback(
    (nextValue, option) => {
      if (!is_value_controlled) {
        setInternalValue(nextValue);
      }
      set_value(nextValue, option);
    },
    [is_value_controlled, set_value],
  );

  const emit_open_change = useCallback(
    (next) => {
      if (disabled) return;
      if (!is_open_controlled) setIsOpen(next);
      on_open_change(next);
      if (!next) setQuery("");
    },
    [disabled, is_open_controlled, on_open_change],
  );

  const move_highlight = useCallback(
    (direction) => {
      if (!filteredOptions.length) return;
      const total = filteredOptions.length;
      let nextIndex = highlightedIndex;
      for (let i = 0; i < total; i += 1) {
        if (nextIndex === -1) {
          nextIndex = direction > 0 ? 0 : total - 1;
        } else {
          nextIndex = (nextIndex + direction + total) % total;
        }
        if (!filteredOptions[nextIndex]?.disabled) {
          setHighlightedIndex(nextIndex);
          return;
        }
      }
    },
    [filteredOptions, highlightedIndex],
  );

  const select_option = useCallback(
    (option) => {
      if (!option || option.disabled || disabled) return;
      update_value(option.value, option);
      emit_open_change(false);
    },
    [disabled, emit_open_change, update_value],
  );

  const handle_key_down = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        move_highlight(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        move_highlight(-1);
        return;
      }
      if (e.key === "Enter") {
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        const candidate =
          highlightedIndex >= 0 ? filteredOptions[highlightedIndex] : null;
        if (candidate && !candidate.disabled) {
          e.preventDefault();
          select_option(candidate);
          return;
        }
        const enabledOptions = filteredOptions.filter((opt) => !opt.disabled);
        if (enabledOptions.length === 1) {
          e.preventDefault();
          select_option(enabledOptions[0]);
        }
        return;
      }
      if (e.key === "Escape") {
        if (mergedOpen) {
          e.preventDefault();
          emit_open_change(false);
        }
        return;
      }
      if (e.key === "Tab") {
        if (mergedOpen) emit_open_change(false);
      }
      if (e.key === " " && filter_mode === "panel" && !mergedOpen) {
        e.preventDefault();
        emit_open_change(true);
      }
    },
    [
      disabled,
      mergedOpen,
      emit_open_change,
      move_highlight,
      highlightedIndex,
      filteredOptions,
      select_option,
      filter_mode,
    ],
  );

  const handle_query_change = useCallback(
    (nextValue) => {
      if (!filterable || disabled) return;
      if (!mergedOpen) emit_open_change(true);
      setQuery(nextValue);
    },
    [filterable, disabled, mergedOpen, emit_open_change],
  );

  useLayoutEffect(() => {
    if (!triggerRef.current) return;
    const nextWidth = triggerRef.current.offsetWidth || 0;
    if (nextWidth !== triggerWidth) setTriggerWidth(nextWidth);
  }, [triggerWidth, style, mergedOpen]);

  useEffect(() => {
    const handleResize = () => {
      if (!triggerRef.current) return;
      setTriggerWidth(triggerRef.current.offsetWidth || 0);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!mergedOpen) {
      setHighlightedIndex(-1);
      return;
    }
    const selectedIndex = filteredOptions.findIndex(
      (option) => option?.value === selectedValue && !option?.disabled,
    );
    if (selectedIndex >= 0) {
      setHighlightedIndex(selectedIndex);
      return;
    }
    const firstEnabled = filteredOptions.findIndex(
      (option) => option && !option.disabled,
    );
    setHighlightedIndex(firstEnabled);
  }, [mergedOpen, filteredOptions, selectedValue]);

  useEffect(() => {
    if (!mergedOpen) return;
    if (filterable && filter_mode === "panel" && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [mergedOpen, filterable, filter_mode]);

  useEffect(() => {
    if (!mergedOpen) return;
    if (highlightedIndex < 0) return;
    const el = optionRefs.current[highlightedIndex];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [mergedOpen, highlightedIndex]);

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

  const render_icon = (icon, size, color) => {
    if (!icon) return null;
    if (typeof icon === "string") {
      return (
        <Icon
          src={icon}
          color={color}
          style={{
            width: size,
            height: size,
          }}
        />
      );
    }
    if (isValidElement(icon)) return icon;
    return null;
  };

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
            fontFamily: style?.fontFamily || theme?.font?.fontFamily || "Jost",
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
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onKeyDown={handle_key_down}
          onChange={(e) => handle_query_change(e.target.value)}
        />
      ) : (
        <div
          style={{
            flex: 1,
            fontFamily: style?.fontFamily || theme?.font?.fontFamily || "Jost",
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
            fontFamily: style?.fontFamily || theme?.font?.fontFamily || "Jost",
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
        {filteredOptions.length === 0 ? (
          <div
            style={{
              padding: "8px 10px",
              color: placeholderColor,
              fontFamily:
                style?.fontFamily || theme?.font?.fontFamily || "Jost",
              fontSize: baseFontSize * 0.9,
            }}
          >
            No results
          </div>
        ) : (
          filteredOptions.map((option, index) => {
            const isDisabled = !!option?.disabled;
            const isSelected = option?.value === selectedValue;
            const isHighlighted = index === highlightedIndex;
            const optionColor = isDisabled
              ? (option_theme?.disabledColor ?? "rgba(0, 0, 0, 0.35)")
              : baseColor;
            const iconValue = option?.icon;
            const showIcon =
              iconValue &&
              (typeof iconValue === "string" || isValidElement(iconValue));
            return (
              <div
                key={`${option?.value ?? index}`}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => {
                  if (!isDisabled) setHighlightedIndex(index);
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select_option(option)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: option_theme?.gap ?? 8,
                  height: option_theme?.height ?? 36,
                  padding: option_theme?.padding ?? "6px 10px",
                  borderRadius: option_theme?.borderRadius ?? 5,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  color: optionColor,
                  backgroundColor: isHighlighted
                    ? (option_theme?.hoverBackgroundColor ??
                      "rgba(0, 0, 0, 0.06)")
                    : isSelected
                      ? (option_theme?.selectedBackgroundColor ??
                        "rgba(10, 133, 255, 0.14)")
                      : "transparent",
                  ...option_style,
                }}
              >
                {showIcon ? (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {render_icon(iconValue, baseFontSize + 2, optionColor)}
                  </div>
                ) : null}
                <span
                  style={{
                    fontFamily:
                      style?.fontFamily || theme?.font?.fontFamily || "Jost",
                    fontSize: baseFontSize,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {option?.label ?? get_option_text(option)}
                </span>
              </div>
            );
          })
        )}
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
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const dropdown_theme = theme?.select?.dropdown || {};
  const option_theme = theme?.select?.option || {};
  const search_theme = theme?.select?.search || {};

  const is_value_controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(value ?? null);
  const selectedValue = is_value_controlled ? value : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [triggerWidth, setTriggerWidth] = useState(0);
  const [isTriggerFocused, setIsTriggerFocused] = useState(false);
  const [hovered, setHovered] = useState(false);

  const triggerRef = useRef(null);
  const triggerInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxIdRef = useRef(
    `mini-ui-fselect-${Math.random().toString(36).slice(2, 10)}`,
  );

  const is_open_controlled = open !== undefined;
  const mergedOpen = is_open_controlled ? open : isOpen;

  const get_option_text = useCallback((option) => {
    if (!option) return "";
    if (typeof option.search === "string") return option.search;
    if (typeof option.label === "string" || typeof option.label === "number")
      return String(option.label);
    if (typeof option.value === "string" || typeof option.value === "number")
      return String(option.value);
    return "";
  }, []);
  const get_trigger_text = useCallback(
    (option) => {
      if (!option) return "";
      const tl = option.trigger_label;
      if (typeof tl === "string" || typeof tl === "number") return String(tl);
      return get_option_text(option);
    },
    [get_option_text],
  );

  const selectedOption = useMemo(
    () =>
      Array.isArray(options)
        ? options.find((o) => o?.value === selectedValue) || null
        : null,
    [options, selectedValue],
  );
  const selectedTriggerText = useMemo(
    () => get_trigger_text(selectedOption),
    [get_trigger_text, selectedOption],
  );
  const normalizedQuery = useMemo(
    () => (filterable ? query.trim().toLowerCase() : ""),
    [filterable, query],
  );
  const filteredOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const safe = options.filter(Boolean);
    if (!filterable || normalizedQuery === "") return safe;
    return safe.filter((o) =>
      get_option_text(o).toLowerCase().includes(normalizedQuery),
    );
  }, [options, filterable, normalizedQuery, get_option_text]);

  const update_value = useCallback(
    (v, opt) => {
      if (!is_value_controlled) setInternalValue(v);
      set_value(v, opt);
    },
    [is_value_controlled, set_value],
  );
  const emit_open_change = useCallback(
    (next) => {
      if (disabled) return;
      if (!is_open_controlled) setIsOpen(next);
      on_open_change(next);
      if (!next) setQuery("");
    },
    [disabled, is_open_controlled, on_open_change],
  );
  const move_highlight = useCallback(
    (dir) => {
      if (!filteredOptions.length) return;
      const total = filteredOptions.length;
      let idx = highlightedIndex;
      for (let i = 0; i < total; i++) {
        idx =
          idx === -1 ? (dir > 0 ? 0 : total - 1) : (idx + dir + total) % total;
        if (!filteredOptions[idx]?.disabled) {
          setHighlightedIndex(idx);
          return;
        }
      }
    },
    [filteredOptions, highlightedIndex],
  );
  const select_option = useCallback(
    (opt) => {
      if (!opt || opt.disabled || disabled) return;
      update_value(opt.value, opt);
      emit_open_change(false);
    },
    [disabled, emit_open_change, update_value],
  );
  const handle_key_down = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        move_highlight(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        move_highlight(-1);
        return;
      }
      if (e.key === "Enter") {
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        const c =
          highlightedIndex >= 0 ? filteredOptions[highlightedIndex] : null;
        if (c && !c.disabled) {
          e.preventDefault();
          select_option(c);
          return;
        }
        const enabled = filteredOptions.filter((o) => !o.disabled);
        if (enabled.length === 1) {
          e.preventDefault();
          select_option(enabled[0]);
        }
        return;
      }
      if (e.key === "Escape") {
        if (mergedOpen) {
          e.preventDefault();
          emit_open_change(false);
        }
        return;
      }
      if (e.key === "Tab") {
        if (mergedOpen) emit_open_change(false);
      }
      if (e.key === " " && filter_mode === "panel" && !mergedOpen) {
        e.preventDefault();
        emit_open_change(true);
      }
    },
    [
      disabled,
      mergedOpen,
      emit_open_change,
      move_highlight,
      highlightedIndex,
      filteredOptions,
      select_option,
      filter_mode,
    ],
  );
  const handle_query_change = useCallback(
    (v) => {
      if (!filterable || disabled) return;
      if (!mergedOpen) emit_open_change(true);
      setQuery(v);
    },
    [filterable, disabled, mergedOpen, emit_open_change],
  );

  useLayoutEffect(() => {
    if (!triggerRef.current) return;
    const w = triggerRef.current.offsetWidth || 0;
    if (w !== triggerWidth) setTriggerWidth(w);
  }, [triggerWidth, style, mergedOpen]);

  useEffect(() => {
    const h = () => {
      if (triggerRef.current)
        setTriggerWidth(triggerRef.current.offsetWidth || 0);
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    if (!mergedOpen) {
      setHighlightedIndex(-1);
      return;
    }
    const si = filteredOptions.findIndex(
      (o) => o?.value === selectedValue && !o?.disabled,
    );
    if (si >= 0) {
      setHighlightedIndex(si);
      return;
    }
    setHighlightedIndex(filteredOptions.findIndex((o) => o && !o.disabled));
  }, [mergedOpen, filteredOptions, selectedValue]);

  useEffect(() => {
    if (!mergedOpen) return;
    if (filterable && filter_mode === "panel" && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [mergedOpen, filterable, filter_mode]);

  useEffect(() => {
    if (!mergedOpen || highlightedIndex < 0) return;
    const el = optionRefs.current[highlightedIndex];
    if (el?.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [mergedOpen, highlightedIndex]);

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

  const render_icon = (icon, size, color) => {
    if (!icon) return null;
    if (typeof icon === "string")
      return (
        <Icon src={icon} color={color} style={{ width: size, height: size }} />
      );
    if (isValidElement(icon)) return icon;
    return null;
  };

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
        {filteredOptions.length === 0 ? (
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
        ) : (
          filteredOptions.map((option, index) => {
            const isDisabled = !!option?.disabled;
            const isSelected = option?.value === selectedValue;
            const isHighlighted = index === highlightedIndex;
            const optionColor = isDisabled
              ? (option_theme?.disabledColor ?? "rgba(0,0,0,0.35)")
              : baseColor;
            const iconValue = option?.icon;
            const showIcon =
              iconValue &&
              (typeof iconValue === "string" || isValidElement(iconValue));
            return (
              <div
                key={`${option?.value ?? index}`}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => {
                  if (!isDisabled) setHighlightedIndex(index);
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select_option(option)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: option_theme?.gap ?? 8,
                  height: option_theme?.height ?? 36,
                  padding: option_theme?.padding ?? "6px 10px",
                  borderRadius: option_theme?.borderRadius ?? 5,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  color: optionColor,
                  backgroundColor: isHighlighted
                    ? (option_theme?.hoverBackgroundColor ?? "rgba(0,0,0,0.06)")
                    : isSelected
                      ? (option_theme?.selectedBackgroundColor ??
                        "rgba(0,0,0,0.09)")
                      : "transparent",
                  ...option_style,
                }}
              >
                {showIcon && (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {render_icon(iconValue, fontSize + 2, optionColor)}
                  </div>
                )}
                <span
                  style={{
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
          })
        )}
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
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const tf = theme?.textfield || {};
  const dropdown_theme = theme?.select?.dropdown || {};
  const option_theme = theme?.select?.option || {};
  const search_theme = theme?.select?.search || {};

  const is_value_controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(value ?? null);
  const selectedValue = is_value_controlled ? value : internalValue;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [triggerWidth, setTriggerWidth] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxIdRef = useRef(
    `mini-ui-ghost-select-${Math.random().toString(36).slice(2, 10)}`,
  );

  const is_open_controlled = open !== undefined;
  const mergedOpen = is_open_controlled ? open : isOpen;

  /* ── helpers ── */
  const get_option_text = useCallback((opt) => {
    if (!opt) return "";
    if (typeof opt.search === "string") return opt.search;
    if (typeof opt.label === "string" || typeof opt.label === "number")
      return String(opt.label);
    if (typeof opt.value === "string" || typeof opt.value === "number")
      return String(opt.value);
    return "";
  }, []);
  const get_trigger_text = useCallback(
    (opt) => {
      if (!opt) return "";
      const tl = opt.trigger_label;
      if (typeof tl === "string" || typeof tl === "number") return String(tl);
      return get_option_text(opt);
    },
    [get_option_text],
  );

  const selectedOption = useMemo(
    () =>
      Array.isArray(options)
        ? options.find((o) => o?.value === selectedValue) || null
        : null,
    [options, selectedValue],
  );
  const selectedTriggerText = useMemo(
    () => get_trigger_text(selectedOption),
    [get_trigger_text, selectedOption],
  );
  const normalizedQuery = useMemo(
    () => (filterable ? query.trim().toLowerCase() : ""),
    [filterable, query],
  );
  const filteredOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const safe = options.filter(Boolean);
    if (!filterable || normalizedQuery === "") return safe;
    return safe.filter((o) =>
      get_option_text(o).toLowerCase().includes(normalizedQuery),
    );
  }, [options, filterable, normalizedQuery, get_option_text]);

  const update_value = useCallback(
    (v, opt) => {
      if (!is_value_controlled) setInternalValue(v);
      set_value(v, opt);
    },
    [is_value_controlled, set_value],
  );
  const emit_open_change = useCallback(
    (next) => {
      if (disabled) return;
      if (!is_open_controlled) setIsOpen(next);
      on_open_change(next);
      if (!next) setQuery("");
    },
    [disabled, is_open_controlled, on_open_change],
  );
  const move_highlight = useCallback(
    (dir) => {
      if (!filteredOptions.length) return;
      const total = filteredOptions.length;
      let idx = highlightedIndex;
      for (let i = 0; i < total; i++) {
        idx =
          idx === -1 ? (dir > 0 ? 0 : total - 1) : (idx + dir + total) % total;
        if (!filteredOptions[idx]?.disabled) {
          setHighlightedIndex(idx);
          return;
        }
      }
    },
    [filteredOptions, highlightedIndex],
  );
  const select_option = useCallback(
    (opt) => {
      if (!opt || opt.disabled || disabled) return;
      update_value(opt.value, opt);
      emit_open_change(false);
    },
    [disabled, emit_open_change, update_value],
  );
  const handle_key_down = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        move_highlight(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        move_highlight(-1);
        return;
      }
      if (e.key === "Enter") {
        if (!mergedOpen) {
          emit_open_change(true);
          return;
        }
        const c =
          highlightedIndex >= 0 ? filteredOptions[highlightedIndex] : null;
        if (c && !c.disabled) {
          e.preventDefault();
          select_option(c);
          return;
        }
        const enabled = filteredOptions.filter((o) => !o.disabled);
        if (enabled.length === 1) {
          e.preventDefault();
          select_option(enabled[0]);
        }
        return;
      }
      if (e.key === "Escape") {
        if (mergedOpen) {
          e.preventDefault();
          emit_open_change(false);
        }
        return;
      }
      if (e.key === "Tab") {
        if (mergedOpen) emit_open_change(false);
      }
      if (e.key === " " && !mergedOpen) {
        e.preventDefault();
        emit_open_change(true);
      }
    },
    [
      disabled,
      mergedOpen,
      emit_open_change,
      move_highlight,
      highlightedIndex,
      filteredOptions,
      select_option,
    ],
  );

  useLayoutEffect(() => {
    if (!triggerRef.current) return;
    const w = triggerRef.current.offsetWidth || 0;
    if (w !== triggerWidth) setTriggerWidth(w);
  }, [triggerWidth, style, mergedOpen]);

  useEffect(() => {
    const h = () => {
      if (triggerRef.current)
        setTriggerWidth(triggerRef.current.offsetWidth || 0);
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    if (!mergedOpen) {
      setHighlightedIndex(-1);
      return;
    }
    const si = filteredOptions.findIndex(
      (o) => o?.value === selectedValue && !o?.disabled,
    );
    if (si >= 0) {
      setHighlightedIndex(si);
      return;
    }
    setHighlightedIndex(filteredOptions.findIndex((o) => o && !o.disabled));
  }, [mergedOpen, filteredOptions, selectedValue]);

  useEffect(() => {
    if (!mergedOpen) return;
    if (filterable && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [mergedOpen, filterable]);

  useEffect(() => {
    if (!mergedOpen || highlightedIndex < 0) return;
    const el = optionRefs.current[highlightedIndex];
    if (el?.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [mergedOpen, highlightedIndex]);

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

  const render_icon = (ic, size, color) => {
    if (!ic) return null;
    if (typeof ic === "string")
      return (
        <Icon src={ic} color={color} style={{ width: size, height: size }} />
      );
    if (isValidElement(ic)) return ic;
    return null;
  };

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
          onChange={(e) => {
            if (!mergedOpen) emit_open_change(true);
            setQuery(e.target.value);
          }}
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
        {filteredOptions.length === 0 ? (
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
        ) : (
          filteredOptions.map((option, index) => {
            const isDisabled = !!option?.disabled;
            const isSelected = option?.value === selectedValue;
            const isHighlighted = index === highlightedIndex;
            const optionColor = isDisabled
              ? (option_theme?.disabledColor ?? "rgba(0,0,0,0.35)")
              : baseColor;
            const iconValue = option?.icon;
            const showOptIcon =
              iconValue &&
              (typeof iconValue === "string" || isValidElement(iconValue));
            return (
              <div
                key={`${option?.value ?? index}`}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => {
                  if (!isDisabled) setHighlightedIndex(index);
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select_option(option)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: option_theme?.gap ?? 8,
                  height: option_theme?.height ?? 36,
                  padding: option_theme?.padding ?? "6px 10px",
                  borderRadius: option_theme?.borderRadius ?? 5,
                  cursor: isDisabled ? "not-allowed" : "pointer",
                  color: optionColor,
                  backgroundColor: isHighlighted
                    ? (option_theme?.hoverBackgroundColor ?? "rgba(0,0,0,0.06)")
                    : isSelected
                      ? (option_theme?.selectedBackgroundColor ??
                        "rgba(0,0,0,0.09)")
                      : "transparent",
                  ...option_style,
                }}
              >
                {showOptIcon && (
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {render_icon(iconValue, fontSize + 2, optionColor)}
                  </div>
                )}
                <span
                  style={{
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
          })
        )}
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

export {
  Select,
  Select as default,
  SinkingSelect,
  FloatingSelect,
};
