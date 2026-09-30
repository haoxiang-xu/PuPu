/* skill_frontmatter — faithful JS port of Unchain's safe-subset YAML
 * frontmatter parser (unchain: src/unchain/skills/frontmatter.py, ticket
 * #327 decision D1).
 *
 * PuPu ticket #291 finding P4: the importer's previous `parseFrontmatter`
 * (in skill_pack_import.js) was a single-line colon splitter that could not
 * represent block scalars, nested mappings/lists, or inline comments — it
 * silently corrupted `description`/`metadata` instead of rejecting or
 * correctly parsing them. This module is a line-for-line port of the
 * authoritative Python parser so the renderer producer and the backend
 * validator agree on exactly the same accepted grammar and rejections.
 *
 * Deliberately bounded and NOT a general YAML parser: unsupported
 * constructs (flow mappings, tags, anchors/aliases, tab indentation) are
 * rejected rather than silently misinterpreted, exactly as upstream.
 *
 * Keep this file in sync with the Python original if it changes; do not
 * "improve" the grammar here without a matching upstream change.
 */

export class SkillFrontmatterError extends Error {
  constructor(message) {
    super(message);
    this.name = "SkillFrontmatterError";
  }
}

// style -> [kind, chomp]. kind is "literal" (|) or "folded" (>); chomp is
// "clip" (default, single trailing newline), "strip" (-, no trailing
// newline), or "keep" (+, preserve all trailing blank lines).
const BLOCK_SCALAR_STYLES = {
  "|": ["literal", "clip"],
  "|-": ["literal", "strip"],
  "|+": ["literal", "keep"],
  ">": ["folded", "clip"],
  ">-": ["folded", "strip"],
  ">+": ["folded", "keep"],
};

// Duplicates among these top-level keys are rejected outright; every other
// duplicate key silently lets the last occurrence win (mirrors D1).
const DUPLICATE_SENSITIVE_KEYS = new Set([
  "name",
  "description",
  "disable-model-invocation",
  "user-invocable",
]);

const TRUE_STRINGS = new Set(["true", "yes", "on", "1"]);
const FALSE_STRINGS = new Set(["false", "no", "off", "0"]);

const KEY_LINE_RE = /^([A-Za-z0-9_-]+):(.*)$/;

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md-style text file into frontmatter fields and a body.
 * @param {string} text
 * @returns {{ fields: Object, body: string }}
 */
export function parseSkillFile(text) {
  let raw = String(text == null ? "" : text);
  if (raw.startsWith("﻿")) raw = raw.slice(1);
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  if (!lines.length || lines[0] !== "---") {
    throw new SkillFrontmatterError(
      "missing YAML frontmatter delimited by ---",
    );
  }

  let closingIndex = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      closingIndex = index;
      break;
    }
  }
  if (closingIndex === -1) {
    throw new SkillFrontmatterError("unterminated YAML frontmatter");
  }

  const fmLines = lines.slice(1, closingIndex);
  const bodyLines = lines.slice(closingIndex + 1);

  rejectTabIndentation(fmLines);
  const [fields] = parseMapping(fmLines, 0, fmLines.length, 0, true);
  const body = stripBlankEdges(bodyLines);
  return { fields, body };
}

/**
 * Coerce a raw frontmatter field value into a bool.
 *
 * `undefined`/`null` or a blank/whitespace-only string returns
 * `defaultValue`. The strings true/yes/on/1 (case-insensitive) coerce to
 * `true` and false/no/off/0 (case-insensitive) coerce to `false`. Anything
 * else — including non-string values such as a parsed list — throws
 * `SkillFrontmatterError`.
 * @param {unknown} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
export function coerceBool(value, defaultValue) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "string") {
    const stripped = value.trim();
    if (stripped === "") return defaultValue;
    const lowered = stripped.toLowerCase();
    if (TRUE_STRINGS.has(lowered)) return true;
    if (FALSE_STRINGS.has(lowered)) return false;
    throw new SkillFrontmatterError(
      `expected a boolean, got ${JSON.stringify(value)}`,
    );
  }
  throw new SkillFrontmatterError(
    `expected a boolean, got ${JSON.stringify(value)}`,
  );
}

// ---------------------------------------------------------------------------
// Indentation / structure helpers
// ---------------------------------------------------------------------------

function leadingWhitespace(line) {
  const match = line.match(/^[ \t]*/);
  return match ? match[0] : "";
}

function rejectTabIndentation(lines) {
  for (const line of lines) {
    const prefix = leadingWhitespace(line);
    if (prefix.includes("\t")) {
      throw new SkillFrontmatterError(
        `tab characters are not allowed for indentation: ${JSON.stringify(line)}`,
      );
    }
  }
}

function indentOf(line) {
  let i = 0;
  while (i < line.length && line[i] === " ") i += 1;
  return i;
}

function stripBlankEdges(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end).join("\n");
}

function isBlank(line) {
  return line.trim() === "";
}

function isComment(line) {
  return line.replace(/^\s+/, "").startsWith("#");
}

/** Return [index, indent] of the next non-blank, non-comment line, or null. */
function peekMeaningful(lines, start, end) {
  let index = start;
  while (index < end) {
    const line = lines[index];
    if (isBlank(line) || isComment(line)) {
      index += 1;
      continue;
    }
    return [index, indentOf(line)];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mapping / list parsing
// ---------------------------------------------------------------------------

function parseMapping(lines, start, end, indent, topLevel) {
  const entries = [];
  const sensitiveSeen = new Set();
  let index = start;
  while (index < end) {
    const line = lines[index];
    if (isBlank(line)) {
      index += 1;
      continue;
    }
    if (isComment(line)) {
      index += 1;
      continue;
    }
    const curIndent = indentOf(line);
    if (curIndent < indent) break;
    if (curIndent > indent) {
      throw new SkillFrontmatterError(
        `invalid frontmatter line: ${JSON.stringify(line.trim())}`,
      );
    }

    const content = line.slice(indent);
    const match = KEY_LINE_RE.exec(content);
    if (!match) {
      throw new SkillFrontmatterError(
        `invalid frontmatter line: ${JSON.stringify(line.trim())}`,
      );
    }
    const key = match[1];
    const rest = match[2] || "";
    const valueToken = rest.trim();
    index += 1;

    let value;
    if (Object.prototype.hasOwnProperty.call(BLOCK_SCALAR_STYLES, valueToken)) {
      const [style, chomp] = BLOCK_SCALAR_STYLES[valueToken];
      const [contentLines, nextIndex] = collectBlockScalar(lines, index, end, indent);
      index = nextIndex;
      value = renderBlockScalar(contentLines, style, chomp);
    } else if (valueToken === "") {
      const peek = peekMeaningful(lines, index, end);
      if (peek !== null && peek[1] > indent) {
        const [nxtIndex, nxtIndent] = peek;
        const nxtContent = lines[nxtIndex].slice(nxtIndent);
        if (nxtContent === "-" || nxtContent.startsWith("- ")) {
          const [listValue, nextIndex] = parseList(lines, nxtIndex, end, nxtIndent);
          value = listValue;
          index = nextIndex;
        } else {
          const [mapValue, nextIndex] = parseMapping(lines, nxtIndex, end, nxtIndent, false);
          value = mapValue;
          index = nextIndex;
        }
      } else {
        value = "";
      }
    } else if (valueToken[0] === "[") {
      value = parseFlowSequence(valueToken);
    } else if (valueToken[0] === "{") {
      throw new SkillFrontmatterError(
        `flow mappings are not supported: ${JSON.stringify(valueToken)}`,
      );
    } else {
      value = parseScalar(valueToken);
    }

    if (topLevel && DUPLICATE_SENSITIVE_KEYS.has(key)) {
      if (sensitiveSeen.has(key)) {
        throw new SkillFrontmatterError(
          `duplicate frontmatter key: ${JSON.stringify(key)}`,
        );
      }
      sensitiveSeen.add(key);
    }
    // Object.fromEntries (below) uses CreateDataPropertyOrThrow semantics,
    // so a key literally spelled "__proto__" lands as an own property
    // instead of hijacking the prototype — safe for untrusted frontmatter.
    entries.push([key, value]);
  }
  return [Object.fromEntries(entries), index];
}

function parseList(lines, start, end, indent) {
  const items = [];
  let index = start;
  while (index < end) {
    const line = lines[index];
    if (isBlank(line)) {
      index += 1;
      continue;
    }
    if (isComment(line)) {
      index += 1;
      continue;
    }
    const curIndent = indentOf(line);
    if (curIndent < indent) break;
    if (curIndent > indent) {
      throw new SkillFrontmatterError(
        `invalid frontmatter line: ${JSON.stringify(line.trim())}`,
      );
    }

    const content = line.slice(indent);
    let itemRaw;
    if (content === "-") {
      itemRaw = "";
    } else if (content.startsWith("- ")) {
      itemRaw = content.slice(2);
    } else {
      throw new SkillFrontmatterError(
        `invalid frontmatter line: ${JSON.stringify(line.trim())}`,
      );
    }
    const itemRawStripped = itemRaw.trim();
    index += 1;

    let value;
    if (itemRawStripped === "") {
      const peek = peekMeaningful(lines, index, end);
      if (peek !== null && peek[1] > indent) {
        const [nxtIndex, nxtIndent] = peek;
        const nxtContent = lines[nxtIndex].slice(nxtIndent);
        if (nxtContent === "-" || nxtContent.startsWith("- ")) {
          const [listValue, nextIndex] = parseList(lines, nxtIndex, end, nxtIndent);
          value = listValue;
          index = nextIndex;
        } else {
          const [mapValue, nextIndex] = parseMapping(lines, nxtIndex, end, nxtIndent, false);
          value = mapValue;
          index = nextIndex;
        }
      } else {
        value = "";
      }
    } else if (itemRawStripped[0] === "[") {
      value = parseFlowSequence(itemRawStripped);
    } else if (itemRawStripped[0] === "{") {
      throw new SkillFrontmatterError(
        `flow mappings are not supported: ${JSON.stringify(itemRawStripped)}`,
      );
    } else {
      value = parseScalar(itemRawStripped);
    }
    items.push(value);
  }
  return [items, index];
}

// ---------------------------------------------------------------------------
// Block scalars
// ---------------------------------------------------------------------------

function collectBlockScalar(lines, start, end, keyIndent) {
  const rawLines = [];
  let index = start;
  while (index < end) {
    const line = lines[index];
    if (isBlank(line)) {
      rawLines.push("");
      index += 1;
      continue;
    }
    const curIndent = indentOf(line);
    if (curIndent <= keyIndent) break;
    rawLines.push(line);
    index += 1;
  }

  let blockIndent = null;
  for (const entry of rawLines) {
    if (entry !== "") {
      blockIndent = indentOf(entry);
      break;
    }
  }
  if (blockIndent === null) return [[], index];

  const contentLines = rawLines.map((entry) =>
    entry === "" ? "" : entry.slice(blockIndent),
  );
  return [contentLines, index];
}

function fold(lines) {
  const parts = [];
  let prevWasContent = false;
  for (const line of lines) {
    if (line === "") {
      parts.push("\n");
      prevWasContent = false;
    } else {
      if (prevWasContent) parts.push(" ");
      parts.push(line);
      prevWasContent = true;
    }
  }
  return parts.join("");
}

function renderBlockScalar(contentLines, style, chomp) {
  if (contentLines.length === 0) return "";

  const trimmed = contentLines.slice();
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === "") trimmed.pop();

  let baseTrimmed;
  let baseFull;
  if (style === "literal") {
    baseTrimmed = trimmed.join("\n");
    baseFull = contentLines.join("\n");
  } else {
    baseTrimmed = fold(trimmed);
    baseFull = fold(contentLines);
  }

  if (chomp === "strip") return baseTrimmed;
  if (chomp === "keep") return `${baseFull}\n`;
  return `${baseTrimmed}\n`;
}

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

function stripPlainComment(token) {
  for (let i = 1; i < token.length; i += 1) {
    if (token[i] === "#" && (token[i - 1] === " " || token[i - 1] === "\t")) {
      return token.slice(0, i - 1).replace(/\s+$/, "");
    }
  }
  return token;
}

function parseScalar(token) {
  if (token.startsWith("!")) {
    throw new SkillFrontmatterError(`unsupported YAML tag: ${JSON.stringify(token)}`);
  }
  if (token.startsWith("&")) {
    throw new SkillFrontmatterError(`unsupported YAML anchor: ${JSON.stringify(token)}`);
  }
  if (token.startsWith("*")) {
    throw new SkillFrontmatterError(`unsupported YAML alias: ${JSON.stringify(token)}`);
  }
  if (token.startsWith("'")) return parseSingleQuoted(token);
  if (token.startsWith('"')) return parseDoubleQuoted(token);
  return stripPlainComment(token).trim();
}

function parseSingleQuoted(token) {
  const result = [];
  let index = 1;
  const length = token.length;
  let closed = false;
  while (index < length) {
    const char = token[index];
    if (char === "'") {
      if (index + 1 < length && token[index + 1] === "'") {
        result.push("'");
        index += 2;
        continue;
      }
      closed = true;
      index += 1;
      break;
    }
    result.push(char);
    index += 1;
  }
  if (!closed) {
    throw new SkillFrontmatterError(
      `unterminated single-quoted scalar: ${JSON.stringify(token)}`,
    );
  }
  return result.join("");
}

function parseDoubleQuoted(token) {
  const result = [];
  let index = 1;
  const length = token.length;
  let closed = false;
  while (index < length) {
    const char = token[index];
    if (char === "\\") {
      if (index + 1 >= length) {
        throw new SkillFrontmatterError(
          `invalid escape sequence in double-quoted scalar: ${JSON.stringify(token)}`,
        );
      }
      const nextChar = token[index + 1];
      if (nextChar === '"') result.push('"');
      else if (nextChar === "\\") result.push("\\");
      else if (nextChar === "n") result.push("\n");
      else if (nextChar === "t") result.push("\t");
      else {
        throw new SkillFrontmatterError(`unsupported escape sequence: \\${nextChar}`);
      }
      index += 2;
      continue;
    }
    if (char === '"') {
      closed = true;
      index += 1;
      break;
    }
    result.push(char);
    index += 1;
  }
  if (!closed) {
    throw new SkillFrontmatterError(
      `unterminated double-quoted scalar: ${JSON.stringify(token)}`,
    );
  }
  return result.join("");
}

function splitFlowItems(inner) {
  const items = [];
  let buf = [];
  let inSquote = false;
  let inDquote = false;
  let index = 0;
  const length = inner.length;
  while (index < length) {
    const char = inner[index];
    if (inDquote) {
      buf.push(char);
      if (char === "\\" && index + 1 < length) {
        buf.push(inner[index + 1]);
        index += 2;
        continue;
      }
      if (char === '"') inDquote = false;
      index += 1;
      continue;
    }
    if (inSquote) {
      buf.push(char);
      if (char === "'") {
        if (index + 1 < length && inner[index + 1] === "'") {
          buf.push("'");
          index += 2;
          continue;
        }
        inSquote = false;
      }
      index += 1;
      continue;
    }
    if (char === '"') {
      inDquote = true;
      buf.push(char);
      index += 1;
      continue;
    }
    if (char === "'") {
      inSquote = true;
      buf.push(char);
      index += 1;
      continue;
    }
    if (char === ",") {
      items.push(buf.join(""));
      buf = [];
      index += 1;
      continue;
    }
    buf.push(char);
    index += 1;
  }
  if (buf.length > 0 || items.length > 0) items.push(buf.join(""));
  return items;
}

function parseFlowSequence(token) {
  if (!token.endsWith("]")) {
    throw new SkillFrontmatterError(`unterminated flow sequence: ${JSON.stringify(token)}`);
  }
  const inner = token.slice(1, -1);
  const items = splitFlowItems(inner);
  const result = [];
  for (const rawItem of items) {
    const item = rawItem.trim();
    if (item === "") continue;
    if (item[0] === "[") {
      throw new SkillFrontmatterError(
        `nested flow sequences are not supported: ${JSON.stringify(item)}`,
      );
    }
    if (item[0] === "{") {
      throw new SkillFrontmatterError(`flow mappings are not supported: ${JSON.stringify(item)}`);
    }
    result.push(parseScalar(item));
  }
  return result;
}
