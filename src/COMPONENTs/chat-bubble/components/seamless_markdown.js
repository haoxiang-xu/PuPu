import {
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import {
  normalizeStreamingChunks,
  splitTextIntoStreamingChunks,
  appendTextToStreamingChunks,
} from "../../../SERVICEs/streaming_message_chunks";
import { createStreamingMarkdownAccumulator } from "./streaming_markdown_blocks";

const HEAVY_CHAR_THRESHOLD = 8 * 1024;
const HEAVY_LINE_THRESHOLD = 120;
const LARGE_CODE_BLOCK_PATTERN = /```[\s\S]{1200,}?```/;
const VIEWPORT_PRELOAD_MARGIN = "320px 0px";
const HIGH_PRIORITY_IDLE_TIMEOUT = 120;
const NORMAL_PRIORITY_IDLE_TIMEOUT = 240;
const HIGH_PRIORITY_TIMEOUT_DELAY = 32;
const NORMAL_PRIORITY_TIMEOUT_DELAY = 72;
const HTML_DOCUMENT_LINE_PATTERN =
  /^\s*(?:<!doctype\s+html\b|<(?:html|head|body|meta|title|link|style|script)\b)/i;
const MARKDOWN_FENCE_LINE_PATTERN = /^\s{0,3}([`~]{3,})(.*)$/;

const isHeavyMarkdownContent = (content) => {
  if (typeof content !== "string" || !content) {
    return false;
  }
  if (content.length > HEAVY_CHAR_THRESHOLD) {
    return true;
  }
  let lineCount = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      lineCount += 1;
      if (lineCount > HEAVY_LINE_THRESHOLD) {
        return true;
      }
    }
  }
  return LARGE_CODE_BLOCK_PATTERN.test(content);
};

const getNextFenceState = (line, activeFence) => {
  if (typeof line !== "string") {
    return activeFence;
  }

  const match = line.match(MARKDOWN_FENCE_LINE_PATTERN);
  if (!match) {
    return activeFence;
  }

  const marker = match[1];
  const nextFence = {
    character: marker.charAt(0),
    size: marker.length,
  };

  if (!activeFence) {
    return nextFence;
  }

  if (
    nextFence.character === activeFence.character &&
    nextFence.size >= activeFence.size
  ) {
    return null;
  }

  return activeFence;
};

const buildFenceMarker = (content) => {
  const backtickMatches = content.match(/^\s{0,3}`{3,}/gm) || [];
  const maxBacktickSize = backtickMatches.reduce((maxSize, match) => {
    const fenceSize = match.trimStart().length;
    return fenceSize > maxSize ? fenceSize : maxSize;
  }, 0);

  if (maxBacktickSize === 0) {
    return "```";
  }

  return "`".repeat(maxBacktickSize + 1);
};

const normalizeHtmlDocumentMarkdown = (content) => {
  if (typeof content !== "string" || !content) {
    return "";
  }

  const lines = content.split("\n");
  let activeFence = null;
  let htmlLineIndex = -1;
  let htmlLineFence = null;

  for (let index = 0; index < lines.length; index += 1) {
    if (HTML_DOCUMENT_LINE_PATTERN.test(lines[index])) {
      htmlLineIndex = index;
      htmlLineFence = activeFence;
      break;
    }

    activeFence = getNextFenceState(lines[index], activeFence);
  }

  if (htmlLineIndex < 0) {
    return content;
  }

  if (htmlLineFence) {
    let trailingFence = htmlLineFence;

    for (let index = htmlLineIndex; index < lines.length; index += 1) {
      trailingFence = getNextFenceState(lines[index], trailingFence);
      if (!trailingFence) {
        return content;
      }
    }

    const closingFence = htmlLineFence.character.repeat(htmlLineFence.size);
    return `${content}${content.endsWith("\n") ? "" : "\n"}${closingFence}`;
  }

  const leadingContent = lines.slice(0, htmlLineIndex).join("\n").trimEnd();
  const htmlLikeContent = lines.slice(htmlLineIndex).join("\n").trim();

  if (!htmlLikeContent) {
    return content;
  }

  const fenceMarker = buildFenceMarker(htmlLikeContent);
  return `${leadingContent ? `${leadingContent}\n\n` : ""}${fenceMarker}html\n${htmlLikeContent}\n${fenceMarker}`;
};

const scheduleIdleUpgrade = (callback, priority = "normal") => {
  const prefersHighPriority = priority === "high";
  if (
    typeof window !== "undefined" &&
    typeof window.requestIdleCallback === "function"
  ) {
    const timeout = prefersHighPriority
      ? HIGH_PRIORITY_IDLE_TIMEOUT
      : NORMAL_PRIORITY_IDLE_TIMEOUT;
    const id = window.requestIdleCallback(() => {
      callback();
    }, { timeout });
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(id);
      }
    };
  }

  const delay = prefersHighPriority
    ? HIGH_PRIORITY_TIMEOUT_DELAY
    : NORMAL_PRIORITY_TIMEOUT_DELAY;
  const timerId = setTimeout(() => {
    callback();
  }, delay);
  return () => clearTimeout(timerId);
};

const useStreamingTextChunks = (text, externalChunks) => {
  const chunksRef = useRef([]);
  const lengthRef = useRef(0);
  const textRef = useRef("");
  const normalizedText = typeof text === "string" ? text : "";

  return useMemo(() => {
    const normalizedExternalChunks = normalizeStreamingChunks(externalChunks);
    if (normalizedExternalChunks.length > 0) {
      chunksRef.current = [];
      lengthRef.current = 0;
      textRef.current = "";
      return normalizedExternalChunks;
    }

    if (!normalizedText) {
      chunksRef.current = [];
      lengthRef.current = 0;
      textRef.current = "";
      return chunksRef.current;
    }

    if (
      normalizedText.length < lengthRef.current ||
      (normalizedText.length === lengthRef.current &&
        normalizedText !== textRef.current)
    ) {
      chunksRef.current = splitTextIntoStreamingChunks(normalizedText);
      lengthRef.current = normalizedText.length;
      textRef.current = normalizedText;
      return chunksRef.current;
    }

    if (normalizedText.length === lengthRef.current) {
      return chunksRef.current;
    }

    const delta = normalizedText.slice(lengthRef.current);
    chunksRef.current = appendTextToStreamingChunks(chunksRef.current, delta);
    lengthRef.current = normalizedText.length;
    textRef.current = normalizedText;
    return chunksRef.current;
  }, [externalChunks, normalizedText]);
};

const mergeStreamingChunksText = (previousChunks, previousText, nextChunks) => {
  const chunks = normalizeStreamingChunks(nextChunks);
  if (chunks.length === 0) {
    return "";
  }

  let prefixLength = 0;
  let prefixTextLength = 0;
  while (
    prefixLength < previousChunks.length &&
    prefixLength < chunks.length &&
    previousChunks[prefixLength] === chunks[prefixLength]
  ) {
    prefixTextLength += chunks[prefixLength].length;
    prefixLength += 1;
  }

  return `${previousText.slice(0, prefixTextLength)}${chunks
    .slice(prefixLength)
    .join("")}`;
};

const useStreamingMarkdownBlocks = (isStreaming, chunks) => {
  const accumulatorRef = useRef(createStreamingMarkdownAccumulator());
  const textRef = useRef("");
  const chunksRef = useRef([]);

  return useMemo(() => {
    if (!isStreaming) {
      accumulatorRef.current.replace("");
      textRef.current = "";
      chunksRef.current = [];
      return accumulatorRef.current.getSnapshot();
    }

    const normalizedChunks = normalizeStreamingChunks(chunks);
    const nextText = mergeStreamingChunksText(
      chunksRef.current,
      textRef.current,
      normalizedChunks,
    );
    chunksRef.current = normalizedChunks;

    if (nextText.startsWith(textRef.current)) {
      accumulatorRef.current.append(nextText.slice(textRef.current.length));
    } else {
      accumulatorRef.current.replace(nextText);
    }
    textRef.current = nextText;

    return accumulatorRef.current.getSnapshot();
  }, [chunks, isStreaming]);
};

const StreamingPlainTextChunk = memo(({ text }) => (
  <span data-streaming-plain-text-chunk="true">{text}</span>
));

const StreamingPlainText = ({
  text,
  chunks: externalChunks,
  markdownStyle,
  theme,
  liveKind = "text",
}) => {
  const chunks = useStreamingTextChunks(text, externalChunks);
  const fontSize = markdownStyle?.fontSize ?? theme?.markdown?.fontSize ?? 14;
  const lineHeight =
    markdownStyle?.lineHeight ?? theme?.markdown?.lineHeight ?? 1.6;
  const color = markdownStyle?.color ?? theme?.markdown?.color ?? theme?.color;

  const Element = liveKind === "code" ? "pre" : "div";

  return (
    <Element
      data-streaming-plain-text="true"
      data-streaming-live-kind={liveKind}
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily:
          liveKind === "code"
            ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
            : theme?.font?.paragraphFontFamily || "inherit",
        fontSize,
        lineHeight,
        color: color ?? "inherit",
        overflowX: "auto",
      }}
    >
      {chunks.map((chunk, index) => (
        <StreamingPlainTextChunk key={index} text={chunk} />
      ))}
    </Element>
  );
};

const StreamingMarkdownBlock = memo(
  ({ block, className, markdownStyle }) => {
    const normalizedMarkdown = useMemo(
      () => normalizeHtmlDocumentMarkdown(block.markdown),
      [block.markdown],
    );
    return (
      <Markdown
        className={className}
        style={markdownStyle}
        markdown={normalizedMarkdown}
      />
    );
  },
  (previousProps, nextProps) =>
    previousProps.block === nextProps.block &&
    previousProps.className === nextProps.className &&
    previousProps.markdownStyle === nextProps.markdownStyle,
);

const SeamlessMarkdown = ({
  content = "",
  streamingChunks,
  status = "done",
  fontSize = 14,
  lineHeight = 1.6,
  priority = "normal",
  className,
  style,
}) => {
  const { theme } = useContext(ConfigContext);
  const containerRef = useRef(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [isUpgraded, setIsUpgraded] = useState(false);
  const isStreaming = status === "streaming";
  const markdownStyle = useMemo(
    () => ({
      ...(style && typeof style === "object" ? style : {}),
      fontSize,
      lineHeight,
    }),
    [fontSize, lineHeight, style],
  );
  const streamingTextChunks = useStreamingTextChunks(content, streamingChunks);
  const streamingBlockSnapshot = useStreamingMarkdownBlocks(
    isStreaming,
    streamingTextChunks,
  );

  const normalizedFull = useMemo(
    () => (isStreaming ? "" : normalizeHtmlDocumentMarkdown(content)),
    [content, isStreaming],
  );

  const isHeavyContent = useMemo(
    () => !isStreaming && isHeavyMarkdownContent(normalizedFull),
    [isStreaming, normalizedFull],
  );
  const fullMarkdownElement = useMemo(
    () => (
      <Markdown
        className={className}
        style={markdownStyle}
        markdown={normalizedFull}
      />
    ),
    [className, markdownStyle, normalizedFull],
  );

  useEffect(() => {
    if (!isHeavyContent || isUpgraded) {
      setIsNearViewport(true);
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    if (typeof IntersectionObserver !== "function") {
      setIsNearViewport(true);
      return;
    }

    let unmounted = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible =
          entries.some((entry) => entry.isIntersecting) ||
          entries.some((entry) => entry.intersectionRatio > 0);
        if (isVisible && !unmounted) {
          setIsNearViewport(true);
        }
      },
      {
        root: null,
        rootMargin: VIEWPORT_PRELOAD_MARGIN,
        threshold: 0.01,
      },
    );

    observer.observe(node);
    return () => {
      unmounted = true;
      observer.disconnect();
    };
  }, [isHeavyContent, isUpgraded]);

  useEffect(() => {
    if (!isHeavyContent || isUpgraded || isStreaming || !isNearViewport) {
      return;
    }

    let cancelled = false;
    const cancelUpgrade = scheduleIdleUpgrade(() => {
      if (cancelled) {
        return;
      }
      setIsUpgraded(true);
    }, priority);

    return () => {
      cancelled = true;
      cancelUpgrade();
    };
  }, [isHeavyContent, isNearViewport, isStreaming, isUpgraded, priority]);

  if (isStreaming) {
    return (
      <div
        data-streaming-markdown-root="true"
        className={className}
        style={markdownStyle}
      >
        {streamingBlockSnapshot.stableBlocks.map((block) => (
          <StreamingMarkdownBlock
            key={block.id}
            block={block}
            className={className}
            markdownStyle={markdownStyle}
          />
        ))}
        {streamingBlockSnapshot.liveText ? (
          <StreamingPlainText
            text={streamingBlockSnapshot.liveText}
            markdownStyle={markdownStyle}
            theme={theme}
            liveKind={streamingBlockSnapshot.liveKind}
          />
        ) : null}
      </div>
    );
  }

  if (!isHeavyContent || isUpgraded) {
    return fullMarkdownElement;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...markdownStyle,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: theme?.font?.paragraphFontFamily || "inherit",
        margin: 0,
      }}
    >
      {content}
    </div>
  );
};

export default memo(SeamlessMarkdown);
