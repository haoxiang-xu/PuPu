import { useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import CodeDiffInteract from "../../chat-bubble/interact/code_diff_interact";

/* ── sample unified diffs ─────────────────────────────────────────── */

const SMALL_EDIT_DIFF =
  "--- a/src/unchain/tools/confirmation.py\n" +
  "+++ b/src/unchain/tools/confirmation.py\n" +
  "@@ -100,7 +100,21 @@\n" +
  "         policy_render = confirmation_policy.render_component if confirmation_policy is not None else None\n" +
  "         if isinstance(policy_render, dict) and policy_render:\n" +
  "             effective_render = dict(policy_render)\n" +
  "+\n" +
  "+        # Propagate interact_type / interact_config from the resolved\n" +
  "+        # policy onto the request. Policy may be None if no resolver\n" +
  "+        # ran — in that case the request defaults apply.\n" +
  "+        policy_interact_type = (\n" +
  "+            confirmation_policy.interact_type\n" +
  "+            if confirmation_policy is not None\n" +
  "+            else \"confirmation\"\n" +
  "+        )\n" +
  "+        policy_interact_config = (\n" +
  "+            confirmation_policy.interact_config\n" +
  "+            if confirmation_policy is not None\n" +
  "+            else None\n" +
  "+        )\n" +
  "+\n" +
  "         confirmation_request = ToolConfirmationRequest(\n" +
  "             tool_name=tool_call.name,\n" +
  "             call_id=tool_call.call_id,\n";

const CREATE_DIFF =
  "--- a/dev/null\n" +
  "+++ b/src/unchain/tools/_diff_helpers.py\n" +
  "@@ -0,0 +1,6 @@\n" +
  '+"""Diff payload builder for the code_diff interact UI."""\n' +
  "+from __future__ import annotations\n" +
  "+import difflib\n" +
  "+\n" +
  "+_MAX_LINES = 200\n" +
  "+_MAX_BYTES = 1_000_000\n";

/* Build a long diff to demo the truncation notice. */
function buildTruncatedDiff() {
  const lines = [
    "--- a/big.py",
    "+++ b/big.py",
    "@@ -1,400 +1,400 @@",
  ];
  for (let i = 0; i < 200; i += 1) {
    lines.push(`-line ${i}`);
    lines.push(`+LINE ${i}`);
  }
  return lines.join("\n") + "\n";
}

/* ── scenario catalogue ───────────────────────────────────────────── */

const SCENARIOS = [
  {
    key: "pending_edit",
    label: "Pending — small edit",
    uiState: {
      status: "pending",
      error: null,
      resolved: false,
      decision: null,
    },
    config: {
      title: "Edit src/unchain/tools/confirmation.py",
      operation: "edit",
      path: "src/unchain/tools/confirmation.py",
      unified_diff: SMALL_EDIT_DIFF,
      truncated: false,
      total_lines: SMALL_EDIT_DIFF.split("\n").length,
      displayed_lines: SMALL_EDIT_DIFF.split("\n").length,
      fallback_description: "edit confirmation.py (+14 -0)",
    },
  },
  {
    key: "pending_create",
    label: "Pending — create new file",
    uiState: {
      status: "pending",
      error: null,
      resolved: false,
      decision: null,
    },
    config: {
      title: "Create src/unchain/tools/_diff_helpers.py",
      operation: "create",
      path: "src/unchain/tools/_diff_helpers.py",
      unified_diff: CREATE_DIFF,
      truncated: false,
      total_lines: CREATE_DIFF.split("\n").length,
      displayed_lines: CREATE_DIFF.split("\n").length,
      fallback_description: "create _diff_helpers.py (+6 -0)",
    },
  },
  {
    key: "pending_truncated",
    label: "Pending — truncated (200/400)",
    uiState: {
      status: "pending",
      error: null,
      resolved: false,
      decision: null,
    },
    config: {
      title: "Edit big.py",
      operation: "edit",
      path: "big.py",
      unified_diff: buildTruncatedDiff(),
      truncated: true,
      total_lines: 403,
      displayed_lines: 200,
      fallback_description: "edit big.py (+200 -200)",
    },
  },
  {
    key: "approved",
    label: "Approved (resolved)",
    uiState: {
      status: "resolved",
      error: null,
      resolved: true,
      decision: "approved",
    },
    config: {
      title: "Edit src/unchain/tools/confirmation.py",
      operation: "edit",
      path: "src/unchain/tools/confirmation.py",
      unified_diff: SMALL_EDIT_DIFF,
      truncated: false,
      total_lines: SMALL_EDIT_DIFF.split("\n").length,
      displayed_lines: SMALL_EDIT_DIFF.split("\n").length,
      fallback_description: "edit confirmation.py (+14 -0)",
    },
  },
  {
    key: "rejected",
    label: "Rejected (resolved)",
    uiState: {
      status: "resolved",
      error: null,
      resolved: true,
      decision: "rejected",
    },
    config: {
      title: "Edit src/unchain/tools/confirmation.py",
      operation: "edit",
      path: "src/unchain/tools/confirmation.py",
      unified_diff: SMALL_EDIT_DIFF,
      truncated: false,
      total_lines: SMALL_EDIT_DIFF.split("\n").length,
      displayed_lines: SMALL_EDIT_DIFF.split("\n").length,
      fallback_description: "edit confirmation.py (+14 -0)",
    },
  },
  {
    key: "malformed",
    label: "Malformed diff (fallback)",
    uiState: {
      status: "pending",
      error: null,
      resolved: false,
      decision: null,
    },
    config: {
      title: "Edit broken.py",
      operation: "edit",
      path: "broken.py",
      unified_diff: "NOT A VALID DIFF AT ALL",
      truncated: false,
      total_lines: 1,
      displayed_lines: 1,
      fallback_description: "edit broken.py",
    },
  },
];

/* ═══════════════════════════════════════════════════════════════════
   CodeDiffInteractRunner
   ═══════════════════════════════════════════════════════════════════ */
const CodeDiffInteractRunner = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [selectedKey, setSelectedKey] = useState(SCENARIOS[0].key);
  const [lastSubmit, setLastSubmit] = useState(null);

  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.key === selectedKey) || SCENARIOS[0],
    [selectedKey],
  );

  const mutedLabel = isDark
    ? "rgba(255,255,255,0.5)"
    : "rgba(0,0,0,0.45)";
  const sectionHeader = isDark
    ? "rgba(255,255,255,0.28)"
    : "rgba(0,0,0,0.28)";

  return (
    <div
      className="scrollable"
      data-sb-edge="16"
      data-sb-wall="2"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        padding: "48px 40px 40px 232px",
        color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)",
        fontFamily: "Jost, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: sectionHeader,
          marginBottom: 8,
        }}
      >
        Scenario
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 18,
        }}
      >
        {SCENARIOS.map((s) => {
          const active = s.key === selectedKey;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSelectedKey(s.key);
                setLastSubmit(null);
              }}
              style={{
                appearance: "none",
                border: `1px solid ${
                  active
                    ? isDark
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(0,0,0,0.4)"
                    : isDark
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(0,0,0,0.12)"
                }`,
                background: active
                  ? isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)"
                  : "transparent",
                color: active
                  ? isDark
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(0,0,0,0.85)"
                  : mutedLabel,
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 11.5,
                fontFamily: "Menlo, Monaco, Consolas, monospace",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: sectionHeader,
          marginBottom: 8,
        }}
      >
        CodeDiffInteract
      </div>
      <div style={{ maxWidth: 720, marginBottom: 18 }}>
        <CodeDiffInteract
          config={scenario.config}
          uiState={scenario.uiState}
          isDark={isDark}
          disabled={false}
          onSubmit={(data) => setLastSubmit(data)}
        />
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: sectionHeader,
          marginBottom: 8,
        }}
      >
        Last onSubmit
      </div>
      <pre
        style={{
          fontFamily: "Menlo, Monaco, Consolas, monospace",
          fontSize: 11.5,
          padding: 10,
          borderRadius: 6,
          background: isDark
            ? "rgba(255,255,255,0.04)"
            : "rgba(0,0,0,0.04)",
          color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.75)",
          margin: 0,
          overflowX: "auto",
        }}
      >
        {lastSubmit ? JSON.stringify(lastSubmit, null, 2) : "(none yet)"}
      </pre>
    </div>
  );
};

export default CodeDiffInteractRunner;
