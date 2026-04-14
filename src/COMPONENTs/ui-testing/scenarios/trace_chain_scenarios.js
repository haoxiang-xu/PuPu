/* ── frame helper ─────────────────────────────────────────────────────── */
const f = ({ seq, type, payload = {}, ts = seq * 800 }) => ({
  seq,
  ts,
  type,
  payload,
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 1 — Basic Flow
   reasoning → tool_call → tool_result → reasoning → final_message
   ═══════════════════════════════════════════════════════════════════════ */
const BASIC_FLOW = {
  name: "Basic Flow",
  description: "Linear trace: reasoning, tool calls, final response",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "reasoning",
      payload: {
        reasoning:
          "I need to read the project structure to understand the codebase layout.",
      },
    }),
    f({
      seq: 3,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        tool_name: "list_files",
        tool_display_name: "list_files",
        arguments: { path: "src/", recursive: false },
      },
    }),
    f({
      seq: 4,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        result: {
          files: "src/App.js\nsrc/index.js\nsrc/components/\nsrc/utils/",
        },
      },
    }),
    f({
      seq: 5,
      type: "tool_call",
      payload: {
        call_id: "call-2",
        tool_name: "read_file",
        tool_display_name: "read_file",
        arguments: { path: "src/App.js" },
      },
    }),
    f({
      seq: 6,
      type: "tool_result",
      payload: {
        call_id: "call-2",
        result: {
          content:
            'import React from "react";\nexport default function App() { return <div>Hello</div>; }',
        },
      },
    }),
    f({
      seq: 7,
      type: "reasoning",
      payload: {
        reasoning:
          "The project has a simple React setup. Let me summarize the structure.",
      },
    }),
    f({
      seq: 8,
      type: "final_message",
      payload: {
        content:
          "The project is a standard React application with the following structure:\n\n- `src/App.js` — Main application component\n- `src/index.js` — Entry point\n- `src/components/` — Component directory\n- `src/utils/` — Utility functions",
      },
    }),
    f({ seq: 9, type: "done" }),
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 2 — Tool Confirmation
   tool_call with requires_confirmation → user approves → result
   ═══════════════════════════════════════════════════════════════════════ */
const TOOL_CONFIRMATION = {
  name: "Tool Confirmation",
  description: "Tool requiring user approval before execution",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "reasoning",
      payload: {
        reasoning:
          "The user wants me to delete the temporary cache files. I should confirm before proceeding.",
      },
    }),
    f({
      seq: 3,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        tool_name: "delete_file",
        tool_display_name: "delete_file",
        description: "Delete the temporary cache directory",
        arguments: { path: "tmp/cache/", recursive: true },
      },
    }),
  ],
  // Frames to add after user approves:
  onApproveFrames: [
    f({
      seq: 4,
      type: "tool_confirmed",
      payload: { call_id: "call-1" },
      ts: 3500,
    }),
    f({
      seq: 5,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        result: { deleted: true, files_removed: 23 },
      },
      ts: 4000,
    }),
    f({
      seq: 6,
      type: "final_message",
      payload: {
        content: "Done! Removed 23 files from `tmp/cache/`.",
      },
      ts: 4800,
    }),
    f({ seq: 7, type: "done", ts: 5000 }),
  ],
  // Frames to add after user denies:
  onDenyFrames: [
    f({
      seq: 4,
      type: "tool_denied",
      payload: { call_id: "call-1" },
      ts: 3500,
    }),
    f({
      seq: 5,
      type: "final_message",
      payload: {
        content: "Understood, I won't delete the cache files.",
      },
      ts: 4000,
    }),
    f({ seq: 6, type: "done", ts: 4200 }),
  ],
  waitForConfirmation: "confirm-1",
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 3 — Selection (single)
   ═══════════════════════════════════════════════════════════════════════ */
const SELECTION_SINGLE = {
  name: "Selection (Single)",
  description: "Single-choice selection with 'other' option",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        tool_name: "ask_user_question",
        tool_display_name: "ask_user_question",
        interact_type: "single",
        interact_config: {
          title: "Tech Stack",
          question: "Which rendering approach would you like to use?",
          options: [
            {
              label: "Web Canvas",
              value: "web_canvas",
              description: "Browser-based 2D canvas rendering",
            },
            {
              label: "WebGL",
              value: "webgl",
              description: "GPU-accelerated 3D rendering",
            },
            {
              label: "SVG",
              value: "svg",
              description: "Vector-based, great for diagrams",
            },
          ],
          allow_other: true,
          other_label: "Custom approach",
          other_placeholder: "Describe your preferred rendering method",
        },
        arguments: {},
      },
    }),
  ],
  onApproveFrames: [
    f({
      seq: 3,
      type: "tool_confirmed",
      payload: {
        call_id: "call-1",
        user_response: { value: "web_canvas" },
      },
      ts: 3000,
    }),
    f({
      seq: 4,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        result: { selected: "web_canvas" },
      },
      ts: 3200,
    }),
    f({
      seq: 5,
      type: "reasoning",
      payload: {
        reasoning:
          "The user chose Web Canvas. I'll set up the 2D canvas rendering pipeline.",
      },
      ts: 3500,
    }),
    f({
      seq: 6,
      type: "final_message",
      payload: {
        content:
          "Great choice! I'll implement the rendering using HTML5 Canvas API for 2D graphics.",
      },
      ts: 4000,
    }),
    f({ seq: 7, type: "done", ts: 4200 }),
  ],
  waitForConfirmation: "confirm-1",
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 4 — Selection (multi)
   ═══════════════════════════════════════════════════════════════════════ */
const SELECTION_MULTI = {
  name: "Selection (Multi)",
  description: "Multi-select checkboxes",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        tool_name: "ask_user_question",
        tool_display_name: "ask_user_question",
        interact_type: "multi",
        interact_config: {
          title: "Features",
          question: "Which features should I include in the component?",
          options: [
            { label: "Dark mode", value: "dark_mode" },
            { label: "Animations", value: "animations" },
            {
              label: "Keyboard shortcuts",
              value: "keyboard",
              description: "Vim-style navigation",
            },
            { label: "Responsive layout", value: "responsive" },
            { label: "Accessibility (a11y)", value: "a11y" },
          ],
          min_selected: 1,
          max_selected: 3,
        },
        arguments: {},
      },
    }),
  ],
  onApproveFrames: [
    f({
      seq: 3,
      type: "tool_confirmed",
      payload: {
        call_id: "call-1",
        user_response: { values: ["dark_mode", "animations", "a11y"] },
      },
      ts: 3000,
    }),
    f({
      seq: 4,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        result: { selected: ["dark_mode", "animations", "a11y"] },
      },
      ts: 3200,
    }),
    f({
      seq: 5,
      type: "final_message",
      payload: {
        content:
          "I'll build the component with dark mode support, smooth animations, and full accessibility features.",
      },
      ts: 4000,
    }),
    f({ seq: 6, type: "done", ts: 4200 }),
  ],
  waitForConfirmation: "confirm-1",
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 5 — Delegate Subagent
   ═══════════════════════════════════════════════════════════════════════ */
const DELEGATE_SUBAGENT = {
  name: "Delegate Subagent",
  description: "Fork/merge with nested child trace",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "reasoning",
      payload: {
        reasoning:
          "This analysis task requires specialized knowledge. I'll delegate to the code analyzer agent.",
      },
    }),
    f({
      seq: 3,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        tool_name: "delegate_to_subagent",
        arguments: {
          target: "analyzer",
          task: "Analyze the src/components/ directory structure and identify key patterns",
        },
      },
    }),
    f({
      seq: 4,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        tool_name: "delegate_to_subagent",
        result: {
          agent_name: "dev.analyzer.1",
          template_name: "analyzer",
          status: "completed",
          output:
            "Found 12 components with a mix of functional and class-based patterns.",
        },
      },
      ts: 6000,
    }),
    f({
      seq: 5,
      type: "final_message",
      payload: {
        content:
          "The analysis is complete. The codebase has 12 components, primarily using functional patterns with hooks.",
      },
      ts: 7000,
    }),
    f({ seq: 6, type: "done", ts: 7200 }),
  ],
  subagentFrames: {
    "child-run-1": [
      f({ seq: 1, type: "stream_started", ts: 2500 }),
      f({
        seq: 2,
        type: "reasoning",
        payload: { reasoning: "Let me scan the components directory." },
        ts: 2800,
      }),
      f({
        seq: 3,
        type: "tool_call",
        payload: {
          call_id: "sub-call-1",
          tool_name: "list_files",
          arguments: { path: "src/components/" },
        },
        ts: 3000,
      }),
      f({
        seq: 4,
        type: "tool_result",
        payload: {
          call_id: "sub-call-1",
          result: { files: "Button.js\nCard.js\nModal.js\nInput.js" },
        },
        ts: 3500,
      }),
      f({
        seq: 5,
        type: "reasoning",
        payload: {
          reasoning:
            "Found 4 main components. All use functional patterns with hooks.",
        },
        ts: 4000,
      }),
      f({
        seq: 6,
        type: "final_message",
        payload: { content: "Analysis complete: 12 components identified." },
        ts: 5000,
      }),
      f({ seq: 7, type: "done", ts: 5200 }),
    ],
  },
  subagentMetaByRunId: {
    "child-run-1": {
      subagentId: "dev.analyzer.1",
      mode: "delegate",
      template: "analyzer",
      batchId: "",
      parentId: "developer",
      lineage: ["developer", "dev.analyzer.1"],
      status: "completed",
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 6 — Worker Batch
   ═══════════════════════════════════════════════════════════════════════ */
const WORKER_BATCH = {
  name: "Worker Batch",
  description: "Parallel workers with 3 branches",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "reasoning",
      payload: {
        reasoning:
          "I need to analyze three directories in parallel. I'll spawn worker agents for each.",
      },
    }),
    f({
      seq: 3,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        tool_name: "spawn_worker_batch",
        arguments: {
          target: "analyzer",
          reason: "Parallel directory analysis",
          tasks: [
            { task: "Analyze src/ directory" },
            { task: "Analyze tests/ directory" },
            { task: "Analyze docs/ directory" },
          ],
        },
      },
    }),
    f({
      seq: 4,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        tool_name: "spawn_worker_batch",
        result: {
          status: "completed",
          results: [
            {
              agent_name: "dev.analyzer.src",
              template_name: "analyzer",
              status: "completed",
              summary: "24 files, well-structured component tree",
            },
            {
              agent_name: "dev.analyzer.tests",
              template_name: "analyzer",
              status: "completed",
              summary: "8 test suites, 94% coverage",
            },
            {
              agent_name: "dev.analyzer.docs",
              template_name: "analyzer",
              status: "completed",
              summary: "API docs up to date, 3 guides need refresh",
            },
          ],
        },
      },
      ts: 8000,
    }),
    f({
      seq: 5,
      type: "final_message",
      payload: {
        content:
          "All three analyses are complete:\n\n- **src/**: 24 files with clean component tree\n- **tests/**: 94% coverage across 8 suites\n- **docs/**: Mostly current, 3 guides need updating",
      },
      ts: 9000,
    }),
    f({ seq: 6, type: "done", ts: 9200 }),
  ],
  subagentFrames: {
    "worker-src": [
      f({ seq: 1, type: "stream_started", ts: 2500 }),
      f({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "w1-call",
          tool_name: "list_files",
          arguments: { path: "src/" },
        },
        ts: 3000,
      }),
      f({
        seq: 3,
        type: "tool_result",
        payload: { call_id: "w1-call", result: { count: 24 } },
        ts: 4000,
      }),
      f({
        seq: 4,
        type: "final_message",
        payload: { content: "24 source files analyzed." },
        ts: 5000,
      }),
      f({ seq: 5, type: "done", ts: 5200 }),
    ],
    "worker-tests": [
      f({ seq: 1, type: "stream_started", ts: 2600 }),
      f({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "w2-call",
          tool_name: "list_files",
          arguments: { path: "tests/" },
        },
        ts: 3200,
      }),
      f({
        seq: 3,
        type: "tool_result",
        payload: { call_id: "w2-call", result: { suites: 8, coverage: 0.94 } },
        ts: 4500,
      }),
      f({
        seq: 4,
        type: "final_message",
        payload: { content: "8 test suites, 94% coverage." },
        ts: 5500,
      }),
      f({ seq: 5, type: "done", ts: 5700 }),
    ],
    "worker-docs": [
      f({ seq: 1, type: "stream_started", ts: 2700 }),
      f({
        seq: 2,
        type: "reasoning",
        payload: { reasoning: "Checking documentation freshness..." },
        ts: 3500,
      }),
      f({
        seq: 3,
        type: "final_message",
        payload: { content: "3 guides need refresh." },
        ts: 6000,
      }),
      f({ seq: 4, type: "done", ts: 6200 }),
    ],
  },
  subagentMetaByRunId: {
    "worker-src": {
      subagentId: "dev.analyzer.src",
      mode: "worker",
      template: "analyzer",
      batchId: "batch-1",
      parentId: "developer",
      lineage: ["developer", "dev.analyzer.src"],
      status: "completed",
    },
    "worker-tests": {
      subagentId: "dev.analyzer.tests",
      mode: "worker",
      template: "analyzer",
      batchId: "batch-1",
      parentId: "developer",
      lineage: ["developer", "dev.analyzer.tests"],
      status: "completed",
    },
    "worker-docs": {
      subagentId: "dev.analyzer.docs",
      mode: "worker",
      template: "analyzer",
      batchId: "batch-1",
      parentId: "developer",
      lineage: ["developer", "dev.analyzer.docs"],
      status: "completed",
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 7 — Error
   ═══════════════════════════════════════════════════════════════════════ */
const ERROR_SCENARIO = {
  name: "Error",
  description: "Tool call followed by an error",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "reasoning",
      payload: { reasoning: "Let me fetch the latest deployment status." },
    }),
    f({
      seq: 3,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        tool_name: "fetch_api",
        tool_display_name: "fetch_api",
        arguments: { url: "https://api.example.com/deploy/status" },
      },
    }),
    f({
      seq: 4,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        result: { status: 200, body: '{"state":"deploying"}' },
      },
    }),
    f({
      seq: 5,
      type: "error",
      payload: {
        code: "RATE_LIMIT",
        message:
          "API rate limit exceeded. Please wait 60 seconds before retrying.",
      },
    }),
    f({ seq: 6, type: "done" }),
  ],
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 8 — Code Diff (write tool approval)
   reasoning → tool_call(write + interact_type=code_diff) → await approve
   ═══════════════════════════════════════════════════════════════════════ */
const CODE_DIFF_UNIFIED = (
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
  '+            else "confirmation"\n' +
  "+        )\n" +
  "+        policy_interact_config = (\n" +
  "+            confirmation_policy.interact_config\n" +
  "+            if confirmation_policy is not None\n" +
  "+            else None\n" +
  "+        )\n" +
  "+\n" +
  "         confirmation_request = ToolConfirmationRequest(\n" +
  "             tool_name=tool_call.name,\n" +
  "             call_id=tool_call.call_id,\n"
);

const CODE_DIFF_SCENARIO = {
  name: "Code Diff (write)",
  description: "write tool surfaces a unified diff as the approval UI",
  frames: [
    f({ seq: 1, type: "stream_started" }),
    f({
      seq: 2,
      type: "reasoning",
      payload: {
        reasoning:
          "I need to propagate interact_type / interact_config from the policy onto the confirmation request so the frontend can render the new code_diff UI.",
      },
    }),
    f({
      seq: 3,
      type: "tool_call",
      payload: {
        call_id: "call-1",
        confirmation_id: "confirm-1",
        requires_confirmation: true,
        tool_name: "write",
        tool_display_name: "write",
        description: "Edit src/unchain/tools/confirmation.py",
        interact_type: "code_diff",
        interact_config: {
          title: "Edit src/unchain/tools/confirmation.py",
          operation: "edit",
          path: "src/unchain/tools/confirmation.py",
          unified_diff: CODE_DIFF_UNIFIED,
          truncated: false,
          total_lines: CODE_DIFF_UNIFIED.split("\n").length,
          displayed_lines: CODE_DIFF_UNIFIED.split("\n").length,
          fallback_description: "edit confirmation.py (+14 -0)",
        },
        arguments: {
          path: "src/unchain/tools/confirmation.py",
          content: "<full file content elided>",
        },
      },
    }),
  ],
  onApproveFrames: [
    f({
      seq: 4,
      type: "tool_confirmed",
      payload: { call_id: "call-1" },
      ts: 3500,
    }),
    f({
      seq: 5,
      type: "tool_result",
      payload: {
        call_id: "call-1",
        result: {
          path: "src/unchain/tools/confirmation.py",
          bytes_written: 3412,
          append: false,
        },
      },
      ts: 4000,
    }),
    f({
      seq: 6,
      type: "final_message",
      payload: {
        content:
          "Done — `confirmation.py` now propagates `interact_type` / `interact_config` from the resolved policy onto the request.",
      },
      ts: 4800,
    }),
    f({ seq: 7, type: "done", ts: 5000 }),
  ],
  onDenyFrames: [
    f({
      seq: 4,
      type: "tool_denied",
      payload: { call_id: "call-1" },
      ts: 3500,
    }),
    f({
      seq: 5,
      type: "final_message",
      payload: {
        content:
          "Understood, I'll leave `confirmation.py` alone for now.",
      },
      ts: 4000,
    }),
    f({ seq: 6, type: "done", ts: 4200 }),
  ],
  waitForConfirmation: "confirm-1",
};

/* ═══════════════════════════════════════════════════════════════════════
   Export all scenarios
   ═══════════════════════════════════════════════════════════════════════ */
const TRACE_CHAIN_SCENARIOS = [
  BASIC_FLOW,
  TOOL_CONFIRMATION,
  SELECTION_SINGLE,
  SELECTION_MULTI,
  DELEGATE_SUBAGENT,
  WORKER_BATCH,
  ERROR_SCENARIO,
  CODE_DIFF_SCENARIO,
];

export default TRACE_CHAIN_SCENARIOS;
