import { memo } from "react";
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
          fontFamily: theme?.font?.fontFamily || "inherit",
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
