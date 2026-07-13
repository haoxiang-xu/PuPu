import {
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactShowdown from "react-showdown";

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import MarkdownCodeBlock from "./code";
import { acquireMarkdownStyle } from "./markdown_style_registry";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* ── <think> block — renders DeepSeek reasoning content as a collapsible section ─────────────────────────────────────────────── */
const ThinkBlock = ({ children }) => {
  const [open, setOpen] = useState(false);
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const hasContent =
    children !== undefined && children !== null && children !== "";

  if (!hasContent) return null;

  /* neutral think-block colors track the text ink at their original alpha
     (dark default 255,255,255 is lossless; light 34,34,34 vs 0,0,0 is
     imperceptible at these low alphas) and now follow the custom text color */
  const borderColor = `rgba(var(--pupu-text-rgb), ${isDark ? 0.1 : 0.08})`;
  const bgColor = `rgba(var(--pupu-text-rgb), ${isDark ? 0.03 : 0.02})`;
  const mutedColor = "rgba(var(--pupu-text-rgb), 0.4)";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  return (
    <div
      style={{
        margin: "0.5em 0",
        borderRadius: 8,
        border: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        overflow: "hidden",
      }}
    >
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          cursor: "pointer",
          userSelect: "none",
          fontFamily,
          fontSize: 13,
          fontWeight: 500,
          color: mutedColor,
        }}
      >
        <span
          style={{
            display: "inline-block",
            transition: "transform 0.15s ease",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            fontSize: 10,
          }}
        >
          ▶
        </span>
        Thinking
      </div>
      {open && (
        <div
          style={{
            padding: "0 12px 10px",
            fontSize: 13,
            lineHeight: 1.6,
            color: mutedColor,
            whiteSpace: "pre-wrap",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
/* ── end <think> block ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

const toPx = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number") return `${value}px`;
  return value;
};
const toLineHeight = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  return value;
};
const MARKDOWN_STYLE_KEYS = new Set([
  "fontFamily",
  "fontSize",
  "lineHeight",
  "color",
  "backgroundColor",
  "paragraphMargin",
  "blockGap",
  "heading",
  "list",
  "blockquote",
  "code",
  "pre",
  "link",
  "hr",
  "table",
  "image",
  "codeBlock",
]);
const EMPTY_COMPONENTS = Object.freeze({});

const splitStyleProps = (style) => {
  if (!style || typeof style !== "object") {
    return { containerStyle: style, markdownStyle: undefined };
  }

  const { container, ...rest } = style;
  const containerKeys = {};
  const markdownKeys = {};

  Object.keys(rest).forEach((key) => {
    if (MARKDOWN_STYLE_KEYS.has(key)) {
      markdownKeys[key] = rest[key];
    } else {
      containerKeys[key] = rest[key];
    }
  });

  const hasContainerKeys = Object.keys(containerKeys).length > 0;
  const hasMarkdownKeys = Object.keys(markdownKeys).length > 0;

  return {
    containerStyle: container
      ? { ...containerKeys, ...container }
      : hasContainerKeys
        ? containerKeys
        : undefined,
    markdownStyle: hasMarkdownKeys ? markdownKeys : undefined,
  };
};
const mergeMarkdownTheme = (baseTheme, overrideTheme) => {
  if (!overrideTheme) return baseTheme || {};

  const merged = { ...(baseTheme || {}), ...overrideTheme };
  const nestedKeys = [
    "heading",
    "list",
    "blockquote",
    "code",
    "pre",
    "link",
    "hr",
    "table",
    "image",
    "codeBlock",
  ];

  nestedKeys.forEach((key) => {
    if (baseTheme?.[key] && overrideTheme?.[key]) {
      merged[key] = { ...baseTheme[key], ...overrideTheme[key] };
    }
  });

  return merged;
};
const Markdown = ({
  children = "",
  markdown,
  options,
  extensions,
  components = EMPTY_COMPONENTS,
  flavor,
  sanitize_html = false,
  className,
  style,
}) => {
  const { theme } = useContext(ConfigContext);
  const idRef = useRef(
    `mini-ui-markdown-${Math.random().toString(36).slice(2, 10)}`,
  );
  // 共享样式表的 sid:由注册表按 cssText 分配,相同主题/字号的实例复用同一 sid。
  // 首帧 sid 为 null(选择器不匹配),但 useLayoutEffect 在 paint 前同步 acquire + setSid,
  // 触发 paint 前的二次渲染 → 首帧即带 sid,无样式闪烁。
  const [styleSid, setStyleSid] = useState(null);
  const markdownText =
    typeof markdown === "string"
      ? markdown
      : typeof children === "string"
        ? children
        : Array.isArray(children)
          ? children.join("")
          : "";
  const { containerStyle, markdownStyle } = useMemo(
    () => splitStyleProps(style),
    [style],
  );
  const mergedMarkdownTheme = useMemo(
    () => mergeMarkdownTheme(theme?.markdown, markdownStyle),
    [theme, markdownStyle],
  );
  const css = useMemo(() => {
    const markdownTheme = mergedMarkdownTheme;
    const baseFontFamily =
      markdownTheme.fontFamily ||
      theme?.font?.paragraphFontFamily ||
      theme?.font?.fontFamily ||
      "NunitoSans, sans-serif";
    const baseFontSize = toPx(markdownTheme.fontSize, "16px");
    const baseLineHeight = toLineHeight(markdownTheme.lineHeight, 1.6);
    const baseColor = markdownTheme.color || theme?.color || "#222222";
    const baseBackground = markdownTheme.backgroundColor || "transparent";
    const heading = markdownTheme.heading || {};
    const list = markdownTheme.list || {};
    const blockquote = markdownTheme.blockquote || {};
    const code = markdownTheme.code || {};
    const link = markdownTheme.link || {};
    const hr = markdownTheme.hr || {};
    const table = markdownTheme.table || {};
    const image = markdownTheme.image || {};
    const paragraphMargin = markdownTheme.paragraphMargin;
    const blockGap = markdownTheme.blockGap;
    const hasBlockGap = blockGap !== undefined && blockGap !== null;

    const codeTheme = theme?.code || {};

    return `
      [data-markdown-sid="__SID__"] {
        font-family: ${baseFontFamily};
        font-size: ${baseFontSize};
        line-height: ${baseLineHeight};
        color: ${baseColor};
        background-color: ${baseBackground};
      }
      [data-markdown-sid="__SID__"] p {
        margin: ${paragraphMargin || "0 0 0.85em 0"};
      }
      [data-markdown-sid="__SID__"] h1 {
        font-size: ${toPx(heading.h1?.fontSize, "28px")};
        font-weight: ${heading.h1?.fontWeight || 700};
        margin: ${heading.h1?.margin || "1.2em 0 0.4em"};
      }
      [data-markdown-sid="__SID__"] h2 {
        font-size: ${toPx(heading.h2?.fontSize, "24px")};
        font-weight: ${heading.h2?.fontWeight || 700};
        margin: ${heading.h2?.margin || "1.1em 0 0.35em"};
      }
      [data-markdown-sid="__SID__"] h3 {
        font-size: ${toPx(heading.h3?.fontSize, "20px")};
        font-weight: ${heading.h3?.fontWeight || 600};
        margin: ${heading.h3?.margin || "1.0em 0 0.3em"};
      }
      [data-markdown-sid="__SID__"] h4 {
        font-size: ${toPx(heading.h4?.fontSize, "18px")};
        font-weight: ${heading.h4?.fontWeight || 600};
        margin: ${heading.h4?.margin || "0.9em 0 0.3em"};
      }
      [data-markdown-sid="__SID__"] ul,
      [data-markdown-sid="__SID__"] ol {
        padding-left: ${toPx(list.paddingLeft, "24px")};
        margin: ${list.margin || "0 0 0.85em 0"};
      }
      [data-markdown-sid="__SID__"] li {
        margin: ${list.itemMargin || "0.25em 0"};
      }
      [data-markdown-sid="__SID__"] blockquote {
        margin: ${blockquote.margin || "0 0 0.85em 0"};
        padding-left: ${toPx(blockquote.paddingLeft, "12px")};
        border-left: 3px solid ${blockquote.borderColor || "#E0E0E0"};
        color: ${blockquote.color || "#555555"};
      }
      [data-markdown-sid="__SID__"] code {
        font-family: ${code.fontFamily || codeTheme.fontFamily || "Menlo, Monaco, Consolas, monospace"};
        font-size: ${toPx(code.fontSize || codeTheme.fontSize, "13px")};
        background: ${code.backgroundColor || codeTheme.backgroundColor || "#F2F2F2"};
        padding: ${code.padding || "2px 4px"};
        border-radius: ${toPx(code.borderRadius || codeTheme.borderRadius, "4px")};
        color: ${code.color || codeTheme.color || "inherit"};
      }
      [data-markdown-sid="__SID__"] pre {
        background: transparent;
        padding: 0;
        margin: 0;
        border: none;
      }
      [data-markdown-sid="__SID__"] pre code {
        background: transparent;
        padding: 0;
        border-radius: 0;
      }
      [data-markdown-sid="__SID__"] a {
        color: ${link.color || "#0B5FFF"};
        text-decoration: ${link.underline || "none"};
      }
      [data-markdown-sid="__SID__"] a:hover {
        text-decoration: underline;
      }
      [data-markdown-sid="__SID__"] hr {
        border: none;
        border-top: 1px solid ${hr.borderColor || "#E0E0E0"};
        margin: ${hr.margin || "1.2em 0"};
      }
      [data-markdown-sid="__SID__"] table {
        width: 100%;
        border-collapse: collapse;
        margin: ${table.margin || "0 0 0.85em 0"};
      }
      [data-markdown-sid="__SID__"] th,
      [data-markdown-sid="__SID__"] td {
        border: 1px solid ${table.borderColor || "#E0E0E0"};
        padding: ${table.cellPadding || "6px 10px"};
        text-align: left;
      }
      [data-markdown-sid="__SID__"] thead th {
        background: ${table.headerBackground || "#F7F7F7"};
      }
      [data-markdown-sid="__SID__"] img {
        max-width: ${image.maxWidth || "100%"};
        border-radius: ${toPx(image.borderRadius, "6px")};
      }
      ${
        hasBlockGap
          ? `
      [data-markdown-sid="__SID__"] > * {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      [data-markdown-sid="__SID__"] > * + * {
        margin-top: ${toPx(blockGap, "12px")};
      }
      `
          : ""
      }
    `;
  }, [mergedMarkdownTheme, theme]);
  // 用 layoutEffect 在 paint 前 acquire 共享 <style>;cssText 变化(主题/字号切换)时
  // React 先跑上一次的 cleanup(release 旧)再跑本次(acquire 新)。归零的样式表被移除。
  useLayoutEffect(() => {
    const handle = acquireMarkdownStyle(css);
    setStyleSid(handle.sid);
    return () => {
      handle.release();
    };
  }, [css]);
  const mergedOptions = useMemo(
    () => ({
      tables: true,
      ghCodeBlocks: true,
      strikethrough: true,
      tasklists: true,
      simplifiedAutoLink: true,
      ...options,
    }),
    [options],
  );
  const renderPre = useMemo(
    () =>
      function renderPre(props) {
        return (
          <MarkdownCodeBlock
            {...props}
            markdownTheme={mergedMarkdownTheme}
          />
        );
      },
    [mergedMarkdownTheme],
  );
  const mergedComponents = useMemo(
    () => ({
      pre: renderPre,
      think: ThinkBlock,
      ...components,
    }),
    [components, renderPre],
  );

  const hasHeight =
    containerStyle?.height !== undefined ||
    containerStyle?.maxHeight !== undefined;

  return (
    <div
      data-markdown-id={idRef.current}
      data-markdown-sid={styleSid || undefined}
      className={className}
      style={{
        ...(hasHeight ? { display: "flex", flexDirection: "column" } : {}),
        ...containerStyle,
      }}
    >
      <ReactShowdown
        markdown={markdownText}
        options={mergedOptions}
        extensions={extensions}
        components={mergedComponents}
        flavor={flavor}
        sanitizeHtml={sanitize_html}
      />
    </div>
  );
};

export default Markdown;
