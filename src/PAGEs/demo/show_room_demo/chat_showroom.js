import { useState, useContext, useRef, useCallback, useEffect } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { FloatingTextField } from "../../../BUILTIN_COMPONENTs/input/textfield";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ── Attachment toolbar (chat input) ── */
const AttachPanel = ({
  color,
  bg,
  active,
  focused,
  focusBg,
  focusBorder,
  focusShadow,
}) => {
  let panelBg = "transparent";
  if (active) panelBg = bg || "rgba(128,128,128,0.08)";
  if (focused) panelBg = focusBg || "rgba(255,255,255,0.95)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px",
        borderRadius: 7,
        backgroundColor: panelBg,
        border: focused ? focusBorder : "1px solid transparent",
        boxShadow: focused ? focusShadow : "none",
        transition: "background-color 0.22s ease, box-shadow 0.22s ease",
      }}
    >
      <Button prefix_icon="link" style={{ color, fontSize: 14 }} />
      <Button prefix_icon="global" style={{ color, fontSize: 14 }} />
      <Button prefix_icon="add" style={{ color, fontSize: 14 }} />
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Mock data                                                                                                                   */
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
/*  ChatBubble — a single message with hover action bar                                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ChatBubble = ({ message, isDark, theme, isLast, color }) => {
  const isUser = message.role === "user";
  const [hovered, setHovered] = useState(false);
  const avatarIconColor = isDark ? "rgba(255,255,255,0.85)" : undefined;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: 0,
        position: "relative",
      }}
    >
      {/* ── role label ──────────────────────────────────── */}
      {!isUser && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingBottom: 6,
            paddingLeft: 2,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon
              src="mini_ui"
              color={avatarIconColor}
              style={{
                width: 12,
                height: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: theme?.color || "#222",
              opacity: 0.45,
            }}
          >
            Assistant
          </span>
        </div>
      )}

      {/* ── message content ─────────────────────────────── */}
      <div
        style={{
          maxWidth: isUser ? "75%" : "100%",
          padding: isUser ? "10px 16px" : "0 2px",
          borderRadius: isUser ? 16 : 0,
          ...(isUser
            ? {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.05)",
              }
            : {}),
          fontSize: 14,
          fontFamily: theme?.font?.fontFamily || "inherit",
          color: theme?.color || "#222",
          lineHeight: 1.6,
          wordBreak: "break-word",
        }}
      >
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <Markdown
            markdown={message.content}
            options={{
              fontSize: 14,
              lineHeight: 1.6,
            }}
          />
        )}
      </div>

      {/* ── hover action bar ────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: isUser ? "flex-end" : "flex-start",
          gap: 2,
          paddingTop: 4,
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateY(0)" : "translateY(-4px)",
          transition:
            "opacity 0.18s ease, transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {!isUser && (
          <>
            <Button
              prefix_icon="draft"
              onClick={() => {}}
              style={{ color, fontSize: 12, opacity: 0.4 }}
            />
            <Button
              prefix_icon="edit"
              onClick={() => {}}
              style={{ color, fontSize: 12, opacity: 0.4 }}
            />
            {isLast && (
              <Button
                prefix_icon="marker"
                onClick={() => {}}
                style={{ color, fontSize: 12, opacity: 0.4 }}
              />
            )}
          </>
        )}
        {isUser && (
          <Button
            prefix_icon="edit"
            onClick={() => {}}
            style={{ color, fontSize: 12, opacity: 0.4 }}
          />
        )}
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ChatShowroom — the full chat window                                                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ChatShowroom = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState("");
  const messagesRef = useRef(null);
  const inputRef = useRef(null);
  const [chatFocused, setChatFocused] = useState(false);
  const chatActive = inputValue.length > 0 || chatFocused;

  const color = theme?.color || "#222";
  const panelBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const panelFocusBg = isDark ? "rgba(30,30,30,1)" : "rgba(255,255,255,1)";
  const panelFocusBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.06)";
  const panelFocusShadow = isDark
    ? "0 4px 24px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)"
    : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

  /* auto-scroll to bottom on new message — scoped to messages container */
  useEffect(() => {
    const el = messagesRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  /* send a message */
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

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        maxWidth: 820,
        margin: "0 auto",
        height: "100%",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: theme?.font?.fontFamily || "inherit",
      }}
    >
      {/* ── header ──────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: isDark
            ? "1px solid rgba(255,255,255,0.06)"
            : "1px solid rgba(0,0,0,0.06)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              src="mini_ui"
              color={isDark ? "rgba(255,255,255,0.85)" : undefined}
              style={{
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 15,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: theme?.color || "#222",
            }}
          >
            Mini UI Chat
          </span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Button
            prefix_icon="edit"
            onClick={() => setMessages(INITIAL_MESSAGES)}
            style={{ color, fontSize: 14, opacity: 0.4 }}
          />
          <Button
            prefix_icon="more"
            onClick={() => {}}
            style={{ color, fontSize: 14, opacity: 0.4 }}
          />
        </div>
      </div>

      {/* ── messages area ───────────────────────────────── */}
      <div
        ref={messagesRef}
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 0 8px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {messages.map((msg, i) => (
          <div key={msg.id} style={{ width: "60%", margin: "0 auto" }}>
            <ChatBubble
              message={msg}
              isDark={isDark}
              theme={theme}
              color={color}
              isLast={
                msg.role === "assistant" &&
                i ===
                  messages.length -
                    1 -
                    [...messages]
                      .slice(i + 1)
                      .reverse()
                      .findIndex((m) => m.role === "assistant")
              }
            />
          </div>
        ))}
      </div>

      {/* ── input area ──────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          padding: "0px 20px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ width: "60%" }}>
          <FloatingTextField
            textarea_ref={inputRef}
            value={inputValue}
            min_rows={1}
            max_display_rows={6}
            set_value={setInputValue}
            placeholder="Message Mini UI Chat..."
            on_focus={() => setChatFocused(true)}
            on_blur={() => setChatFocused(false)}
            on_key_down={handleKeyDown}
            content_section={
              <AttachPanel
                color={color}
                bg={panelBg}
                active={chatActive}
                focused={chatFocused}
                focusBg={panelFocusBg}
                focusBorder={panelFocusBorder}
                focusShadow={panelFocusShadow}
              />
            }
            functional_section={
              <>
                {inputValue.length > 0 && (
                  <Button
                    prefix_icon="close"
                    style={{ color, fontSize: 14 }}
                    onClick={() => setInputValue("")}
                  />
                )}
                <Button
                  prefix_icon="arrow_up"
                  onClick={sendMessage}
                  style={{ color, fontSize: 14 }}
                />
              </>
            }
            style={{ width: "120%", margin: 0, transform: "translateX(-10%)" }}
          />

          {/* disclaimer text */}
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: theme?.color || "#222",
              opacity: 0.3,
              paddingTop: 8,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            Mini UI Chat is a demo. Responses are not generated by AI.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatShowroom;
