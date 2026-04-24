import { useEffect, useState } from "react";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Input from "../../../../BUILTIN_COMPONENTs/input/input";
import TextField from "../../../../BUILTIN_COMPONENTs/input/textfield";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../../BUILTIN_COMPONENTs/input/segmented_button";
import { api } from "../../../../SERVICEs/api";

export default function SubagentPicker({ onPick, onClose, isDark }) {
  const [tab, setTab] = useState("import");
  const [refs, setRefs] = useState([]);
  const [inlineName, setInlineName] = useState("");
  const [inlineFormat, setInlineFormat] = useState("soul");
  const [inlinePrompt, setInlinePrompt] = useState("");

  useEffect(() => {
    (async () => {
      const { refs: list } = await api.unchain.listSubagentRefs();
      setRefs(list);
    })();
  }, []);

  const pickRef = (name) => {
    onPick({ kind: "ref", template_name: name, disabled_tools: [] });
  };

  const pickInline = () => {
    if (!inlineName.trim()) return;
    const template =
      inlineFormat === "skeleton"
        ? { name: inlineName, description: "", instructions: inlinePrompt }
        : { prompt: inlinePrompt };
    onPick({
      kind: "inline",
      name: inlineName.trim(),
      prompt_format: inlineFormat,
      template,
      disabled_tools: [],
    });
  };

  const divider = `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#e5e5e7"}`;

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
      <div style={{ padding: "12px 16px", borderBottom: divider }}>
        <div style={{ fontWeight: 600 }}>Add subagent</div>
        <div style={{ marginTop: 10 }}>
          <SegmentedButton
            options={[
              { label: "Import from file", value: "import" },
              { label: "Author inline", value: "inline" },
            ]}
            value={tab}
            on_change={setTab}
            style={{ fontSize: 11 }}
          />
        </div>
      </div>

      <div
        style={{ flex: 1, overflowY: "auto", padding: "12px 16px", fontSize: 12 }}
      >
        {tab === "import" && (
          <div>
            {refs.length === 0 ? (
              <div style={{ color: "#888" }}>
                No subagent files in ~/.pupu/subagents/
              </div>
            ) : (
              refs.map((r) => (
                <div
                  key={r.name}
                  onClick={() => pickRef(r.name)}
                  style={{
                    padding: "8px 6px",
                    borderBottom: `1px solid ${
                      isDark ? "rgba(255,255,255,0.06)" : "#f0f0f2"
                    }`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>
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
              <Input
                value={inlineName}
                set_value={setInlineName}
                placeholder="Subagent name"
                style={{ width: "100%", fontSize: 12, borderRadius: 6 }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <SegmentedButton
                options={[
                  { label: "Soul", value: "soul" },
                  { label: "Skeleton", value: "skeleton" },
                ]}
                value={inlineFormat}
                on_change={setInlineFormat}
                style={{ fontSize: 11 }}
              />
            </div>
            <TextField
              value={inlinePrompt}
              set_value={setInlinePrompt}
              placeholder={
                inlineFormat === "skeleton"
                  ? "(instructions text)"
                  : "You are..."
              }
              min_rows={10}
              max_display_rows={12}
              style={{
                width: "100%",
                fontSize: 11,
                fontFamily: "ui-monospace, monospace",
                borderRadius: 6,
                padding: 8,
              }}
            />
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <Button
                label="Add"
                onClick={pickInline}
                disabled={!inlineName.trim()}
                style={{
                  fontSize: 12,
                  paddingVertical: 5,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: inlineName.trim() ? "#4a5bd8" : "transparent",
                  color: inlineName.trim() ? "#fff" : "#4a5bd8",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
