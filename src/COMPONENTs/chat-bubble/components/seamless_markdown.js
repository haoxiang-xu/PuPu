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

  const isHeavyContent = useMemo(
    () => isHeavyMarkdownContent(content),
    [content],
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
    return <Markdown className={className} style={markdownStyle} markdown={content} />;
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...markdownStyle,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: theme?.font?.fontFamily || "inherit",
        margin: 0,
      }}
    >
      {content}
    </div>
  );
};

export default memo(SeamlessMarkdown);
