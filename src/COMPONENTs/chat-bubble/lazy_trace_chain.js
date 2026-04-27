import { memo, useEffect, useState } from "react";
import TraceChain from "./trace_chain";

const TracePlaceholder = () => (
  <div
    data-testid="lazy-trace-placeholder"
    style={{
      minHeight: 24,
      padding: "4px 0",
      fontSize: 12,
      opacity: 0.35,
      userSelect: "none",
    }}
  />
);

const LazyTraceChain = (props) => {
  const isStreaming = props?.status === "streaming";
  const [mounted, setMounted] = useState(isStreaming);

  useEffect(() => {
    if (mounted) {
      return undefined;
    }
    if (typeof window === "undefined") {
      setMounted(true);
      return undefined;
    }

    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setMounted(true), {
        timeout: 200,
      });
      return () => {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(id);
        }
      };
    }

    const timerId = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timerId);
  }, [mounted]);

  useEffect(() => {
    if (isStreaming && !mounted) {
      setMounted(true);
    }
  }, [isStreaming, mounted]);

  if (!mounted) {
    return <TracePlaceholder />;
  }

  return <TraceChain {...props} />;
};

export default memo(LazyTraceChain);
