import { useState, useContext, useMemo, useRef } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Explorer from "../../../BUILTIN_COMPONENTs/explorer/explorer";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { FloatingTextField } from "../../../BUILTIN_COMPONENTs/input/textfield";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Mock conversation data                                                                                                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const CONVERSATIONS = [
  {
    id: "turn-1",
    user: "Help me create a React component that fetches data from an API.",
    assistant: {
      reasoning:
        "The user wants a React component that fetches data. I should use `useEffect` and `useState` hooks. I'll include loading and error states for a complete example. Let me also consider using `fetch` API with proper cleanup via AbortController.",
      tool_calls: null,
      response: `Here's a reusable data-fetching component:

\`\`\`jsx
import { useState, useEffect } from "react";

const useFetch = (url) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then(setData)
      .catch((err) => {
        if (err.name !== "AbortError") setError(err);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [url]);

  return { data, loading, error };
};
\`\`\`

This hook handles loading states, errors, and cleanup on unmount using \`AbortController\`.`,
    },
  },
  {
    id: "turn-2",
    user: "Can you find the current weather in San Francisco?",
    assistant: {
      reasoning:
        "The user wants real-time weather data. I need to call the weather API tool to get current conditions for San Francisco, CA.",
      tool_calls: [
        {
          name: "get_weather",
          arguments: '{ "location": "San Francisco, CA" }',
          result:
            '{ "temp": 62, "condition": "Partly Cloudy", "humidity": 72, "wind": "12 mph NW" }',
        },
      ],
      response: `The current weather in San Francisco:

| Metric | Value |
|---|---|
| Temperature | 62°F |
| Condition | Partly Cloudy |
| Humidity | 72% |
| Wind | 12 mph NW |

It's a mild day — great for a walk in Golden Gate Park!`,
    },
  },
  {
    id: "turn-3",
    user: "Search for recent papers on transformer architectures and summarize them.",
    assistant: {
      reasoning:
        "This is a multi-step task. I'll first search for recent papers using the search tool, then read the top results, and finally synthesize a summary. Let me start with the search.",
      tool_calls: [
        {
          name: "search_papers",
          arguments: '{ "query": "transformer architecture 2025", "limit": 3 }',
          result:
            '[\n  { "title": "Efficient Attention via Sparse Routing", "authors": "Li et al.", "year": 2025 },\n  { "title": "Beyond Softmax: Linear Attention Revisited", "authors": "Chen & Wang", "year": 2025 },\n  { "title": "Multi-Scale Transformers for Long-Range Deps", "authors": "Park et al.", "year": 2025 }\n]',
        },
        {
          name: "read_paper",
          arguments: '{ "title": "Efficient Attention via Sparse Routing" }',
          result:
            "Abstract: We propose a sparse attention mechanism that routes tokens to relevant heads, reducing compute from O(n²) to O(n log n) while maintaining accuracy on standard benchmarks...",
        },
      ],
      response: `Here's a summary of recent transformer research:

**1. Efficient Attention via Sparse Routing** (Li et al., 2025)
Proposes routing tokens to only relevant attention heads, reducing complexity from O(n²) to O(n log n).

**2. Beyond Softmax: Linear Attention Revisited** (Chen & Wang, 2025)
Revisits linear attention with improved kernel functions that close the quality gap with softmax attention.

**3. Multi-Scale Transformers for Long-Range Dependencies** (Park et al., 2025)
Introduces hierarchical attention at multiple resolutions for better long-context modeling.

The common theme is **efficiency** — moving beyond vanilla O(n²) attention while preserving model quality.`,
    },
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Build per-turn Explorer data                                                                                                */
/*  Content items are folders whose child is a component node that renders Markdown inline                                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Inline Markdown component rendered inside the Explorer tree via `component` field. */
const InlineContent = ({ content, isCode, color, fontFamily }) => {
  const md = isCode ? "```json\n" + content + "\n```" : content;
  return (
    <div style={{ padding: "4px 8px 8px 0", overflow: "hidden" }}>
      <Markdown
        markdown={md}
        options={{
          fontSize: 13,
          lineHeight: 1.6,
          color,
          fontFamily: fontFamily || "NunitoSans",
        }}
      />
    </div>
  );
};

const buildTurnExplorerData = (turn, color, fontFamily) => {
  const map = {};
  const root = [];
  const turnKey = turn.id;

  /**
   * Create a folder node with a single child that uses `component`
   * to render Markdown content inline in the tree.
   */
  const makeContentFolder = (key, label, icon, postfix, role, content) => {
    const childKey = `${key}__content`;
    const isCode = role === "tool_args" || role === "tool_result";
    map[childKey] = {
      type: "file",
      component: (
        <InlineContent
          content={content}
          isCode={isCode}
          color={color}
          fontFamily={fontFamily}
        />
      ),
    };
    map[key] = {
      label,
      type: "folder",
      prefix_icon: icon,
      postfix,
      children: [childKey],
    };
  };

  /* Reasoning */
  if (turn.assistant.reasoning) {
    const key = `${turnKey}-reasoning`;
    makeContentFolder(
      key,
      "Reasoning",
      "search",
      "thinking",
      "reasoning",
      turn.assistant.reasoning,
    );
    root.push(key);
  }

  /* Tool calls */
  if (turn.assistant.tool_calls) {
    turn.assistant.tool_calls.forEach((tc, tcIdx) => {
      const folderKey = `${turnKey}-tool-${tcIdx}`;
      const argKey = `${turnKey}-tool-${tcIdx}-args`;
      const resultKey = `${turnKey}-tool-${tcIdx}-result`;

      makeContentFolder(
        argKey,
        "Arguments",
        "edit",
        null,
        "tool_args",
        tc.arguments,
      );
      makeContentFolder(
        resultKey,
        "Result",
        "check",
        null,
        "tool_result",
        tc.result,
      );

      map[folderKey] = {
        label: tc.name,
        type: "folder",
        prefix_icon: "tool",
        postfix: "tool_call",
        children: [argKey, resultKey],
      };
      root.push(folderKey);
    });
  }

  return { map, root };
};

/* Build per-turn data for all conversations */
const buildAllMaps = (conversations, color, fontFamily) => {
  return conversations.map((turn) => {
    const { map, root } = buildTurnExplorerData(turn, color, fontFamily);
    return { map, root, turn };
  });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ChatExplorerShowroom                                                                                                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ChatExplorerShowroom = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const fontFamily = theme?.font?.fontFamily || "Jost";

  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  const perTurn = useMemo(
    () => buildAllMaps(CONVERSATIONS, color, "NunitoSans"),
    [color],
  );

  const border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.06)";

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
        fontFamily,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          borderBottom: border,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
          <span style={{ fontSize: 15, fontFamily, color }}>Chat Explorer</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <Button
            prefix_icon="edit"
            onClick={() => {}}
            style={{ color, fontSize: 14, opacity: 0.4 }}
          />
        </div>
      </div>

      {/* ── Chat feed ── */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 0 8px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 24,
        }}
      >
        {perTurn.map(({ map, root, turn }) => (
          <div
            key={turn.id}
            style={{
              width: "75%",
              maxWidth: 560,
            }}
          >
            {/* ── User chat bubble ── */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  maxWidth: "80%",
                  padding: "10px 16px",
                  borderRadius: 16,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.05)",
                  fontSize: 14,
                  fontFamily,
                  color,
                  lineHeight: 1.6,
                  wordBreak: "break-word",
                }}
              >
                {turn.user}
              </div>
            </div>

            {/* ── Assistant avatar ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
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
                  color={isDark ? "rgba(255,255,255,0.85)" : undefined}
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
                  fontFamily,
                  color,
                  opacity: 0.4,
                }}
              >
                Assistant
              </span>
            </div>

            {/* ── Assistant explorer — content rendered inline via component ── */}
            <div style={{ minWidth: 0 }}>
              <Explorer
                data={map}
                root={root}
                default_expanded={false}
                style={{ width: "100%", fontSize: 13 }}
              />
            </div>

            {/* ── Response rendered as markdown ── */}
            {turn.assistant.response && (
              <div style={{ padding: "12px 0 0 0" }}>
                <Markdown
                  markdown={turn.assistant.response}
                  options={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color,
                    fontFamily: "NunitoSans",
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Input area ── */}
      <div
        style={{
          flexShrink: 0,
          padding: "0px 20px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div style={{ width: "75%" }}>
          <FloatingTextField
            textarea_ref={inputRef}
            value={inputValue}
            min_rows={1}
            max_display_rows={4}
            set_value={setInputValue}
            placeholder="Ask a question..."
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
                  onClick={() => {}}
                  style={{ color, fontSize: 14 }}
                />
              </>
            }
            style={{ width: "120%", margin: 0, transform: "translateX(-10%)" }}
          />
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              fontFamily,
              color,
              opacity: 0.3,
              paddingTop: 8,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            Chat Explorer is a demo. Responses are not generated by AI.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatExplorerShowroom;
