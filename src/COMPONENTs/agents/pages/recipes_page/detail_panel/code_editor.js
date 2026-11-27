import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import hljs from "highlight.js/lib/common";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { loadHighlightTheme } from "../../../../../BUILTIN_COMPONENTs/code/code";
import { textFieldFill } from "./panel_style";

/* The Code node's Python editor.
 *
 * A native textarea does the editing — caret, selection, undo, IME — and its
 * own text is transparent. Under it a <pre> draws the same text through
 * highlight.js with the chat code block's colour theme, in the same font, the
 * same line height and the same padding, moved with the textarea's scroll.
 * Lines do not wrap (code is read by its lines), so the height is the line
 * count clamped between `minRows` and `maxRows`, and long lines scroll
 * sideways. A line-number gutter sits at the left, moved with the vertical
 * scroll only.
 *
 * While an IME is composing, the textarea shows its own text and the layer
 * steps aside, so composing text is never drawn twice or hidden. Tab inserts
 * four spaces (through the browser's own edit, so undo keeps it); Shift+Tab
 * still leaves the editor. */

export const CODE_FONT = "Menlo, Monaco, Consolas, monospace";
const FONT_SIZE = 12;
const LINE = 18;
const PAD = 10;
const INDENT = "    ";
const DIGIT = 7.3;

/* The chat code block's base text colour for each theme (vs2015 and
   atom-one-light), so the caret and unhighlighted text match it. */
const baseColor = (isDark) => (isDark ? "#DCDCDC" : "#383A42");
const gutterColor = (isDark) => (isDark ? "rgba(220,220,220,0.32)" : "rgba(56,58,66,0.34)");

export function highlight_python(text) {
  if (typeof text !== "string" || text === "") return "";
  try {
    return hljs.highlight(text, { language: "python", ignoreIllegals: true }).value;
  } catch (error) {
    return null;
  }
}

export default function CodeEditor({
  value,
  onChange,
  disabled = false,
  ariaLabel,
  placeholder,
  minRows = 8,
  maxRows = 24,
  isDark,
  testid,
}) {
  const config = useContext(ConfigContext);
  const themeMode = config && config.onThemeMode;
  useEffect(() => {
    loadHighlightTheme(themeMode);
  }, [themeMode]);

  const text = typeof value === "string" ? value : "";
  const area = useRef(null);
  const layer = useRef(null);
  const gutter = useRef(null);
  const caret = useRef(null);
  const [composing, setComposing] = useState(false);

  const lines = text.split("\n").length;
  const rows = Math.min(Math.max(lines, minRows), maxRows);
  const height = rows * LINE + PAD * 2;
  const gutterWidth = PAD + Math.ceil(String(Math.max(lines, 10)).length * DIGIT);
  const html = useMemo(() => highlight_python(text), [text]);
  const color = baseColor(isDark);
  const fill = textFieldFill(isDark);

  const sync = () => {
    const el = area.current;
    if (!el) return;
    if (layer.current) layer.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
    if (gutter.current) gutter.current.style.transform = `translateY(${-el.scrollTop}px)`;
  };
  useLayoutEffect(() => {
    /* A Tab typed where the browser has no editing command left the caret
       at the end; put it back after the inserted indent. */
    if (caret.current !== null && area.current) {
      area.current.selectionStart = caret.current;
      area.current.selectionEnd = caret.current;
      caret.current = null;
    }
    sync();
  });

  const onKeyDown = (event) => {
    if (event.key !== "Tab" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    if (disabled || event.nativeEvent.isComposing || composing) return;
    event.preventDefault();
    const el = event.currentTarget;
    const inserted = typeof window.document.execCommand === "function"
      && window.document.execCommand("insertText", false, INDENT);
    if (inserted) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    caret.current = start + INDENT.length;
    onChange(text.slice(0, start) + INDENT + text.slice(end));
  };

  const metrics = {
    fontFamily: CODE_FONT,
    fontSize: FONT_SIZE,
    lineHeight: `${LINE}px`,
    letterSpacing: 0,
    tabSize: 4,
    MozTabSize: 4,
  };

  return (
    <div
      data-testid={testid}
      style={{
        position: "relative",
        boxSizing: "border-box",
        width: "100%",
        minWidth: 0,
        height,
        borderRadius: fill.borderRadius,
        background: fill.restFill,
        border: fill.restBorder,
        overflow: "hidden",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: gutterWidth, overflow: "hidden", pointerEvents: "none" }}>
        <div ref={gutter} data-testid={testid ? `${testid}-gutter` : undefined}
          style={{ ...metrics, boxSizing: "border-box", padding: `${PAD}px 0 ${PAD}px ${PAD}px`, textAlign: "right",
            color: gutterColor(isDark), userSelect: "none", whiteSpace: "pre" }}>
          {Array.from({ length: lines }, (_, index) => index + 1).join("\n")}
        </div>
      </div>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: gutterWidth, right: 0, overflow: "hidden" }}>
        {!composing && (
          <pre ref={layer} aria-hidden="true" data-testid={testid ? `${testid}-highlight` : undefined}
            style={{ ...metrics, position: "absolute", top: 0, left: 0, margin: 0, boxSizing: "border-box",
              minWidth: "100%", minHeight: "100%", padding: PAD, whiteSpace: "pre", overflow: "visible",
              background: "transparent", color, pointerEvents: "none" }}>
            {text === "" ? (
              <span style={{ color: gutterColor(isDark) }}>{placeholder}</span>
            ) : html ? (
              <code className="hljs language-python"
                style={{ ...metrics, display: "inline", padding: 0, background: "transparent", overflow: "visible", color }}
                dangerouslySetInnerHTML={{ __html: html + "\n" }} />
            ) : (
              <code style={{ ...metrics, display: "inline" }}>{text + "\n"}</code>
            )}
          </pre>
        )}
        <textarea
          ref={area}
          aria-label={ariaLabel}
          disabled={disabled}
          value={text}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="scrollable"
          data-sb-wall={4}
          data-sb-edge={fill.borderRadius}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onScroll={sync}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          style={{
            ...metrics,
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            margin: 0,
            padding: PAD,
            whiteSpace: "pre",
            overflow: "auto",
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            color: composing ? color : "transparent",
            caretColor: color,
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
      </div>
    </div>
  );
}
