const FENCE_OPEN_RE = /^(\s*)(`{3,}|~{3,})/;

const isBlankLine = (line) => line.trim() === "";
const hasLineEnd = (line) => line.endsWith("\n");
const isHeadingLine = (line) => /^#{1,6}\s+\S/.test(line.trimEnd());
const isListLine = (line) =>
  /^(\s*)([-+*]|\d+[.)])\s+\S/.test(line.trimEnd());
const isQuoteLine = (line) => /^\s*>\s?/.test(line.trimEnd());

const splitLines = (text) => {
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lines.push(text.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (start < text.length) {
    lines.push(text.slice(start));
  }
  return lines;
};

const makeBlock = ({ text, start, end, baseOffset }) => ({
  id: `${baseOffset + start}:${baseOffset + end}`,
  markdown: text.slice(start, end),
});

export const splitStreamingMarkdown = (text = "", { baseOffset = 0 } = {}) => {
  const source = typeof text === "string" ? text : "";
  const lines = splitLines(source);
  const stableBlocks = [];
  let stableStart = 0;
  let stableEnd = 0;
  let offset = 0;
  let mode = null;
  let fenceMarker = "";

  const promoteThrough = (end) => {
    if (end <= stableStart) {
      return;
    }
    stableBlocks.push(
      makeBlock({ text: source, start: stableStart, end, baseOffset }),
    );
    stableStart = end;
    stableEnd = end;
  };

  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const lineHasEnd = hasLineEnd(line);
    const trimmedEnd = line.trimEnd();

    if (mode === "fence") {
      const closeRe = new RegExp(
        `^\\s*${fenceMarker[0]}{${fenceMarker.length},}\\s*$`,
      );
      if (lineHasEnd && closeRe.test(trimmedEnd)) {
        promoteThrough(lineEnd);
        mode = null;
        fenceMarker = "";
      }
      offset = lineEnd;
      continue;
    }

    if (mode === "paragraph" || mode === "list" || mode === "quote") {
      if (lineHasEnd && isBlankLine(line)) {
        promoteThrough(lineEnd);
        mode = null;
      }
      offset = lineEnd;
      continue;
    }

    if (isBlankLine(line)) {
      if (lineHasEnd) {
        promoteThrough(lineEnd);
      }
      offset = lineEnd;
      continue;
    }

    const fenceMatch = trimmedEnd.match(FENCE_OPEN_RE);
    if (fenceMatch) {
      mode = "fence";
      fenceMarker = fenceMatch[2];
      offset = lineEnd;
      continue;
    }

    if (isHeadingLine(line)) {
      if (lineHasEnd) {
        promoteThrough(lineEnd);
      }
      offset = lineEnd;
      continue;
    }

    if (isListLine(line)) {
      mode = "list";
      offset = lineEnd;
      continue;
    }

    if (isQuoteLine(line)) {
      mode = "quote";
      offset = lineEnd;
      continue;
    }

    mode = "paragraph";
    offset = lineEnd;

    if (lineStart < stableEnd) {
      stableStart = stableEnd;
    }
  }

  const liveText = source.slice(stableEnd);
  return {
    stableBlocks,
    liveText,
    liveKind: mode === "fence" ? "code" : "text",
    textLength: source.length,
  };
};

export const createStreamingMarkdownAccumulator = () => {
  let text = "";
  let stableBlocks = [];
  let stableLength = 0;
  let liveText = "";
  let liveKind = "text";

  const recomputeLiveSegment = () => {
    const segment = text.slice(stableLength);
    const snapshot = splitStreamingMarkdown(segment, {
      baseOffset: stableLength,
    });
    if (snapshot.stableBlocks.length > 0) {
      stableBlocks = [...stableBlocks, ...snapshot.stableBlocks];
      stableLength += snapshot.stableBlocks.reduce(
        (sum, block) => sum + block.markdown.length,
        0,
      );
    }
    liveText = snapshot.liveText;
    liveKind = snapshot.liveKind;
  };

  const replace = (nextText = "") => {
    text = typeof nextText === "string" ? nextText : "";
    const snapshot = splitStreamingMarkdown(text);
    stableBlocks = snapshot.stableBlocks;
    stableLength = stableBlocks.reduce(
      (sum, block) => sum + block.markdown.length,
      0,
    );
    liveText = snapshot.liveText;
    liveKind = snapshot.liveKind;
  };

  replace("");

  return {
    append(delta = "") {
      if (typeof delta !== "string" || !delta) {
        return;
      }
      text += delta;
      recomputeLiveSegment();
    },
    replace,
    getSnapshot() {
      return {
        stableBlocks,
        liveText,
        liveKind,
        textLength: text.length,
      };
    },
  };
};
