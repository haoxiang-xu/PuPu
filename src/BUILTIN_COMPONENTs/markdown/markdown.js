import { useContext, useMemo, useRef } from "react";
import ReactShowdown from "react-showdown";

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import MarkdownCodeBlock from "./code";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

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
  components = {},
  flavor,
  sanitize_html = false,
  className,
  style,
}) => {
  const { theme } = useContext(ConfigContext);
  const idRef = useRef(
    `mini-ui-markdown-${Math.random().toString(36).slice(2, 10)}`,
  );
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
    const id = idRef.current;
    const markdownTheme = mergedMarkdownTheme;
    const baseFontFamily =
      markdownTheme.fontFamily || theme?.font?.fontFamily || "Jost";
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
      [data-markdown-id="${id}"] {
        font-family: ${baseFontFamily};
        font-size: ${baseFontSize};
        line-height: ${baseLineHeight};
        color: ${baseColor};
        background-color: ${baseBackground};
      }
      [data-markdown-id="${id}"] p {
        margin: ${paragraphMargin || "0 0 0.85em 0"};
      }
      [data-markdown-id="${id}"] h1 {
        font-size: ${toPx(heading.h1?.fontSize, "28px")};
        font-weight: ${heading.h1?.fontWeight || 700};
        margin: ${heading.h1?.margin || "1.2em 0 0.4em"};
      }
      [data-markdown-id="${id}"] h2 {
        font-size: ${toPx(heading.h2?.fontSize, "24px")};
        font-weight: ${heading.h2?.fontWeight || 700};
        margin: ${heading.h2?.margin || "1.1em 0 0.35em"};
      }
      [data-markdown-id="${id}"] h3 {
        font-size: ${toPx(heading.h3?.fontSize, "20px")};
        font-weight: ${heading.h3?.fontWeight || 600};
        margin: ${heading.h3?.margin || "1.0em 0 0.3em"};
      }
      [data-markdown-id="${id}"] h4 {
        font-size: ${toPx(heading.h4?.fontSize, "18px")};
        font-weight: ${heading.h4?.fontWeight || 600};
        margin: ${heading.h4?.margin || "0.9em 0 0.3em"};
      }
      [data-markdown-id="${id}"] ul,
      [data-markdown-id="${id}"] ol {
        padding-left: ${toPx(list.paddingLeft, "24px")};
        margin: ${list.margin || "0 0 0.85em 0"};
      }
      [data-markdown-id="${id}"] li {
        margin: ${list.itemMargin || "0.25em 0"};
      }
      [data-markdown-id="${id}"] blockquote {
        margin: ${blockquote.margin || "0 0 0.85em 0"};
        padding-left: ${toPx(blockquote.paddingLeft, "12px")};
        border-left: 3px solid ${blockquote.borderColor || "#E0E0E0"};
        color: ${blockquote.color || "#555555"};
      }
      [data-markdown-id="${id}"] code {
        font-family: ${code.fontFamily || codeTheme.fontFamily || "Menlo, Monaco, Consolas, monospace"};
        font-size: ${toPx(code.fontSize || codeTheme.fontSize, "13px")};
        background: ${code.backgroundColor || codeTheme.backgroundColor || "#F2F2F2"};
        padding: ${code.padding || "2px 4px"};
        border-radius: ${toPx(code.borderRadius || codeTheme.borderRadius, "4px")};
        color: ${code.color || codeTheme.color || "inherit"};
      }
      [data-markdown-id="${id}"] pre {
        background: transparent;
        padding: 0;
        margin: 0;
        border: none;
      }
      [data-markdown-id="${id}"] pre code {
        background: transparent;
        padding: 0;
        border-radius: 0;
      }
      [data-markdown-id="${id}"] a {
        color: ${link.color || "#0B5FFF"};
        text-decoration: ${link.underline || "none"};
      }
      [data-markdown-id="${id}"] a:hover {
        text-decoration: underline;
      }
      [data-markdown-id="${id}"] hr {
        border: none;
        border-top: 1px solid ${hr.borderColor || "#E0E0E0"};
        margin: ${hr.margin || "1.2em 0"};
      }
      [data-markdown-id="${id}"] table {
        width: 100%;
        border-collapse: collapse;
        margin: ${table.margin || "0 0 0.85em 0"};
      }
      [data-markdown-id="${id}"] th,
      [data-markdown-id="${id}"] td {
        border: 1px solid ${table.borderColor || "#E0E0E0"};
        padding: ${table.cellPadding || "6px 10px"};
        text-align: left;
      }
      [data-markdown-id="${id}"] thead th {
        background: ${table.headerBackground || "#F7F7F7"};
      }
      [data-markdown-id="${id}"] img {
        max-width: ${image.maxWidth || "100%"};
        border-radius: ${toPx(image.borderRadius, "6px")};
      }
      ${
        hasBlockGap
          ? `
      [data-markdown-id="${id}"] > * {
        margin-top: 0 !important;
        margin-bottom: 0 !important;
      }
      [data-markdown-id="${id}"] > * + * {
        margin-top: ${toPx(blockGap, "12px")};
      }
      `
          : ""
      }
    `;
  }, [mergedMarkdownTheme, theme]);
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
  const mergedComponents = useMemo(
    () => ({
      pre: (props) => (
        <MarkdownCodeBlock {...props} markdownTheme={mergedMarkdownTheme} />
      ),
      ...components,
    }),
    [components, mergedMarkdownTheme],
  );

  const hasHeight =
    containerStyle?.height !== undefined ||
    containerStyle?.maxHeight !== undefined;

  return (
    <div
      data-markdown-id={idRef.current}
      className={className}
      style={{
        ...(hasHeight ? { display: "flex", flexDirection: "column" } : {}),
        ...containerStyle,
      }}
    >
      <style>{css}</style>
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
