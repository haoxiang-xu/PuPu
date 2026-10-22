import { createElement } from "react";
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";

// Chat, tool output and plugin READMEs share this boundary. Raw HTML is useful
// for passive formatting and <think>, but must never create active documents,
// CSS, event handlers or arbitrary component props in the application origin.
const MARKDOWN_TAGS = [
  "a", "abbr", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
  "dd", "del", "details", "div", "dl", "dt", "em", "h1", "h2", "h3", "h4",
  "h5", "h6", "hr", "i", "img", "input", "kbd", "li", "ol", "p", "pre",
  "s", "samp", "small", "span", "strong", "sub", "summary", "sup", "table",
  "tbody", "td", "th", "thead", "think", "tr", "ul",
];
const MARKDOWN_ATTRIBUTES = [
  "alt", "checked", "class", "colspan", "disabled", "height", "href", "rel",
  "reversed", "rowspan", "src", "start", "target", "title", "type", "width",
];
const VOID_TAGS = new Set(["br", "col", "hr", "img", "input"]);
const TABLE_CONTAINERS = new Set(["table", "thead", "tbody", "tr", "colgroup"]);

export const createMarkdownParser = (options = {}) => {
  const parser = new MarkdownIt({
    html: true,
    linkify: options.simplifiedAutoLink !== false,
    breaks: options.simpleLineBreaks === true,
  });
  if (options.tables === false) parser.disable("table");
  if (options.ghCodeBlocks === false) parser.disable("fence");
  if (options.strikethrough === false) parser.disable("strikethrough");
  if (options.tasklists !== false) parser.use(taskLists);
  return parser;
};

const safeUrl = (value, image) => {
  try {
    if (!image && value.trim().startsWith("#")) return true;
    // Resolve exactly as the consumer will: a relative image in a packaged
    // file: renderer must not bypass the local-file restriction. Fragment
    // navigation is harmless and remains available in either renderer mode.
    const protocol = new URL(value, window.location.href).protocol;
    return (
      protocol === "http:" || protocol === "https:" ||
      (!image && (protocol === "mailto:" || protocol === "tel:"))
    );
  } catch {
    return false;
  }
};

const elementProps = (node) => {
  const tag = node.localName;
  const props = {};
  if (node.hasAttribute("class")) props.className = node.getAttribute("class");
  if (node.hasAttribute("title")) props.title = node.getAttribute("title");
  if (tag === "a") {
    const href = node.getAttribute("href");
    if (href !== null && safeUrl(href, false)) props.href = href;
    const target = node.getAttribute("target");
    if (target === "_blank" || target === "_self") props.target = target;
    if (target === "_blank") props.rel = "noopener noreferrer";
  }
  if (tag === "img") {
    const src = node.getAttribute("src");
    if (src !== null && safeUrl(src, true)) props.src = src;
    props.alt = node.getAttribute("alt") || "";
    for (const attr of ["width", "height"]) {
      if (node.hasAttribute(attr)) props[attr] = node.getAttribute(attr);
    }
  }
  if (tag === "td" || tag === "th") {
    if (node.hasAttribute("colspan")) props.colSpan = node.getAttribute("colspan");
    if (node.hasAttribute("rowspan")) props.rowSpan = node.getAttribute("rowspan");
  }
  if (tag === "ol") {
    if (node.hasAttribute("start")) props.start = node.getAttribute("start");
    if (node.hasAttribute("reversed")) props.reversed = true;
  }
  if (tag === "input") {
    props.type = "checkbox";
    props.checked = node.hasAttribute("checked");
    props.disabled = true;
    props.readOnly = true;
  }
  return props;
};

export const renderSafeMarkdown = (parser, markdown, components, transformHtml) => {
  let html = parser.render(markdown);
  // Keep the optional legacy transform, then enforce the same final policy.
  // A caller-provided sanitizer must never be able to disable sanitization.
  if (typeof transformHtml === "function") html = transformHtml(html);
  if (typeof html !== "string") return null;
  if (typeof DOMPurify.sanitize !== "function") return markdown;
  const fragment = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: MARKDOWN_TAGS,
    ALLOWED_ATTR: MARKDOWN_ATTRIBUTES,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
  const mapNode = (node, index) => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return null;
    const tag = node.localName;
    // The only form control supported by Markdown is a passive task checkbox.
    if (tag === "input" && node.getAttribute("type")?.toLowerCase() !== "checkbox") {
      return null;
    }
    const props = { ...elementProps(node), key: index };
    // <think> is inline HTML to the parser but renders a block component.
    // Avoid placing its block UI inside the parser's paragraph wrapper.
    const nativeTag = tag === "p" && node.querySelector("think") ? "div" : tag;
    const component = Object.prototype.hasOwnProperty.call(components, tag)
      ? components[tag]
      : nativeTag;
    if (VOID_TAGS.has(tag)) return createElement(component, props);
    const children = [...node.childNodes]
      .filter((child) => !(
        TABLE_CONTAINERS.has(tag) && child.nodeType === 3 && !child.textContent.trim()
      ))
      .map(mapNode);
    return createElement(component, props, children);
  };
  // Consume the sanitized DOM directly. No HTML reparse or attribute spreading
  // from the original source can undo the sanitizer's parser decisions.
  return [...fragment.childNodes].map(mapNode);
};
