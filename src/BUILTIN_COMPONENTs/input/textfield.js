import { useCallback, useContext, useEffect, useRef, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/**
 * FloatingTextField — auto-expanding multi-line input.
 *
 * Props:
 *   value / set_value      – controlled text
 *   min_rows               – initial visible rows (default 1)
 *   max_display_rows       – rows before scroll kicks in (default Infinity → no cap)
 *   style                  – override fontSize, lineHeight, borderRadius, backgroundColor, padding, width, …
 *   placeholder            – placeholder text shown when empty
 *   disabled               – disables the field
 *   content_section        – React node rendered at left (floats up like a label when text is entered)
 *   functional_section     – React node rendered at bottom-right (e.g. send button)
 *   on_focus / on_blur     – callbacks
 *   on_key_down            – keyDown handler (e.g. Shift+Enter)
 *   textarea_ref           – optional external ref for the <textarea>
 */
const FloatingTextField = ({
  value,
  set_value = () => {},
  min_rows = 1,
  max_display_rows = Infinity,
  style,
  placeholder,
  disabled = false,
  content_section,
  functional_section,
  on_focus = () => {},
  on_blur = () => {},
  on_key_down = () => {},
  textarea_ref,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const tf = theme?.textfield || {};

  /* ---- resolved design tokens ---- */
  const fontSize = style?.fontSize || tf.fontSize || 16;
  const lineHeight = style?.lineHeight || tf.lineHeight || 1.5;
  const fontFamily =
    style?.fontFamily || theme?.font?.fontFamily || "Jost, sans-serif";
  const borderRadius = style?.borderRadius || tf.borderRadius || 7;
  const bg =
    style?.backgroundColor ??
    tf.backgroundColor ??
    (isDark ? "rgba(30,30,30,0.95)" : "rgba(255,255,255,0.95)");
  const border =
    style?.border ||
    tf.border ||
    (isDark
      ? "1px solid rgba(255,255,255,0.08)"
      : "1px solid rgba(0,0,0,0.06)");
  const shadow =
    tf.boxShadow ||
    (isDark
      ? "0 4px 24px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)"
      : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)");
  const shadowFocus =
    tf.boxShadowFocus ||
    (isDark
      ? "0 12px 36px rgba(0,0,0,0.55), 0 3px 8px rgba(0,0,0,0.35)"
      : "0 12px 36px rgba(0,0,0,0.10), 0 3px 8px rgba(0,0,0,0.06)");
  const padding = style?.padding ?? tf.padding ?? 12;
  const baseColor = style?.color || theme?.color || (isDark ? "#CCC" : "#222");

  const lineHeightPx = Math.round(fontSize * lineHeight);

  /* ---- state ---- */
  const [internalValue, setInternalValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const defaultRef = useRef(null);
  const taRef = textarea_ref || defaultRef;
  const funcRef = useRef(null);
  const [funcWidth, setFuncWidth] = useState(0);
  const [funcHeight, setFuncHeight] = useState(0);
  const contentRef = useRef(null);
  const [contentSectionH, setContentSectionH] = useState(0);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? String(value ?? "") : internalValue;
  const hasValue = currentValue.length > 0;

  /* ---- measure functional section width & height ---- */
  useEffect(() => {
    if (!funcRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setFuncWidth(Math.ceil(e.contentRect.width));
        setFuncHeight(Math.ceil(e.contentRect.height));
      }
    });
    ro.observe(funcRef.current);
    return () => ro.disconnect();
  }, [functional_section]);

  /* ---- measure content section height ---- */
  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries)
        setContentSectionH(Math.ceil(e.contentRect.height));
    });
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [content_section]);

  /* ---- compute height ---- */
  const minH = min_rows * lineHeightPx + padding * 2;
  const maxH =
    max_display_rows < Infinity
      ? max_display_rows * lineHeightPx + padding * 2
      : Infinity;

  /* Use a hidden measurement div to get the actual content height */
  const measureRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(minH);

  const measure = useCallback(() => {
    if (!measureRef.current) return;
    /* The measure div mirrors the textarea exactly */
    measureRef.current.style.width = taRef.current?.clientWidth
      ? taRef.current.clientWidth + "px"
      : "100%";
    measureRef.current.textContent =
      currentValue + "\n"; /* trailing newline to account for last empty line */
    const raw = measureRef.current.scrollHeight;
    const clamped = Math.max(
      minH,
      Math.min(raw, maxH === Infinity ? raw : maxH),
    );
    setContentHeight(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue, minH, maxH]);

  useEffect(() => {
    measure();
  }, [measure]);

  /* Also re-measure on resize */
  useEffect(() => {
    if (!taRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(taRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

  const shouldScroll = maxH !== Infinity && contentHeight >= maxH;

  /* ---- content section "active" = floated above the input ---- */
  const contentActive = hasValue || focused;

  /* If min_rows > 1, the content section rests at the first-line center, else vertically centered */
  const contentRestTop = min_rows > 1 ? padding + lineHeightPx / 2 : minH / 2;
  const contentFloatedTop = -(contentSectionH + padding);
  /* left offset that matches the vertical gap (top edge of content section to container top) */
  const contentRestLeft =
    contentSectionH > 0 ? contentRestTop - contentSectionH / 2 : padding;

  return (
    <div
      style={{
        position: "relative",
        width: style?.width || "100%",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "text",
        ...style,
      }}
      onClick={() => {
        if (disabled) return;
        if (taRef.current) taRef.current.focus();
      }}
    >
      {/* ── Main container ── */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          boxSizing: "border-box",
          backgroundColor: bg,
          border,
          borderRadius,
          boxShadow: hovered || focused ? shadowFocus : shadow,
          transition:
            "box-shadow 0.3s ease, height 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          height: contentHeight,
          overflow: "hidden",
        }}
      >
        {/* ── Hidden measurement div ── */}
        <div
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            visibility: "hidden",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            boxSizing: "border-box",
            fontFamily,
            fontSize,
            lineHeight,
            padding,
            paddingRight: padding + funcWidth + 8,
            width: "100%",
            pointerEvents: "none",
          }}
        />

        {/* ── Textarea ── */}
        <textarea
          ref={taRef}
          disabled={disabled}
          value={currentValue}
          placeholder={
            !content_section || contentActive ? placeholder : undefined
          }
          onChange={(e) => {
            const v = e.target.value;
            if (isControlled) set_value(v, e);
            else setInternalValue(v);
          }}
          onFocus={() => {
            setFocused(true);
            on_focus();
          }}
          onBlur={() => {
            setFocused(false);
            on_blur();
          }}
          onKeyDown={on_key_down}
          className={shouldScroll ? "scrollable" : undefined}
          data-sb-edge={Math.max(6, borderRadius)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            boxSizing: "border-box",
            fontFamily,
            fontSize,
            lineHeight:
              contentHeight <= minH && min_rows === 1
                ? contentHeight - 2 + "px"
                : lineHeight,
            color: baseColor,
            caretColor: baseColor,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            paddingTop: contentHeight <= minH && min_rows === 1 ? 0 : padding,
            paddingBottom:
              contentHeight <= minH && min_rows === 1 ? 0 : padding,
            paddingLeft: padding,
            paddingRight: padding + funcWidth + 8,
            margin: 0,
            overflow: shouldScroll ? "auto" : "hidden",
          }}
        />

        {/* ── Functional section (bottom-right) ── */}
        {functional_section && (
          <div
            ref={funcRef}
            style={{
              position: "absolute",
              right:
                min_rows === 1 && contentHeight <= minH && funcHeight > 0
                  ? (contentHeight - funcHeight) / 2 - 1
                  : padding,
              bottom:
                min_rows === 1 && contentHeight <= minH && funcHeight > 0
                  ? (contentHeight - funcHeight) / 2 - 1
                  : padding,
              display: "flex",
              alignItems: "center",
              gap: 4,
              pointerEvents: "auto",
              zIndex: 2,
              transition:
                "bottom 0.25s cubic-bezier(0.4, 0, 0.2, 1), right 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {functional_section}
          </div>
        )}
      </div>

      {/* ── Content section (floating label-like) ── */}
      {content_section && (
        <div
          ref={contentRef}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.stopPropagation()}
          onBlur={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: contentActive ? 0 : contentRestLeft,
            top: contentActive ? contentFloatedTop : contentRestTop,
            transform: contentActive ? "translateY(0)" : "translateY(-50%)",
            opacity: 1,
            pointerEvents: "auto",
            userSelect: "none",
            WebkitUserSelect: "none",
            transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {content_section}
        </div>
      )}
    </div>
  );
};

/* ── TextField ───────────────────────────────────────────────────────────────── */
/**
 * Ghost-style multi-line input — transparent background, faint border.
 * On hover / focus the background scales from center (same animation as Button)
 * and the border disappears.  Same props as FloatingTextField.
 */
const TextField = ({
  value,
  set_value = () => {},
  min_rows = 1,
  max_display_rows = Infinity,
  style,
  placeholder,
  disabled = false,
  content_section,
  functional_section,
  on_focus = () => {},
  on_blur = () => {},
  on_key_down = () => {},
  textarea_ref,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const tf = theme?.textfield || {};

  /* ── design tokens ── */
  const fontSize = style?.fontSize || tf.fontSize || 16;
  const lineHeight = style?.lineHeight || tf.lineHeight || 1.5;
  const fontFamily =
    style?.fontFamily || theme?.font?.fontFamily || "Jost, sans-serif";
  const borderRadius = style?.borderRadius || tf.borderRadius || 7;
  const baseColor = style?.color || theme?.color || (isDark ? "#CCC" : "#222");
  const padding = style?.padding ?? tf.padding ?? 12;

  /* ghost-specific tokens */
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const activeBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const faintBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.12)";

  const lineHeightPx = Math.round(fontSize * lineHeight);

  /* ── state ── */
  const [internalValue, setInternalValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const defaultRef = useRef(null);
  const taRef = textarea_ref || defaultRef;
  const funcRef = useRef(null);
  const [funcWidth, setFuncWidth] = useState(0);
  const [funcHeight, setFuncHeight] = useState(0);
  const contentRef = useRef(null);
  const [contentSectionH, setContentSectionH] = useState(0);

  const isControlled = value !== undefined;
  const currentValue = isControlled ? String(value ?? "") : internalValue;
  const hasValue = currentValue.length > 0;

  const showBg = hovered || focused;

  /* ── measure functional section ── */
  useEffect(() => {
    if (!funcRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setFuncWidth(Math.ceil(e.contentRect.width));
        setFuncHeight(Math.ceil(e.contentRect.height));
      }
    });
    ro.observe(funcRef.current);
    return () => ro.disconnect();
  }, [functional_section]);

  /* ── measure content section ── */
  useEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries)
        setContentSectionH(Math.ceil(e.contentRect.height));
    });
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [content_section]);

  /* ── compute height ── */
  const minH = min_rows * lineHeightPx + padding * 2;
  const maxH =
    max_display_rows < Infinity
      ? max_display_rows * lineHeightPx + padding * 2
      : Infinity;

  const measureRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(minH);

  const measure = useCallback(() => {
    if (!measureRef.current) return;
    measureRef.current.style.width = taRef.current?.clientWidth
      ? taRef.current.clientWidth + "px"
      : "100%";
    measureRef.current.textContent = currentValue + "\n";
    const raw = measureRef.current.scrollHeight;
    const clamped = Math.max(
      minH,
      Math.min(raw, maxH === Infinity ? raw : maxH),
    );
    setContentHeight(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue, minH, maxH]);

  useEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!taRef.current) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(taRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure]);

  const shouldScroll = maxH !== Infinity && contentHeight >= maxH;

  const contentActive = hasValue || focused;
  const contentRestTop = min_rows > 1 ? padding + lineHeightPx / 2 : minH / 2;
  const contentFloatedTop = -(contentSectionH + padding);
  const contentRestLeft =
    contentSectionH > 0 ? contentRestTop - contentSectionH / 2 : padding;

  return (
    <div
      style={{
        position: "relative",
        width: style?.width || "100%",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "text",
        ...style,
      }}
      onClick={() => {
        if (disabled) return;
        if (taRef.current) taRef.current.focus();
      }}
    >
      {/* ── Main container ── */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          boxSizing: "border-box",
          backgroundColor: "transparent",
          border: showBg ? "1px solid transparent" : faintBorder,
          borderRadius,
          transition:
            "border 0.2s ease, height 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          height: contentHeight,
          overflow: "hidden",
        }}
      >
        {/* ── Hover / focus background (scales from center) ── */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius,
            backgroundColor: focused ? activeBg : hoverBg,
            transform: showBg ? "scale(1)" : "scale(0.5, 0)",
            opacity: showBg ? 1 : 0,
            transition: showBg
              ? "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.0), opacity 0.18s ease"
              : "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        {/* ── Hidden measurement div ── */}
        <div
          ref={measureRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            visibility: "hidden",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            boxSizing: "border-box",
            fontFamily,
            fontSize,
            lineHeight,
            padding,
            paddingRight: padding + funcWidth + 8,
            width: "100%",
            pointerEvents: "none",
          }}
        />

        {/* ── Textarea ── */}
        <textarea
          ref={taRef}
          disabled={disabled}
          value={currentValue}
          placeholder={
            !content_section || contentActive ? placeholder : undefined
          }
          onChange={(e) => {
            const v = e.target.value;
            if (isControlled) set_value(v, e);
            else setInternalValue(v);
          }}
          onFocus={() => {
            setFocused(true);
            on_focus();
          }}
          onBlur={() => {
            setFocused(false);
            on_blur();
          }}
          onKeyDown={on_key_down}
          className={shouldScroll ? "scrollable" : undefined}
          data-sb-edge={Math.max(6, borderRadius)}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            boxSizing: "border-box",
            fontFamily,
            fontSize,
            lineHeight:
              contentHeight <= minH && min_rows === 1
                ? contentHeight - 2 + "px"
                : lineHeight,
            color: baseColor,
            caretColor: baseColor,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            paddingTop: contentHeight <= minH && min_rows === 1 ? 0 : padding,
            paddingBottom:
              contentHeight <= minH && min_rows === 1 ? 0 : padding,
            paddingLeft: padding,
            paddingRight: padding + funcWidth + 8,
            margin: 0,
            overflow: shouldScroll ? "auto" : "hidden",
            zIndex: 1,
          }}
        />

        {/* ── Functional section (bottom-right) ── */}
        {functional_section && (
          <div
            ref={funcRef}
            style={{
              position: "absolute",
              right:
                min_rows === 1 && contentHeight <= minH && funcHeight > 0
                  ? (contentHeight - funcHeight) / 2 - 1
                  : padding,
              bottom:
                min_rows === 1 && contentHeight <= minH && funcHeight > 0
                  ? (contentHeight - funcHeight) / 2 - 1
                  : padding,
              display: "flex",
              alignItems: "center",
              gap: 4,
              pointerEvents: "auto",
              zIndex: 2,
              transition:
                "bottom 0.25s cubic-bezier(0.4, 0, 0.2, 1), right 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            {functional_section}
          </div>
        )}
      </div>

      {/* ── Content section (floating label-like) ── */}
      {content_section && (
        <div
          ref={contentRef}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
          onClick={(e) => e.stopPropagation()}
          onFocus={(e) => e.stopPropagation()}
          onBlur={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            left: contentActive ? 0 : contentRestLeft,
            top: contentActive ? contentFloatedTop : contentRestTop,
            transform: contentActive ? "translateY(0)" : "translateY(-50%)",
            opacity: 1,
            pointerEvents: "auto",
            userSelect: "none",
            WebkitUserSelect: "none",
            transition: "all 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {content_section}
        </div>
      )}
    </div>
  );
};

export { TextField as default, FloatingTextField, TextField };
