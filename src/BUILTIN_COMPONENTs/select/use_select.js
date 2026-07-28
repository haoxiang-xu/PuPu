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
        // Preserve the group's stable collapse key and badge markers so the
        // dropdown/rail can (a) address collapse state by group_key rather than
        // display name (C7) and (b) render a "Custom" badge for user-defined
        // providers (C11). Built-in groups carry none of these — undefined
        // fields keep their behavior byte-identical.
        group_key: typeof item.group_key === "string" ? item.group_key : undefined,
        is_custom: item.is_custom === true ? true : undefined,
        badge: typeof item.badge === "string" ? item.badge : undefined,
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
      group_key: g.group_key,
      is_custom: g.is_custom,
      badge: g.badge,
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
 *  useDropdownWheelGuard
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * All three Select variants render their dropdown INLINE (no portal),
 * absolutely positioned inside whatever scroll container hosts the
 * Select. Wheel input over the open panel must never chain to that host
 * container — either because the option list has too few rows to
 * overflow (so it never becomes a scroll boundary) or because the wheel
 * lands on chrome (padding, group headers, the search row) outside the
 * list entirely.
 *
 * Must attach via a real, non-passive `addEventListener("wheel", ...)`.
 * React registers its synthetic `onWheel` passively at the delegation
 * root, so `preventDefault()` inside a JSX `onWheel` handler is a silent
 * no-op. Attaching directly to the panel DOM node also lets us
 * `stopPropagation()` — needed because Tooltip's own `onWheel` (an
 * ancestor of this panel) imperatively forwards any unconsumed wheel
 * delta to the trigger's nearest scrollable ancestor regardless of
 * `defaultPrevented` (see tooltip.js `handle_tooltip_wheel`); without
 * stopping propagation here that forward would still fire and the
 * chaining bug would persist even though this guard "blocked" it.
 */
export const useDropdownWheelGuard = (open, panelRef, listRef) => {
  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const handle_wheel = (e) => {
      const list = listRef.current;
      if (!list || !list.contains(e.target)) {
        // wheel over dropdown chrome (padding, group headers, search row)
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const canScroll = list.scrollHeight > list.clientHeight;
      const atTop = list.scrollTop <= 0 && e.deltaY < 0;
      const atBottom =
        list.scrollTop + list.clientHeight >= list.scrollHeight - 1 &&
        e.deltaY > 0;
      if (!canScroll || atTop || atBottom) {
        e.preventDefault();
        e.stopPropagation();
      }
      // otherwise: list can still scroll in this direction — let the
      // native scroll happen naturally, no chaining risk either way.
    };
    panel.addEventListener("wheel", handle_wheel, { passive: false });
    return () => panel.removeEventListener("wheel", handle_wheel);
  }, [open, panelRef, listRef]);
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
  multi = false,
  filterable = true,
  filter_mode = "panel",
  disabled = false,
  open,
  on_open_change = () => {},
  on_group_toggle = () => {},
}) => {
  /* ── controlled / uncontrolled value ── */
  const is_value_controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(
    value ?? (multi ? [] : null),
  );
  const selectedValue = is_value_controlled ? value : internalValue;

  /* ── multi-select helpers ── */
  const selectedValuesSet = useMemo(() => {
    if (!multi) return new Set();
    return new Set(Array.isArray(selectedValue) ? selectedValue : []);
  }, [multi, selectedValue]);

  /* ── open state ── */
  const is_open_controlled = open !== undefined;
  const [isOpen, setIsOpen] = useState(false);
  const mergedOpen = is_open_controlled ? open : isOpen;

  /* ── query & highlight ── */
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndexState] = useState(-1);
  const shouldScrollHighlightedRef = useRef(true);

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

  const selectedOption = useMemo(() => {
    if (multi) {
      return allFlatOptions.filter((o) => selectedValuesSet.has(o?.value));
    }
    return allFlatOptions.find((o) => o?.value === selectedValue) || null;
  }, [allFlatOptions, selectedValue, multi, selectedValuesSet]);

  const selectedTriggerText = useMemo(() => {
    if (multi) {
      const arr = Array.isArray(selectedOption) ? selectedOption : [];
      return arr.length > 0 ? arr.map(get_trigger_text).join(", ") : "";
    }
    return get_trigger_text(selectedOption);
  }, [selectedOption, multi]);

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
      if (multi) {
        const current = Array.isArray(selectedValue) ? selectedValue : [];
        const next = current.includes(opt.value)
          ? current.filter((v) => v !== opt.value)
          : [...current, opt.value];
        update_value(next, opt);
        /* keep dropdown open in multi mode */
      } else {
        update_value(opt.value, opt);
        emit_open_change(false);
      }
    },
    [disabled, emit_open_change, update_value, multi, selectedValue],
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
          shouldScrollHighlightedRef.current = true;
          setHighlightedIndexState(idx);
          return;
        }
      }
    },
    [flatSelectable, highlightedIndex],
  );

  const setHighlightedIndex = useCallback((nextIndex) => {
    shouldScrollHighlightedRef.current = true;
    setHighlightedIndexState(nextIndex);
  }, []);

  const setHighlightedIndexFromHover = useCallback((nextIndex) => {
    shouldScrollHighlightedRef.current = false;
    setHighlightedIndexState(nextIndex);
  }, []);

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
      shouldScrollHighlightedRef.current = true;
      setHighlightedIndexState(-1);
      return;
    }
    if (multi) {
      // Multi: preserve the current highlight if it still points to a valid option.
      shouldScrollHighlightedRef.current = true;
      setHighlightedIndexState((currentIndex) => {
        if (currentIndex >= 0) {
          const current = flatSelectable[currentIndex];
          if (current && !current.disabled) return currentIndex;
        }
        return flatSelectable.findIndex((o) => o && !o.disabled);
      });
      return;
    }
    const si = flatSelectable.findIndex(
      (o) => o?.value === selectedValue && !o?.disabled,
    );
    shouldScrollHighlightedRef.current = true;
    if (si >= 0) {
      setHighlightedIndexState(si);
      return;
    }
    setHighlightedIndexState(flatSelectable.findIndex((o) => o && !o.disabled));
  }, [mergedOpen, flatSelectable, selectedValue, multi]);

  /* ── focus search input on panel mode ──
     The dropdown lives in a Tooltip that stays visibility:hidden until it
     is positioned, and hidden elements silently refuse focus — so retry
     across frames until the focus actually lands (keyboard navigation
     rides the search input's onKeyDown). */
  useEffect(() => {
    if (!mergedOpen) return undefined;
    if (!filterable || filter_mode !== "panel") return undefined;
    let cancelled = false;
    let attempts = 0;
    const tryFocus = () => {
      if (cancelled) return;
      const el = searchInputRef.current;
      if (el) {
        el.focus({ preventScroll: true });
        if (document.activeElement === el) {
          el.select();
          return;
        }
      }
      attempts += 1;
      if (attempts < 30) requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => {
      cancelled = true;
    };
  }, [mergedOpen, filterable, filter_mode]);

  /* ── scrollIntoView for highlighted option ── */
  useEffect(() => {
    if (!mergedOpen || highlightedIndex < 0) return;
    if (!shouldScrollHighlightedRef.current) {
      shouldScrollHighlightedRef.current = true;
      return;
    }
    const el = optionRefs.current[highlightedIndex];
    if (el?.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [mergedOpen, highlightedIndex]);

  return {
    // state
    selectedValue,
    selectedOption,
    selectedTriggerText,
    selectedValuesSet,
    multi,
    mergedOpen,
    query,
    highlightedIndex,
    setHighlightedIndex,
    setHighlightedIndexFromHover,
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
