import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { dom_to_offset, extract_value, offset_to_dom } from "./tag_input_dom";

function dom_matches_segments(root, segments) {
  const children = root.childNodes;
  let idx = 0;
  for (const seg of segments) {
    if (seg.kind === "text") {
      if (!seg.value) continue;
      const child = children[idx];
      if (!child || child.nodeType !== 3 || child.textContent !== seg.value) {
        return false;
      }
      idx++;
    } else {
      const child = children[idx];
      if (
        !child ||
        child.nodeType !== 1 ||
        !child.dataset ||
        child.dataset.chipRaw !== seg.raw
      ) {
        return false;
      }
      idx++;
    }
  }
  return idx === children.length;
}

export default function TagInput({
  value,
  onChange,
  parse_chips,
  render_chip,
  autocomplete,
  placeholder,
  min_rows = 4,
  max_display_rows = 12,
  style,
  disabled = false,
}) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const root_ref = useRef(null);
  const pending_caret = useRef(null);
  const [popover, setPopover] = useState(null);
  const [chip_anchors, setChipAnchors] = useState([]);
  const segments = useMemo(
    () => (parse_chips ? parse_chips(value || "") : [{ kind: "text", value: value || "" }]),
    [value, parse_chips],
  );

  const fontSize = style?.fontSize || 12;
  const lineHeight = style?.lineHeight || 1.7;
  const padding = style?.padding ?? 10;
  const minHeight = `calc(${lineHeight}em * ${min_rows} + ${padding * 2}px)`;
  const maxHeight = Number.isFinite(max_display_rows)
    ? `calc(${lineHeight}em * ${max_display_rows} + ${padding * 2}px)`
    : "none";

  const border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const background = isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)";

  const is_empty = !value;

  const flat_options = useMemo(() => {
    if (!autocomplete) return [];
    const out = [];
    for (const it of autocomplete.options || []) {
      if (it && Array.isArray(it.options)) {
        for (const sub of it.options) out.push({ ...sub, group: it.group });
      } else if (it) {
        out.push(it);
      }
    }
    return out;
  }, [autocomplete]);

  const filtered_options = useMemo(() => {
    if (!popover) return [];
    const q = popover.query.toLowerCase();
    if (!q) return flat_options;
    return flat_options.filter((o) =>
      String(o.search || o.label || "").toLowerCase().includes(q),
    );
  }, [flat_options, popover]);

  function confirm_option(opt) {
    if (!autocomplete || !popover) return;
    const ctx = {
      insert: (str) => {
        const v = value || "";
        const next =
          v.slice(0, popover.trigger_offset) +
          str +
          v.slice(popover.trigger_offset + 1 + popover.query.length);
        pending_caret.current = popover.trigger_offset + str.length;
        onChange(next);
      },
      replace_range: (start, end, str) => {
        const v = value || "";
        const next = v.slice(0, start) + str + v.slice(end);
        pending_caret.current = start + str.length;
        onChange(next);
      },
    };
    autocomplete.on_select(opt, ctx);
    setPopover(null);
  }

  function handle_key_down(e) {
    if (popover && filtered_options.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPopover((p) =>
          p
            ? {
                ...p,
                active_index: Math.min(
                  filtered_options.length - 1,
                  p.active_index + 1,
                ),
              }
            : p,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPopover((p) =>
          p ? { ...p, active_index: Math.max(0, p.active_index - 1) } : p,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const opt = filtered_options[popover.active_index];
        if (opt) confirm_option(opt);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPopover(null);
        return;
      }
    }

    if (e.key === "Backspace") {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;
      const root = root_ref.current;
      if (!root) return;

      let prev = null;
      if (range.startContainer === root) {
        prev = root.childNodes[range.startOffset - 1] || null;
      } else if (
        range.startContainer.nodeType === 3 &&
        range.startOffset === 0
      ) {
        prev = range.startContainer.previousSibling;
      }
      if (
        !prev ||
        prev.nodeType !== 1 ||
        !prev.dataset ||
        prev.dataset.chipRaw == null
      )
        return;

      e.preventDefault();
      const chip_start = dom_to_offset(root, prev, 0);
      const chip_end = chip_start + prev.dataset.chipRaw.length;
      const v = value || "";
      const next_value = v.slice(0, chip_start) + v.slice(chip_end);
      pending_caret.current = chip_start;
      onChange(next_value);
    }
  }

  function handle_paste(e) {
    e.preventDefault();
    const text =
      (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
    if (!text) return;
    const root = root_ref.current;
    if (!root) return;
    const sel = window.getSelection();
    const v = value || "";
    if (!sel || sel.rangeCount === 0) {
      pending_caret.current = v.length + text.length;
      onChange(v + text);
      return;
    }
    const range = sel.getRangeAt(0);
    const start = dom_to_offset(root, range.startContainer, range.startOffset);
    const end = range.collapsed
      ? start
      : dom_to_offset(root, range.endContainer, range.endOffset);
    const next = v.slice(0, start) + text + v.slice(end);
    pending_caret.current = start + text.length;
    onChange(next);
  }

  function compute_popover_state(next_value) {
    if (!autocomplete) return null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    const root = root_ref.current;
    if (!root) return null;
    const caret = dom_to_offset(root, range.startContainer, range.startOffset);
    const trig = autocomplete.trigger;
    const v = next_value || "";
    let i = caret - 1;
    let trigger_offset = -1;
    while (i >= 0) {
      const ch = v[i];
      if (ch === trig) {
        trigger_offset = i;
        break;
      }
      if (ch === "\n" || ch === " ") break;
      i--;
    }
    if (trigger_offset < 0) return null;
    const query = v.slice(trigger_offset + 1, caret);
    let anchor = { top: 0, left: 0 };
    try {
      const rect = range.getBoundingClientRect();
      const root_rect = root.getBoundingClientRect();
      anchor = {
        top: rect.bottom - root_rect.top + 4,
        left: rect.left - root_rect.left,
      };
    } catch (_) {}
    return { trigger_offset, query, anchor, active_index: 0 };
  }

  function handle_input() {
    if (!root_ref.current) return;
    const next = extract_value(root_ref.current);
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const r = sel.getRangeAt(0);
      pending_caret.current = dom_to_offset(
        root_ref.current,
        r.startContainer,
        r.startOffset,
      );
    }
    if (next !== value) onChange(next);
    setPopover(compute_popover_state(next));
  }

  useEffect(() => {
    if (!popover) return undefined;
    function on_doc_mousedown(e) {
      if (!root_ref.current) return;
      if (root_ref.current.contains(e.target)) return;
      setPopover(null);
    }
    document.addEventListener("mousedown", on_doc_mousedown);
    return () => document.removeEventListener("mousedown", on_doc_mousedown);
  }, [popover]);

  useLayoutEffect(() => {
    const root = root_ref.current;
    if (!root) return;

    if (!dom_matches_segments(root, segments)) {
      while (root.firstChild) {
        root.removeChild(root.firstChild);
      }
      const new_anchors = [];
      for (const seg of segments) {
        if (seg.kind === "text") {
          if (seg.value) {
            root.appendChild(document.createTextNode(seg.value));
          }
        } else {
          const span = document.createElement("span");
          span.setAttribute("data-chip-raw", seg.raw);
          span.setAttribute("contenteditable", "false");
          span.style.display = "inline-block";
          span.style.verticalAlign = "baseline";
          root.appendChild(span);
          new_anchors.push({ seg, span });
        }
      }
      setChipAnchors(new_anchors);
    }

    if (pending_caret.current != null) {
      const { node, offset } = offset_to_dom(root, pending_caret.current);
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        try {
          range.setStart(node, offset);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        } catch (_) {}
      }
      pending_caret.current = null;
    }
  });

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        ref={root_ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handle_input}
        onKeyDown={handle_key_down}
        onPaste={handle_paste}
        style={{
          width: "100%",
          fontSize,
          lineHeight,
          fontFamily: "ui-monospace, Menlo, monospace",
          padding,
          borderRadius: 8,
          border,
          background,
          minHeight,
          maxHeight,
          overflowY: "auto",
          outline: "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          color: "inherit",
          ...style,
        }}
      />
      {chip_anchors.map((a, i) =>
        a.span.isConnected
          ? createPortal(render_chip(a.seg, isDark), a.span, `chip-${i}-${a.seg.raw}`)
          : null,
      )}
      {popover && filtered_options.length > 0 && (
        <div
          data-testid="tag-input-popover"
          style={{
            position: "absolute",
            top: popover.anchor.top,
            left: popover.anchor.left,
            zIndex: 50,
            minWidth: 200,
            maxHeight: 240,
            overflowY: "auto",
            borderRadius: 8,
            border,
            background,
            boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
            fontSize: 12,
          }}
        >
          {filtered_options.map((opt, i) => {
            const is_active = i === popover.active_index;
            const prev_group =
              i > 0 ? filtered_options[i - 1].group : undefined;
            const show_group = opt.group && opt.group !== prev_group;
            return (
              <React.Fragment key={`${opt.value}-${i}`}>
                {show_group && (
                  <div
                    style={{
                      padding: "4px 10px 2px",
                      fontSize: 10,
                      color: "#86868b",
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {opt.group}
                  </div>
                )}
                <div
                  data-tag-option-index={i}
                  style={{
                    padding: "6px 10px",
                    cursor: "pointer",
                    background: is_active
                      ? isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(0,0,0,0.06)"
                      : "transparent",
                  }}
                >
                  {autocomplete.render_option(opt)}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {is_empty && placeholder && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: padding,
            left: padding,
            color: "#86868b",
            fontSize,
            lineHeight,
            fontFamily: "ui-monospace, Menlo, monospace",
            pointerEvents: "none",
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}
