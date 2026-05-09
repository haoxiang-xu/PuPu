import { memo, useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import CellSplitSpinner from "../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import SeamlessMarkdown from "./seamless_markdown";
import {
  ASSISTANT_MARKDOWN_FONT_SIZE,
  ASSISTANT_MARKDOWN_LINE_HEIGHT,
} from "./assistant_markdown_metrics";

const AssistantMessageBody = ({
  message,
  isRawTextMode,
  theme,
  hasTraceFrames = false,
}) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  if (message.status === "error") {
    const errorMsg =
      message.meta?.error?.message ||
      (typeof message.content === "string"
        ? message.content.replace(/^\[error\]\s*/i, "")
        : "An error occurred");
    return (
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 8,
          backgroundColor: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${isDark ? "rgba(239,68,68,0.3)" : "rgba(239,68,68,0.25)"}`,
          marginTop: 2,
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          width="15"
          height="15"
          style={{ color: isDark ? "#f87171" : "#dc2626", flexShrink: 0, marginTop: 2 }}
        >
          <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM11 15V17H13V15H11ZM11 7V13H13V7H11Z" />
        </svg>
        <span
          style={{
            color: isDark ? "#f87171" : "#dc2626",
            fontSize: ASSISTANT_MARKDOWN_FONT_SIZE,
            lineHeight: ASSISTANT_MARKDOWN_LINE_HEIGHT,
          }}
        >
          {errorMsg}
        </span>
      </div>
    );
  }

  // When timeline is already visible (has trace frames), skip the spinner —
  // the TraceChain "Thinking…" indicator is enough.
  if (message.status === "streaming" && !message.content) {
    if (hasTraceFrames) return null;
    return (
      <div style={{ padding: "8px 0" }}>
        <CellSplitSpinner
          size={28}
          cells={5}
          speed={0.9}
          spread={1}
          stagger={120}
          spin={true}
          spinSpeed={0.6}
        />
      </div>
    );
  }

  if (isRawTextMode) {
    return (
      <pre
        style={{
          margin: 0,
          whiteSpace: "pre-wrap",
          fontFamily: theme?.font?.paragraphFontFamily || "inherit",
          fontSize: ASSISTANT_MARKDOWN_FONT_SIZE,
          lineHeight: ASSISTANT_MARKDOWN_LINE_HEIGHT,
          color: theme?.color || "#222",
        }}
      >
        {message.content}
      </pre>
    );
  }

  const content = typeof message.content === "string" ? message.content : "";
  const renderStatus =
    typeof message.status === "string" ? message.status : "done";

  return (
    <SeamlessMarkdown
      content={content}
      status={renderStatus}
      fontSize={ASSISTANT_MARKDOWN_FONT_SIZE}
      lineHeight={ASSISTANT_MARKDOWN_LINE_HEIGHT}
      priority={renderStatus === "streaming" ? "high" : "normal"}
    />
  );
};

const areAssistantMessageBodyPropsEqual = (previousProps, nextProps) =>
  previousProps.message === nextProps.message &&
  previousProps.isRawTextMode === nextProps.isRawTextMode &&
  previousProps.theme === nextProps.theme &&
  previousProps.hasTraceFrames === nextProps.hasTraceFrames;

export default memo(AssistantMessageBody, areAssistantMessageBodyPropsEqual);
