import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import CellSplitSpinner from "../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";

const AssistantMessageBody = ({ message, isRawTextMode, theme }) => {
  if (message.status === "streaming" && !message.content) {
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
          fontSize: 14,
          lineHeight: 1.6,
          color: theme?.color || "#222",
        }}
      >
        {message.content}
      </pre>
    );
  }

  return (
    <Markdown
      markdown={message.content}
      options={{
        fontSize: 14,
        lineHeight: 1.6,
      }}
    />
  );
};

export default AssistantMessageBody;
