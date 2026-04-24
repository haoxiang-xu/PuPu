import { useEffect, useState } from "react";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import api from "../../../../SERVICEs/api.unchain";

export default function SubagentPicker({ onPick, onClose, isDark }) {
  const [tab, setTab] = useState("import");
  const [refs, setRefs] = useState([]);
  const [inlineName, setInlineName] = useState("");
  const [inlineFormat, setInlineFormat] = useState("soul");
  const [inlinePrompt, setInlinePrompt] = useState("");

  useEffect(() => {
    (async () => {
      const { refs: list } = await api.listSubagentRefs();
      setRefs(list);
    })();
  }, []);

  const tabBtn = (key, label) => (
    <span
      onClick={() => setTab(key)}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        cursor: "pointer",
        color: tab === key ? "#4a5bd8" : isDark ? "#aaa" : "#666",
        borderBottom: `2px solid ${tab === key ? "#4a5bd8" : "transparent"}`,
      }}
    >
      {label}
    </span>
  );

  const pickRef = (name) => {
    onPick({ kind: "ref", template_name: name, disabled_tools: [] });
  };

  const pickInline = () => {
    if (!inlineName.trim()) return;
    const template =
      inlineFormat === "skeleton"
        ? {
            name: inlineName,
            description: "",
            instructions: inlinePrompt,
          }
        : { prompt: inlinePrompt };
    onPick({
      kind: "inline",
      name: inlineName.trim(),
      prompt_format: inlineFormat,
      template,
      disabled_tools: [],
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      style={{
        width: 520,
        height: 440,
        padding: 0,
        background: isDark ? "#1e1e22" : "#fff",
        color: isDark ? "#fff" : "#222",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${
            isDark ? "rgba(255,255,255,0.08)" : "#e5e5e7"
          }`,
        }}
      >
        <div style={{ fontWeight: 600 }}>Add subagent</div>
        <div style={{ marginTop: 10, display: "flex", gap: 4 }}>
          {tabBtn("import", "Import from file")}
          {tabBtn("inline", "Author inline")}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px",
          fontSize: 12,
        }}
      >
        {tab === "import" && (
          <div>
            {refs.length === 0 ? (
              <div style={{ color: isDark ? "#888" : "#888" }}>
                No subagent files in ~/.pupu/subagents/
              </div>
            ) : (
              refs.map((r) => (
                <div
                  key={r.name}
                  onClick={() => pickRef(r.name)}
                  style={{
                    padding: "8px 6px",
                    borderBottom: `1px dashed ${
                      isDark ? "rgba(255,255,255,0.06)" : "#f0f0f2"
                    }`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: isDark ? "#888" : "#888",
                    }}
                  >
                    {r.format} · {r.description}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {tab === "inline" && (
          <div>
            <div style={{ marginBottom: 8 }}>
              <input
                placeholder="Subagent name"
                value={inlineName}
                onChange={(e) => setInlineName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: `1px solid ${
                    isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"
                  }`,
                  borderRadius: 4,
                  fontSize: 12,
                  background: isDark ? "#141417" : "#fff",
                  color: isDark ? "#fff" : "#222",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ marginRight: 12 }}>
                <input
                  type="radio"
                  checked={inlineFormat === "soul"}
                  onChange={() => setInlineFormat("soul")}
                />{" "}
                soul
              </label>
              <label>
                <input
                  type="radio"
                  checked={inlineFormat === "skeleton"}
                  onChange={() => setInlineFormat("skeleton")}
                />{" "}
                skeleton
              </label>
            </div>
            <textarea
              rows={12}
              placeholder={
                inlineFormat === "skeleton"
                  ? "(instructions text)"
                  : "You are..."
              }
              value={inlinePrompt}
              onChange={(e) => setInlinePrompt(e.target.value)}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                border: `1px solid ${
                  isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"
                }`,
                borderRadius: 4,
                background: isDark ? "#141417" : "#fff",
                color: isDark ? "#fff" : "#222",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                onClick={pickInline}
                disabled={!inlineName.trim()}
                style={{
                  padding: "4px 12px",
                  fontSize: 12,
                  border: `1px solid #4a5bd8`,
                  background: inlineName.trim() ? "#4a5bd8" : "transparent",
                  color: inlineName.trim() ? "#fff" : "#4a5bd8",
                  borderRadius: 4,
                  cursor: inlineName.trim() ? "pointer" : "not-allowed",
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
