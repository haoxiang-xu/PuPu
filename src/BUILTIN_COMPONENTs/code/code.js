import { useContext, useEffect, useState } from "react";
import hljs from "highlight.js/lib/common";
import { createLogger } from "../../SERVICEs/console_logger";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* ── Utilities ─────────────────────────────────────────────────────────────── */

const codeLogger = createLogger("UI", "BUILTIN_COMPONENTs/code/code.js");

const toPx = (v, fb) => {
  if (v == null) return fb;
  return typeof v === "number" ? `${v}px` : v;
};

const toText = (node) => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(toText).join("");
  if (typeof node === "object" && node.props?.children !== undefined)
    return toText(node.props.children);
  return "";
};

const DEFAULT_MAX_AUTO_DETECT_CHARS = 6000;

const scheduleHighlightTask = (
  callback,
  { timeout = 220, delay = 48 } = {},
) => {
  if (
    typeof window !== "undefined" &&
    typeof window.requestIdleCallback === "function"
  ) {
    const idleId = window.requestIdleCallback(
      () => {
        callback();
      },
      { timeout },
    );
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
    };
  }

  const timerId = setTimeout(() => {
    callback();
  }, delay);
  return () => clearTimeout(timerId);
};

/* ── Highlight.js theme loader (shared across all Code instances) ────────── */

const hljsThemeCache = { light: [], dark: [] };

const loadHighlightTheme = async (themeMode) => {
  if (typeof document === "undefined") return;
  const themeKey = themeMode === "dark_mode" ? "dark" : "light";

  if (!hljsThemeCache[themeKey].length) {
    const before = Array.from(
      document.head.querySelectorAll("style,link[rel='stylesheet']"),
    );
    try {
      if (themeKey === "dark") {
        await import("highlight.js/styles/vs2015.css");
      } else {
        await import("highlight.js/styles/atom-one-light.css");
      }
    } catch (err) {
      codeLogger.error("theme", "highlight theme load failed", err);
      return;
    }
    const after = Array.from(
      document.head.querySelectorAll("style,link[rel='stylesheet']"),
    );
    const newNodes = after.filter((n) => !before.includes(n));
    hljsThemeCache[themeKey] = newNodes;
    newNodes.forEach((n) => n.setAttribute("data-hljs-theme", themeKey));
  }

  Object.entries(hljsThemeCache).forEach(([key, nodes]) => {
    const disabled = key !== themeKey;
    nodes.forEach((n) => {
      n.disabled = disabled;
      if (n.sheet) n.sheet.disabled = disabled;
    });
  });
};

/* ── Code Component ────────────────────────────────────────────────────────── */

const Code = ({
  children,
  code,
  language,
  height,
  style,
  showHeader,
  showCopy = true,
  deferHighlight = true,
  maxAutoDetectChars = DEFAULT_MAX_AUTO_DETECT_CHARS,
  className,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const codeTheme = theme?.code || {};

  /* Load highlight.js colour theme */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadHighlightTheme(onThemeMode);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [onThemeMode]);

  /* Resolve code text */
  const codeText =
    code || (typeof children === "string" ? children : toText(children));

  /* Resolve language */
  const lang = language || "";

  /* Copy */
  const canCopy =
    typeof navigator !== "undefined" && !!navigator.clipboard?.writeText;
  const shouldShowHeader =
    showHeader !== undefined ? showHeader : !!(lang || (showCopy && canCopy));
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState("");
  const handleCopy = async () => {
    if (!canCopy) return;
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  /* Highlight */
  useEffect(() => {
    let cancelled = false;

    if (!codeText) {
      setHighlightedHtml("");
      return () => {
        cancelled = true;
      };
    }

    const shouldSkipAutoDetect = !lang && codeText.length > maxAutoDetectChars;
    if (shouldSkipAutoDetect) {
      setHighlightedHtml("");
      return () => {
        cancelled = true;
      };
    }

    const applyHighlight = () => {
      if (cancelled) {
        return;
      }
      let nextHtml = "";
      try {
        if (lang && hljs.getLanguage(lang)) {
          nextHtml = hljs.highlight(codeText, { language: lang }).value;
        } else {
          nextHtml = hljs.highlightAuto(codeText).value;
        }
      } catch {
        nextHtml = "";
      }

      if (!cancelled) {
        setHighlightedHtml(nextHtml);
      }
    };

    if (!deferHighlight) {
      applyHighlight();
      return () => {
        cancelled = true;
      };
    }

    setHighlightedHtml("");
    const cancelTask = scheduleHighlightTask(applyHighlight, {
      timeout: lang ? 120 : 220,
      delay: lang ? 24 : 56,
    });
    return () => {
      cancelled = true;
      cancelTask();
    };
  }, [codeText, deferHighlight, lang, maxAutoDetectChars]);

  const codeClassName = [lang ? `language-${lang}` : "", "hljs"]
    .filter(Boolean)
    .join(" ");

  /* Theme defaults */
  const bgColor = codeTheme.backgroundColor || "#F5F5F5";
  const borderRadius = codeTheme.borderRadius ?? 7;
  const codePadding = toPx(codeTheme.padding, "12px");
  const fontFamily =
    codeTheme.fontFamily || "Menlo, Monaco, Consolas, monospace";
  const fontSize = toPx(codeTheme.fontSize, "13px");
  const lineHeight = codeTheme.lineHeight || 1.5;
  const codeColor = codeTheme.color || "inherit";
  const headerPadding = codeTheme.header?.padding || "6px 10px";
  const headerFontSize = toPx(codeTheme.header?.fontSize, "12px");
  const labelColor = codeTheme.header?.color || theme?.color || "#222";

  /* Height handling – height prop = total height including header */
  const resolvedHeight =
    height !== undefined ? toPx(height, height) : undefined;
  const hasHeightConstraint =
    height !== undefined ||
    style?.height !== undefined ||
    style?.maxHeight !== undefined ||
    style?.flex !== undefined;

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: bgColor,
        borderRadius,
        margin: 0,
        ...style,
        ...(resolvedHeight ? { height: resolvedHeight } : {}),
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      {shouldShowHeader && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: headerPadding,
            fontSize: headerFontSize,
            color: labelColor,
            flexShrink: 0,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          <span
            style={{
              textTransform: "uppercase",
              fontFamily: theme?.font?.fontFamily || "inherit",
            }}
          >
            {lang}
          </span>
          {showCopy && canCopy && (
            <button
              type="button"
              onClick={handleCopy}
              style={{
                background: "transparent",
                color: labelColor,
                border: "none",
                padding: 0,
                fontSize: headerFontSize,
                fontFamily: theme?.font?.fontFamily || "inherit",
                cursor: "pointer",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      )}

      {/* ── Scrollable code area ──────────────────────────────────── */}
      <div
        className="scrollable"
        style={{
          ...(hasHeightConstraint ? { flex: 1, minHeight: 0 } : {}),
          margin: 6,
          ...(shouldShowHeader ? { marginTop: 0 } : {}),
          overflow: "auto",
          padding: codePadding,
          /* Prevent parent prose wrapping from leaking into fenced code blocks. */
          wordBreak: "normal",
          overflowWrap: "normal",
          hyphens: "none",
        }}
      >
        <code
          className={codeClassName}
          style={{
            display: "block",
            fontFamily,
            fontSize,
            lineHeight,
            color: codeColor,
            background: "transparent",
            padding: 0,
            borderRadius: 0,
            border: "none",
            whiteSpace: "pre",
            width: "fit-content",
            wordBreak: "normal",
            overflowWrap: "normal",
            hyphens: "none",
          }}
          dangerouslySetInnerHTML={
            highlightedHtml ? { __html: highlightedHtml } : undefined
          }
        >
          {!highlightedHtml ? codeText : null}
        </code>
      </div>
    </div>
  );
};

export { Code as default, loadHighlightTheme };
