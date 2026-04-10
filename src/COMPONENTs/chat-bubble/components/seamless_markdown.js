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

const SeamlessMarkdown = ({
  content = "",
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
  const normalizedContent = useMemo(
    () => normalizeHtmlDocumentMarkdown(content),
    [content],
  );

  const isHeavyContent = useMemo(
    () => isHeavyMarkdownContent(normalizedContent),
    [normalizedContent],
  );
  const isStreaming = status === "streaming";
  const markdownStyle = useMemo(
    () => ({
      ...(style && typeof style === "object" ? style : {}),
      fontSize,
      lineHeight,
    }),
    [fontSize, lineHeight, style],
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

  if (!isHeavyContent || isUpgraded) {
    return (
      <Markdown
        className={className}
        style={markdownStyle}
        markdown={normalizedContent}
      />
    );
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
