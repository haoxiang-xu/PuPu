import { useState, useContext, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatMessages from "../../COMPONENTs/chat-messages/chat_messages";
import ChatInput from "../../COMPONENTs/chat-input/chat_input";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Initial Mock Data                                                                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const INITIAL_MESSAGES = [
  {
    id: "1",
    role: "user",
    content: "Can you explain what a closure is in JavaScript?",
  },
  {
    id: "2",
    role: "assistant",
    content: `A **closure** is a function that remembers the variables from its outer scope even after that scope has finished executing.

\`\`\`js
function outer() {
  let count = 0;
  return function inner() {
    count++;
    return count;
  };
}

const counter = outer();
counter(); // 1
counter(); // 2
\`\`\`

The \`inner\` function "closes over" the \`count\` variable — it retains access to it even though \`outer\` has already returned. This is useful for data privacy, callbacks, and maintaining state.`,
  },
  {
    id: "3",
    role: "user",
    content: "How is that different from a regular function?",
  },
  {
    id: "4",
    role: "assistant",
    content: `A regular function can only access variables in its **own scope** and the **global scope**. A closure additionally retains access to the **enclosing function's scope** — even after the enclosing function has returned.

| Aspect | Regular function | Closure |
|---|---|---|
| Access to outer variables | Only globals | Enclosing scope + globals |
| Persists outer state | No | Yes |
| Created when | Defined anywhere | A function is returned from another function |

In short, every function in JS *can* be a closure — it becomes one when it references variables from an outer scope that has finished executing.`,
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ChatInterface — Main Page Component                                                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ChatInterface = () => {
  const { theme } = useContext(ConfigContext);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");

  /* ── send message ──────────────────────────────────── */
  const sendMessage = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;

    const userMsg = {
      id: String(Date.now()),
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    /* fake assistant reply after a short delay */
    setTimeout(() => {
      const reply = {
        id: String(Date.now() + 1),
        role: "assistant",
        content:
          "That's a great question! I'd be happy to help, but this is just a UI demo — no actual AI is connected here. 😊",
      };
      setMessages((prev) => [...prev, reply]);
    }, 800);
  }, [inputValue]);

  /* ── new chat ──────────────────────────────────────── */
  const handleNewChat = useCallback(() => {
    setMessages(INITIAL_MESSAGES);
    setInputValue("");
  }, []);

  /* ── settings ──────────────────────────────────────── */
  const handleSettings = useCallback(() => {
    console.log("Settings clicked");
    // Add your settings logic here
  }, []);

  /* ── message actions ───────────────────────────────── */
  const handleEdit = useCallback((message) => {
    console.log("Edit message:", message);
    // Add your edit logic here
  }, []);

  const handleCopy = useCallback((message) => {
    navigator.clipboard.writeText(message.content);
    console.log("Copied to clipboard");
  }, []);

  const handleRegenerate = useCallback((message) => {
    console.log("Regenerate message:", message);
    // Add your regenerate logic here
  }, []);

  /* ── attachment actions ────────────────────────────── */
  const handleAttachFile = useCallback(() => {
    console.log("Attach file");
  }, []);

  const handleAttachLink = useCallback(() => {
    console.log("Attach link");
  }, []);

  const handleAttachGlobal = useCallback(() => {
    console.log("Attach global");
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 2,
        right: 2,
        bottom: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: theme?.font?.fontFamily || "inherit",
      }}
    >
      <ChatMessages
        messages={messages}
        onEdit={handleEdit}
        onCopy={handleCopy}
        onRegenerate={handleRegenerate}
      />

      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSend={sendMessage}
        placeholder="Message PuPu Chat..."
        disclaimer="PuPu version 0.1.0"
        showAttachments={true}
        onAttachFile={handleAttachFile}
        onAttachLink={handleAttachLink}
        onAttachGlobal={handleAttachGlobal}
      />
    </div>
  );
};

export default ChatInterface;
