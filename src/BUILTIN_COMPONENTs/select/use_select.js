import {
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLayoutEffect } from "../mini_react/mini_use";
import Icon from "../icon/icon";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Helpers
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Priority: option.search → option.label → option.value */
export const get_option_text = (option) => {
  if (!option) return "";
  if (typeof option.search === "string") return option.search;
  if (typeof option.label === "string" || typeof option.label === "number")
    return String(option.label);
  if (typeof option.value === "string" || typeof option.value === "number")
    return String(option.value);
  return "";
};

/** What to display inside the trigger — falls back to get_option_text */
export const get_trigger_text = (option) => {
  if (!option) return "";
  const tl = option.trigger_label;
  if (typeof tl === "string" || typeof tl === "number") return String(tl);
  return get_option_text(option);
};

/** Render an icon — string ⇒ <Icon>, ReactElement ⇒ passthrough */
export const render_icon = (icon, size, color) => {
  if (!icon) return null;
  if (typeof icon === "string")
    return (
      <Icon
        src={icon}
        color={color}
        style={{ position: "relative", width: size, height: size }}
      />
    );
  if (isValidElement(icon)) return icon;
  return null;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  Grouped options normalisation & filtering
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Detect whether `options` contains groups.
 * A group item is an object with a `group` (string) key and an `options` array.
 */
const is_grouped = (options) =>
  Array.isArray(options) &&
  options.some(
    (o) => o && typeof o.group === "string" && Array.isArray(o.options),
  );

/**
 * Normalise any options array into a uniform structure:
 *
 *   { groups: [{ group, icon, collapsed, options }], ungrouped: [option] }
 *
 * If options are flat (no groups), returns `{ groups: [], ungrouped: [...] }`.
 */
const normalise_options = (options) => {
  if (!Array.isArray(options)) return { groups: [], ungrouped: [] };
  if (!is_grouped(options)) {
    return { groups: [], ungrouped: options.filter(Boolean) };
  }
  const groups = [];
  const ungrouped = [];
  for (const item of options) {
    if (!item) continue;
    if (typeof item.group === "string" && Array.isArray(item.options)) {
      groups.push({
        group: item.group,
        icon: item.icon ?? null,
        collapsed: !!item.collapsed,
        options: item.options.filter(Boolean),
      });
    } else {
      ungrouped.push(item);
    }
  }
  return { groups, ungrouped };
};

/**
 * Build the structures consumed by the dropdown.
 *
 * Returns:
 *   `hasGroups`           — boolean, whether grouping is active
 *   `filteredGroups`      — array of { group, icon, collapsed, options, forceOpen }
 *   `filteredUngrouped`   — array of options not inside a group
 *   `flatSelectable`      — flat array of all *selectable* options (used for highlight)
 *   `totalSelectable`     — count of flatSelectable
 */
export const build_filtered = (options, filterable, normalizedQuery) => {
  const { groups, ungrouped } = normalise_options(options);
  const hasGroups = groups.length > 0;

  const matchesQuery = (option) =>
    get_option_text(option).toLowerCase().includes(normalizedQuery);

  // No groups — classic flat path
  if (!hasGroups) {
    const filtered =
      !filterable || normalizedQuery === ""
        ? ungrouped
        : ungrouped.filter(matchesQuery);
    return {
      hasGroups: false,
      filteredGroups: [],
      filteredUngrouped: filtered,
      flatSelectable: filtered,
      totalSelectable: filtered.length,
    };
  }

  // Grouped path
  const isFiltering = filterable && normalizedQuery !== "";

  const filteredGroups = [];
  const flatSelectable = [];

  for (const g of groups) {
    const items = isFiltering ? g.options.filter(matchesQuery) : g.options;
    if (isFiltering && items.length === 0) continue; // hide empty groups when filtering
    const forceOpen = isFiltering && items.length > 0; // auto‑expand matching groups
    filteredGroups.push({
      group: g.group,
      icon: g.icon,
      collapsed: forceOpen ? false : g.collapsed,
      forceOpen,
      options: items,
    });
    // Only add items from expanded groups (or forced open) to flatSelectable
    if (!g.collapsed || forceOpen) {
      flatSelectable.push(...items);
    }
  }

  // Ungrouped items at root
  const filteredUngrouped = isFiltering
    ? ungrouped.filter(matchesQuery)
    : ungrouped;
  flatSelectable.push(...filteredUngrouped);

  return {
    hasGroups: true,
    filteredGroups,
    filteredUngrouped,
    flatSelectable,
    totalSelectable: flatSelectable.length,
  };
};

/**
 * Rebuild flatSelectable whenever collapsed states change (even without query change).
 * This is needed because when a group is collapsed, its items should be removed from
 * keyboard navigation.
 */
export const rebuild_flat_selectable = (
  options,
  filterable,
  normalizedQuery,
) => {
  return build_filtered(options, filterable, normalizedQuery);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  useSelect hook
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Core select logic shared by SinkingSelect, FloatingSelect and Select.
 *
 * Accepts the common props that all three variants share and returns
 * state + handlers + derived data so each variant only needs to render
 * its own trigger / dropdown chrome.
 */
const useSelect = ({
  options = [],
  value,
  set_value = () => {},
  filterable = true,
  filter_mode = "panel",
  disabled = false,
  open,
  on_open_change = () => {},
  on_group_toggle = () => {},
}) => {
  /* ── controlled / uncontrolled value ── */
  const is_value_controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(value ?? null);
  const selectedValue = is_value_controlled ? value : internalValue;

  /* ── open state ── */
  const is_open_controlled = open !== undefined;
  const [isOpen, setIsOpen] = useState(false);
  const mergedOpen = is_open_controlled ? open : isOpen;

  /* ── query & highlight ── */
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  /* ── trigger width tracking ── */
  const [triggerWidth, setTriggerWidth] = useState(0);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const triggerInputRef = useRef(null);
  const optionRefs = useRef([]);
  const listboxIdRef = useRef(
    `mini-ui-select-${Math.random().toString(36).slice(2, 10)}`,
  );

  /* ── normalised query ── */
  const normalizedQuery = useMemo(
    () => (filterable ? query.trim().toLowerCase() : ""),
    [filterable, query],
  );

  /* ── filtered & grouped data ── */
  const {
    hasGroups,
    filteredGroups,
    filteredUngrouped,
    flatSelectable,
    totalSelectable,
  } = useMemo(
    () => build_filtered(options, filterable, normalizedQuery),
    [options, filterable, normalizedQuery],
  );

  /* ── find all flat options (incl. groups) for selectedOption lookup ── */
  const allFlatOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const result = [];
    for (const item of options) {
      if (!item) continue;
      if (typeof item.group === "string" && Array.isArray(item.options)) {
        result.push(...item.options.filter(Boolean));
      } else {
        result.push(item);
      }
    }
    return result;
  }, [options]);

  const selectedOption = useMemo(
    () => allFlatOptions.find((o) => o?.value === selectedValue) || null,
    [allFlatOptions, selectedValue],
  );

  const selectedTriggerText = useMemo(
    () => get_trigger_text(selectedOption),
    [selectedOption],
  );

  /* ── value helpers ── */
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

  const select_option = useCallback(
    (opt) => {
      if (!opt || opt.disabled || disabled) return;
      update_value(opt.value, opt);
      emit_open_change(false);
    },
    [disabled, emit_open_change, update_value],
  );

  /* ── keyboard navigation ── */
  const move_highlight = useCallback(
    (direction) => {
      if (!flatSelectable.length) return;
      const total = flatSelectable.length;
      let idx = highlightedIndex;
      for (let i = 0; i < total; i++) {
        if (idx === -1) {
          idx = direction > 0 ? 0 : total - 1;
        } else {
          idx = (idx + direction + total) % total;
        }
        if (!flatSelectable[idx]?.disabled) {
          setHighlightedIndex(idx);
          return;
        }
      }
    },
    [flatSelectable, highlightedIndex],
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
          highlightedIndex >= 0 ? flatSelectable[highlightedIndex] : null;
        if (candidate && !candidate.disabled) {
          e.preventDefault();
          select_option(candidate);
          return;
        }
        const enabled = flatSelectable.filter((o) => !o.disabled);
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
      flatSelectable,
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

  /* ── trigger width measurement ── */
  useLayoutEffect(() => {
    if (!triggerRef.current) return;
    const w = triggerRef.current.offsetWidth || 0;
    if (w !== triggerWidth) setTriggerWidth(w);
  }, [triggerWidth, mergedOpen]);

  useEffect(() => {
    const h = () => {
      if (triggerRef.current)
        setTriggerWidth(triggerRef.current.offsetWidth || 0);
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  /* ── highlight management on open ── */
  useEffect(() => {
    if (!mergedOpen) {
      setHighlightedIndex(-1);
      return;
    }
    const si = flatSelectable.findIndex(
      (o) => o?.value === selectedValue && !o?.disabled,
    );
    if (si >= 0) {
      setHighlightedIndex(si);
      return;
    }
    setHighlightedIndex(flatSelectable.findIndex((o) => o && !o.disabled));
  }, [mergedOpen, flatSelectable, selectedValue]);

  /* ── focus search input on panel mode ── */
  useEffect(() => {
    if (!mergedOpen) return;
    if (filterable && filter_mode === "panel" && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [mergedOpen, filterable, filter_mode]);

  /* ── scrollIntoView for highlighted option ── */
  useEffect(() => {
    if (!mergedOpen || highlightedIndex < 0) return;
    const el = optionRefs.current[highlightedIndex];
    if (el?.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [mergedOpen, highlightedIndex]);

  return {
    // state
    selectedValue,
    selectedOption,
    selectedTriggerText,
    mergedOpen,
    query,
    highlightedIndex,
    setHighlightedIndex,
    triggerWidth,
    // grouped data
    hasGroups,
    filteredGroups,
    filteredUngrouped,
    flatSelectable,
    totalSelectable,
    // refs
    triggerRef,
    triggerInputRef,
    searchInputRef,
    optionRefs,
    listboxIdRef,
    // handlers
    emit_open_change,
    select_option,
    handle_key_down,
    handle_query_change,
    on_group_toggle,
  };
};

export default useSelect;
