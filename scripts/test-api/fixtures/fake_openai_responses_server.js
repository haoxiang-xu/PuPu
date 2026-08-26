#!/usr/bin/env node
"use strict";

const { createHash } = require("node:crypto");
const { appendFileSync, mkdirSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  CHILD_MAX_PROBE_ITERATIONS,
  CHILD_TARGETS,
  MARKER,
  REQUIRED_ROOT_PHASES,
} = require("../deterministic-soak-lib.cjs");
const {
  AGENT_LONG_RUN_PHASE,
  buildAgentLongRunTool,
  parseAgentLongRunMarker,
} = require("../single-agent-long-run-lib.cjs");

const WAIT_MILLISECONDS = 65000;
const GATE_CHECKPOINT = "durable-pause";
const PROGRESS_CHECKPOINT = "steady-progress";
const FAIL_ONCE_KEY = "fixed-fail-once";
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MESSAGE_INPUT_ITEM_FIELDS = new Set([
  "content",
  "phase",
  "role",
  "status",
  "type",
]);
const ASSISTANT_MESSAGE_INPUT_ITEM_FIELDS = new Set([
  ...MESSAGE_INPUT_ITEM_FIELDS,
  "id",
]);
const MESSAGE_ROLES = new Set(["assistant", "developer", "system", "user"]);
const VALID_LANES = new Set(["A", "B", "C"]);
const PHASE_ALIASES = Object.freeze({
  coding: "probe",
  mcp: "checkpoint",
  sleep: "wait",
  web: "probe",
});
const VALID_PHASES = new Set([...REQUIRED_ROOT_PHASES, AGENT_LONG_RUN_PHASE]);
const CHILD_SCENARIO_BY_PHASE = Object.freeze({
  multiagent: "happy",
  "child-question": "question",
  "child-approval": "approval",
  "child-max": "max",
});

const stableCopy = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => stableCopy(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableCopy(value[key])]),
  );
};

const stableStringify = (value) => JSON.stringify(stableCopy(value));

const digest = (value) =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

const normalizeIteration = (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1000000) {
    return null;
  }
  return parsed;
};

const stringsFromValue = (value, output = []) => {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) stringsFromValue(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringsFromValue(item, output);
  }
  return output;
};

const itemText = (item) => stringsFromValue(item, []).join("\n");

const inputItems = (body) =>
  Array.isArray(body?.input)
    ? body.input
    : body?.input == null
      ? []
      : [body.input];

const validateResponseInputItems = (body) => {
  inputItems(body).forEach((item, index) => {
    if (!item || Array.isArray(item) || typeof item !== "object") return;
    const isMessage =
      item.type === "message" ||
      (typeof item.role === "string" && MESSAGE_ROLES.has(item.role));
    if (!isMessage) return;

    const allowedFields =
      item.role === "assistant"
        ? ASSISTANT_MESSAGE_INPUT_ITEM_FIELDS
        : MESSAGE_INPUT_ITEM_FIELDS;
    const unknown = Object.keys(item)
      .filter((key) => !allowedFields.has(key))
      .sort();
    if (!unknown.length) return;

    const param = `input[${index}].${unknown[0]}`;
    throw Object.assign(new Error(`Unknown parameter: '${param}'.`), {
      status: 400,
      type: "invalid_request_error",
      param,
      code: "unknown_parameter",
    });
  });
};

const latestUserText = (body) => {
  const items = inputItems(body);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item && typeof item === "object" && item.role === "user") {
      return itemText(item);
    }
  }
  return items.length ? itemText(items[items.length - 1]) : "";
};

const parseLaneMarker = (text, prefix) => {
  const match = String(text || "").match(
    new RegExp(
      `(?:^|[^A-Za-z0-9_-])${prefix}\\s+lane=([ABC])(?=$|[^A-Za-z0-9_-])`,
    ),
  );
  return match ? match[1] : "";
};

const parseLatestUserLaneMarker = (body, prefix) => {
  const items = inputItems(body);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || typeof item !== "object" || item.role !== "user") continue;
    const lane = parseLaneMarker(itemText(item), prefix);
    if (lane) return { lane, itemIndex: index };
  }
  return null;
};

const isDirectLatestUserLaneMarker = (body, prefix, lane) =>
  new RegExp(`(?:^|\\n)${prefix}\\s+lane=${lane}\\s*$`).test(
    latestUserText(body),
  );

const parseChildMarker = (body) => {
  const items = inputItems(body);
  let found = null;
  const canonical =
    /SOAK_CHILD\|scenario=(happy|question|approval|max)\|lane=([ABC])\|target=(soak-explore-[abc])/g;
  items.forEach((item, itemIndex) => {
    if (!item || typeof item !== "object" || item.role !== "user") return;
    const text = itemText(item);
    for (const match of text.matchAll(canonical)) {
      if (!CHILD_TARGETS.includes(match[3])) continue;
      found = {
        scenario: match[1],
        lane: match[2],
        target: match[3],
        itemIndex,
      };
    }
  });
  if (found) return found;

  const legacy = latestUserText(body).match(
    /(?:^|[^A-Za-z0-9_-])SOAK_CHILD\s+target=(soak-explore-[abc])(?=$|[^A-Za-z0-9_-])/,
  );
  return legacy
    ? {
        scenario: "happy",
        lane: "A",
        target: legacy[1],
        itemIndex: Math.max(0, items.length - 1),
      }
    : null;
};

const parseRootMarker = (body) => {
  const items = inputItems(body);
  let found = null;
  const pattern = /SOAK\|lane=([ABC])\|phase=([a-z-]+)\|iteration=([0-9]+)/g;

  items.forEach((item, itemIndex) => {
    const text = itemText(item);
    for (const match of text.matchAll(pattern)) {
      const rawPhase = match[2];
      const phase = PHASE_ALIASES[rawPhase] || rawPhase;
      const iteration = normalizeIteration(match[3]);
      if (!VALID_LANES.has(match[1]) || !VALID_PHASES.has(phase)) continue;
      if (iteration == null) continue;
      found = {
        lane: match[1],
        phase,
        requestedPhase: rawPhase,
        iteration,
        itemIndex,
      };
    }
  });
  return found;
};

const parseAgentLongRunScenario = (body) => {
  const items = inputItems(body);
  let found = null;
  items.forEach((item, itemIndex) => {
    if (!item || typeof item !== "object" || item.role !== "user") return;
    const parsed = parseAgentLongRunMarker(itemText(item));
    if (!parsed) return;
    found = {
      ...parsed,
      phase: AGENT_LONG_RUN_PHASE,
      requestedPhase: AGENT_LONG_RUN_PHASE,
      itemIndex,
    };
  });
  return found;
};

const hasFunctionCallOutputAfter = (body, itemIndex) =>
  inputItems(body).some(
    (item, index) =>
      index > itemIndex &&
      item &&
      typeof item === "object" &&
      item.type === "function_call_output",
  );

const latestFunctionCallOutputIndex = (body) => {
  const items = inputItems(body);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.type === "function_call_output") return index;
  }
  return -1;
};

const phaseToken = (phase) => String(phase || "").replaceAll("-", "_");
const decodeResponseIdentity = (responseId) => {
  const match = String(responseId || "").match(
    /^resp_pupu_([ABC])_([a-z_]+)_([0-9]+)_(tool|final)_[a-f0-9]{16}$/,
  );
  if (!match) return null;
  const phase = match[2].replaceAll("_", "-");
  const iteration = normalizeIteration(match[3]);
  if (!VALID_PHASES.has(phase) || iteration == null) return null;
  return {
    lane: match[1],
    phase,
    requestedPhase: phase,
    iteration,
    responseKind: match[4],
    itemIndex: -1,
  };
};

const decodeToolCallIdentity = (body) => {
  const items = inputItems(body);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const callId = String(items[index]?.call_id || "");
    const match = callId.match(
      /^call_pupu_([ABC])_([a-z_]+)_([0-9]+)_[a-f0-9]{12}$/,
    );
    if (!match) continue;
    const phase = match[2].replaceAll("_", "-");
    const iteration = normalizeIteration(match[3]);
    if (!VALID_PHASES.has(phase) || iteration == null) continue;
    return {
      lane: match[1],
      phase,
      requestedPhase: phase,
      iteration,
      responseKind: "tool",
      itemIndex: -1,
    };
  }
  return null;
};

const responseIdentity = ({ lane, phase, iteration }, kind, requestDigest) =>
  `resp_pupu_${lane}_${phaseToken(phase)}_${iteration}_${kind}_${requestDigest.slice(0, 16)}`;

const childMarker = ({ scenario, lane, target }) =>
  `SOAK_CHILD|scenario=${scenario}|lane=${lane}|target=${target}`;

const childExpectedOutput = ({ scenario, lane, target }) => {
  if (scenario === "happy") {
    return `SOAK_CHILD_OK lane=${lane} target=${target}`;
  }
  if (scenario === "question") {
    return `needs_clarification lane=${lane} target=${target}`;
  }
  if (scenario === "approval") {
    return `SOAK_CHILD_APPROVAL_OK lane=${lane} target=${target} reason=subagent_tool_approval_unsupported`;
  }
  return `max_iterations lane=${lane} target=${target}`;
};

const fixedWorkerBatch = ({ lane, phase }) => {
  const scenario = CHILD_SCENARIO_BY_PHASE[phase];
  if (!scenario) return null;
  return {
    name: "spawn_worker_batch",
    arguments: {
      tasks: CHILD_TARGETS.map((target) => ({
        target,
        task: childMarker({ scenario, lane, target }),
        instructions:
          "Follow only the addressed deterministic SOAK_CHILD scenario.",
        expected_output: childExpectedOutput({ scenario, lane, target }),
        output_mode: "last_message",
      })),
      aggregate_mode: "ordered_list",
    },
  };
};

const fixedToolCall = ({ lane, phase, iteration }) => {
  if (phase === "wait") {
    return {
      name: "soak_wait",
      arguments: { lane, milliseconds: WAIT_MILLISECONDS, marker: MARKER },
    };
  }
  if (phase === "gate") {
    return {
      name: "soak_gate",
      arguments: { lane, checkpoint: GATE_CHECKPOINT, marker: MARKER },
    };
  }
  if (phase === "fail-once") {
    return {
      name: "soak_fail_once",
      arguments: { lane, key: FAIL_ONCE_KEY, marker: MARKER },
    };
  }
  if (phase === "checkpoint") {
    return {
      name: "soak_checkpoint",
      arguments: {
        lane,
        checkpoint: PROGRESS_CHECKPOINT,
        iteration,
        marker: MARKER,
      },
    };
  }
  const workerBatch = fixedWorkerBatch({ lane, phase });
  if (workerBatch) return workerBatch;
  return {
    name: "soak_probe",
    arguments: { lane, iteration, marker: MARKER },
  };
};

const requestedToolNames = (body) =>
  new Set(
    (Array.isArray(body?.tools) ? body.tools : [])
      .map((tool) => (tool && typeof tool.name === "string" ? tool.name : ""))
      .filter(Boolean),
  );

const usage = Object.freeze({
  input_tokens: 1,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 1,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 2,
});

const baseResponse = ({ id, model, output, status = "completed" }) => ({
  id,
  object: "response",
  created_at: 0,
  status,
  background: false,
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: null,
  max_tool_calls: null,
  model,
  output,
  parallel_tool_calls: true,
  previous_response_id: null,
  prompt_cache_key: null,
  reasoning: { effort: null, summary: null },
  safety_identifier: null,
  service_tier: "default",
  store: true,
  temperature: null,
  text: { format: { type: "text" }, verbosity: "medium" },
  tool_choice: "auto",
  tools: [],
  top_logprobs: 0,
  top_p: null,
  truncation: "disabled",
  usage: status === "completed" ? usage : null,
});

const textOutputItem = (id, text, status = "completed") => ({
  id,
  type: "message",
  status,
  role: "assistant",
  content:
    status === "completed"
      ? [{ type: "output_text", annotations: [], logprobs: [], text }]
      : [],
});

const toolOutputItem = (
  { id, callId, name, argumentText },
  status = "completed",
) => ({
  id,
  type: "function_call",
  status,
  arguments: status === "completed" ? argumentText : "",
  call_id: callId,
  name,
});

const textEvents = ({ response, text, itemId }) => {
  const pending = baseResponse({
    id: response.id,
    model: response.model,
    output: [],
    status: "in_progress",
  });
  const inProgressItem = textOutputItem(itemId, "", "in_progress");
  const completedItem = response.output[0];
  const completedPart = completedItem.content[0];
  return [
    { type: "response.created", sequence_number: 0, response: pending },
    {
      type: "response.in_progress",
      sequence_number: 1,
      response: pending,
    },
    {
      type: "response.output_item.added",
      sequence_number: 2,
      output_index: 0,
      item: inProgressItem,
    },
    {
      type: "response.content_part.added",
      sequence_number: 3,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", annotations: [], logprobs: [], text: "" },
    },
    {
      type: "response.output_text.delta",
      sequence_number: 4,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: text,
      logprobs: [],
    },
    {
      type: "response.output_text.done",
      sequence_number: 5,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      text,
      logprobs: [],
    },
    {
      type: "response.content_part.done",
      sequence_number: 6,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: completedPart,
    },
    {
      type: "response.output_item.done",
      sequence_number: 7,
      output_index: 0,
      item: completedItem,
    },
    {
      type: "response.completed",
      sequence_number: 8,
      response,
    },
  ];
};

const toolEvents = ({ response, itemId, callId, name, argumentText }) => {
  const pending = baseResponse({
    id: response.id,
    model: response.model,
    output: [],
    status: "in_progress",
  });
  const inProgressItem = toolOutputItem(
    { id: itemId, callId, name, argumentText },
    "in_progress",
  );
  const completedItem = response.output[0];
  return [
    { type: "response.created", sequence_number: 0, response: pending },
    {
      type: "response.in_progress",
      sequence_number: 1,
      response: pending,
    },
    {
      type: "response.output_item.added",
      sequence_number: 2,
      output_index: 0,
      item: inProgressItem,
    },
    {
      type: "response.function_call_arguments.delta",
      sequence_number: 3,
      item_id: itemId,
      output_index: 0,
      delta: argumentText,
    },
    {
      type: "response.function_call_arguments.done",
      sequence_number: 4,
      item_id: itemId,
      output_index: 0,
      name,
      arguments: argumentText,
    },
    {
      type: "response.output_item.done",
      sequence_number: 5,
      output_index: 0,
      item: completedItem,
    },
    {
      type: "response.completed",
      sequence_number: 6,
      response,
    },
  ];
};

const serializeSse = (events) =>
  `${events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;

const directTextPlan = (
  body,
  text,
  label,
  { scenario = null, child = null, childOutcome = "" } = {},
) => ({
  kind: "text",
  text,
  label,
  body,
  scenario,
  child,
  childOutcome,
});

const childPlanScenario = (child) => ({
  lane: child.lane,
  phase: child.scenario === "happy" ? "multiagent" : `child-${child.scenario}`,
  iteration: CHILD_MAX_PROBE_ITERATIONS[child.target],
  itemIndex: child.itemIndex,
});

const toolPlan = ({ body, tool, label, scenario, child = null }) => {
  const advertisedTools = requestedToolNames(body);
  if (advertisedTools.size > 0 && !advertisedTools.has(tool.name)) {
    return directTextPlan(
      body,
      `SOAK_FIXTURE_MISSING_TOOL name=${tool.name}`,
      "missing-tool",
      { scenario, child, childOutcome: "missing-tool" },
    );
  }
  return {
    kind: "tool",
    tool,
    label,
    body,
    scenario,
    child,
    childOutcome: "",
  };
};

const planChildResponse = (body, child) => {
  const scenario = childPlanScenario(child);
  const hasToolResult = hasFunctionCallOutputAfter(body, child.itemIndex);
  if (child.scenario === "happy") {
    return directTextPlan(
      body,
      childExpectedOutput(child),
      "multiagent-child",
      { scenario, child, childOutcome: "completed" },
    );
  }
  if (child.scenario === "question") {
    if (hasToolResult) {
      return directTextPlan(
        body,
        `SOAK_CHILD_QUESTION_UNEXPECTED_RESUME lane=${child.lane} target=${child.target}`,
        "multiagent-child-question-unexpected-resume",
        { scenario, child, childOutcome: "unexpected_resume" },
      );
    }
    return toolPlan({
      body,
      tool: {
        name: "ask_user_question",
        arguments: {
          title: "Deterministic child clarification",
          question: childMarker(child),
          selection_mode: "single",
          options: [
            { label: "Continue", value: "continue" },
            { label: "Stop", value: "stop" },
          ],
        },
      },
      label: "multiagent-child-question-tool",
      scenario,
      child,
    });
  }
  if (child.scenario === "approval") {
    if (!hasToolResult) {
      return toolPlan({
        body,
        tool: {
          name: "soak_gate",
          arguments: {
            lane: child.lane,
            checkpoint: GATE_CHECKPOINT,
            marker: MARKER,
          },
        },
        label: "multiagent-child-approval-tool",
        scenario,
        child,
      });
    }
    const deniedReason = stringsFromValue(body?.input, []).some((value) =>
      value.includes("subagent_tool_approval_unsupported"),
    );
    return directTextPlan(
      body,
      deniedReason
        ? childExpectedOutput(child)
        : `SOAK_CHILD_APPROVAL_FAILED lane=${child.lane} target=${child.target}`,
      "multiagent-child-approval-final",
      {
        scenario,
        child,
        childOutcome: deniedReason
          ? "subagent_tool_approval_unsupported"
          : "approval_not_fail_closed",
      },
    );
  }
  return toolPlan({
    body,
    tool: {
      name: "soak_probe",
      arguments: {
        lane: child.lane,
        iteration: CHILD_MAX_PROBE_ITERATIONS[child.target],
        marker: MARKER,
      },
    },
    label: "multiagent-child-max-tool",
    scenario,
    child,
  });
};

const findWorkerBatchResults = (value) => {
  if (typeof value === "string") {
    try {
      return findWorkerBatchResults(JSON.parse(value));
    } catch (_) {
      return null;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findWorkerBatchResults(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  if (value.mode === "worker_batch" && Array.isArray(value.results)) {
    return value.results;
  }
  for (const nested of Object.values(value)) {
    const found = findWorkerBatchResults(nested);
    if (found) return found;
  }
  return null;
};

const classifyChildBatchOutcome = (body, rootScenario) => {
  const childScenario = CHILD_SCENARIO_BY_PHASE[rootScenario.phase];
  if (!childScenario) return "";
  let results = null;
  const items = inputItems(body);
  for (
    let index = items.length - 1;
    index > rootScenario.itemIndex;
    index -= 1
  ) {
    const item = items[index];
    if (!item || item.type !== "function_call_output") continue;
    results = findWorkerBatchResults(item.output);
    if (results) break;
  }
  if (!Array.isArray(results)) return "invalid:0";

  let matched = 0;
  for (const target of CHILD_TARGETS) {
    const result = results.find(
      (entry) => entry && entry.template_name === target,
    );
    if (!result) continue;
    const serialized = stableStringify(result);
    if (
      childScenario === "happy" &&
      result.status === "completed" &&
      serialized.includes(
        `SOAK_CHILD_OK lane=${rootScenario.lane} target=${target}`,
      )
    ) {
      matched += 1;
    } else if (
      childScenario === "question" &&
      result.status === "needs_clarification" &&
      serialized.includes(
        childMarker({
          scenario: "question",
          lane: rootScenario.lane,
          target,
        }),
      )
    ) {
      matched += 1;
    } else if (
      childScenario === "approval" &&
      result.status === "completed" &&
      serialized.includes(
        `SOAK_CHILD_APPROVAL_OK lane=${rootScenario.lane} target=${target} reason=subagent_tool_approval_unsupported`,
      )
    ) {
      matched += 1;
    } else if (childScenario === "max" && result.status === "max_iterations") {
      matched += 1;
    }
  }
  if (matched !== CHILD_TARGETS.length) return `invalid:${matched}`;
  if (childScenario === "happy") return `completed:${matched}`;
  if (childScenario === "question") return `needs_clarification:${matched}`;
  if (childScenario === "approval") {
    return `subagent_tool_approval_unsupported:${matched}`;
  }
  return `max_iterations:${matched}`;
};

const planResponse = (body = {}) => {
  const queueMarker = parseLatestUserLaneMarker(body, "SOAK_QUEUE");
  const btwMarker = parseLatestUserLaneMarker(body, "SOAK_BTW");
  const child = parseChildMarker(body);
  if (child) return planChildResponse(body, child);

  const agentLongRun = parseAgentLongRunScenario(body);
  if (agentLongRun) {
    const completedRootTools = inputItems(body).filter(
      (item, index) =>
        index > agentLongRun.itemIndex &&
        item &&
        typeof item === "object" &&
        item.type === "function_call_output",
    ).length;
    const scenario = {
      ...agentLongRun,
      iteration: completedRootTools,
    };
    if (completedRootTools >= agentLongRun.rootToolCalls) {
      const sawFyi = stringsFromValue(body?.input, []).some((value) =>
        value.includes(`AGENT_LONG_RUN_FYI lane=${agentLongRun.lane}`),
      );
      return directTextPlan(
        body,
        [
          `AGENT_LONG_RUN_OK lane=${agentLongRun.lane}`,
          `root_tool_calls=${agentLongRun.rootToolCalls}`,
          `saw_fyi=${sawFyi}`,
        ].join(" "),
        "agent-long-root-final",
        { scenario },
      );
    }
    return toolPlan({
      body,
      scenario,
      tool: buildAgentLongRunTool({
        lane: agentLongRun.lane,
        step: completedRootTools,
        rootToolCalls: agentLongRun.rootToolCalls,
      }),
      label: "agent-long-root-tool",
    });
  }

  let scenario = parseRootMarker(body);
  let hasToolResult = false;
  if (scenario) {
    hasToolResult = hasFunctionCallOutputAfter(body, scenario.itemIndex);
  } else {
    scenario =
      decodeResponseIdentity(body?.previous_response_id) ||
      decodeToolCallIdentity(body);
    if (
      scenario &&
      scenario.responseKind === "tool" &&
      scenario.phase.startsWith("child-")
    ) {
      const target = Object.entries(CHILD_MAX_PROBE_ITERATIONS).find(
        ([, iteration]) => iteration === scenario.iteration,
      )?.[0];
      if (target) {
        return planChildResponse(body, {
          scenario: scenario.phase.slice("child-".length),
          lane: scenario.lane,
          target,
          itemIndex: -1,
        });
      }
    }
    hasToolResult = Boolean(
      scenario &&
      scenario.responseKind === "tool" &&
      inputItems(body).some(
        (item) =>
          item &&
          typeof item === "object" &&
          item.type === "function_call_output",
      ),
    );
  }

  const latestToolResultIndex = latestFunctionCallOutputIndex(body);
  const isQueuedSuccessor = Boolean(
    queueMarker &&
      queueMarker.itemIndex > latestToolResultIndex &&
      (!scenario ||
        !Number.isInteger(scenario.itemIndex) ||
        queueMarker.itemIndex > scenario.itemIndex),
  );
  if (isQueuedSuccessor) {
    return directTextPlan(
      body,
      `SOAK_QUEUE_OK lane=${queueMarker.lane}`,
      "queue",
    );
  }
  if (
    btwMarker &&
    (!scenario ||
      isDirectLatestUserLaneMarker(body, "SOAK_BTW", btwMarker.lane))
  ) {
    return directTextPlan(body, `SOAK_BTW_OK lane=${btwMarker.lane}`, "btw");
  }

  if (!scenario) {
    return directTextPlan(body, "SOAK_FIXTURE_OK", "default");
  }
  if (hasToolResult) {
    const childOutcome = classifyChildBatchOutcome(body, scenario);
    return {
      kind: "text",
      text: [
        `SOAK_OK lane=${scenario.lane} phase=${scenario.phase} iteration=${scenario.iteration}`,
        childOutcome ? `child_outcome=${childOutcome}` : "",
      ]
        .filter(Boolean)
        .join(" "),
      label: "root-final",
      body,
      scenario,
      child: null,
      childOutcome,
    };
  }

  const tool = fixedToolCall(scenario);
  return toolPlan({
    body,
    scenario,
    tool,
    label: "root-tool",
  });
};

const buildResponseEnvelope = (body = {}) => {
  const normalizedBody = body && typeof body === "object" ? body : {};
  validateResponseInputItems(normalizedBody);
  const plan = planResponse(normalizedBody);
  const requestDigest = digest(normalizedBody);
  const model =
    typeof normalizedBody.model === "string" && normalizedBody.model
      ? normalizedBody.model
      : "pupu-fake-responses-v1";
  const scenario = plan.scenario || {
    lane: "A",
    phase: "steady",
    iteration: 0,
  };
  const kind = plan.kind === "tool" ? "tool" : "final";
  const responseId = responseIdentity(scenario, kind, requestDigest);
  const itemDigest = digest({ requestDigest, kind, label: plan.label });

  if (plan.kind === "tool") {
    const itemId = `fc_pupu_${itemDigest.slice(0, 20)}`;
    const callId = `call_pupu_${scenario.lane}_${phaseToken(
      scenario.phase,
    )}_${scenario.iteration}_${itemDigest.slice(0, 12)}`;
    const argumentText = stableStringify(plan.tool.arguments);
    const item = toolOutputItem({
      id: itemId,
      callId,
      name: plan.tool.name,
      argumentText,
    });
    const response = baseResponse({ id: responseId, model, output: [item] });
    return {
      plan,
      requestDigest,
      response,
      events: toolEvents({
        response,
        itemId,
        callId,
        name: plan.tool.name,
        argumentText,
      }),
    };
  }

  const itemId = `msg_pupu_${itemDigest.slice(0, 20)}`;
  const item = textOutputItem(itemId, plan.text);
  const response = baseResponse({ id: responseId, model, output: [item] });
  return {
    plan,
    requestDigest,
    response,
    events: textEvents({ response, text: plan.text, itemId }),
  };
};

const sendJson = (response, status, payload) => {
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
};

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_REQUEST_BYTES) {
        reject(
          Object.assign(new Error("request body too large"), { status: 413 }),
        );
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(
          Object.assign(new Error("invalid JSON request body"), {
            status: 400,
          }),
        );
      }
    });
    request.on("error", reject);
  });

const functionOutputPreviews = (body) =>
  inputItems(body)
    .filter((item) => item && item.type === "function_call_output")
    .map((item) => {
      const serialized =
        typeof item.output === "string"
          ? item.output
          : stableStringify(item.output);
      return serialized.slice(0, 4000);
    });

const auditRecord = (ordinal, requestUrl, envelope) => ({
  ordinal,
  route: requestUrl,
  request_digest: envelope.requestDigest,
  response_id: envelope.response.id,
  response_kind: envelope.plan.kind,
  label: envelope.plan.label,
  lane:
    envelope.plan.scenario?.lane ||
    String(envelope.plan.text || "").match(/\blane=([ABC])\b/)?.[1] ||
    "",
  phase: envelope.plan.scenario?.phase || "",
  iteration: envelope.plan.scenario?.iteration ?? null,
  root_tool_calls: envelope.plan.scenario?.rootToolCalls ?? null,
  tool_name: envelope.plan.tool?.name || "",
  direct_target:
    envelope.plan.child?.target ||
    String(envelope.plan.text || "").match(
      /\btarget=(soak-explore-[abc])\b/,
    )?.[1] ||
    "",
  child_scenario: envelope.plan.child?.scenario || "",
  child_outcome: envelope.plan.childOutcome || "",
  latest_user_preview: latestUserText(envelope.plan.body).slice(0, 1200),
  has_function_call_output:
    latestFunctionCallOutputIndex(envelope.plan.body) >= 0,
  saw_fyi: stringsFromValue(envelope.plan.body?.input, []).some(
    (value) =>
      value.includes("SOAK_FYI") ||
      value.includes("AGENT_LONG_RUN_FYI"),
  ),
  ...(latestFunctionCallOutputIndex(envelope.plan.body) >= 0
    ? { function_output_previews: functionOutputPreviews(envelope.plan.body) }
    : {}),
});

const normalizeHostForUrl = (host) =>
  String(host).includes(":") && !String(host).startsWith("[")
    ? `[${host}]`
    : host;

const createFakeOpenAIResponsesServer = ({
  host = "127.0.0.1",
  port = 0,
  auditPath = "",
} = {}) => {
  let server = null;
  let baseUrl = "";
  let ordinal = 0;
  const requests = [];

  const appendAudit = (record) => {
    if (!auditPath) return;
    const resolved = path.resolve(auditPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    appendFileSync(resolved, `${stableStringify(record)}\n`, "utf8");
  };

  const handler = async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://fixture.local");
    if (request.method === "GET" && requestUrl.pathname === "/health") {
      sendJson(response, 200, { ok: true, fixture: "pupu-fake-responses-v1" });
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/v1/models") {
      sendJson(response, 200, {
        object: "list",
        data: [
          {
            id: "pupu-fake-responses-v1",
            object: "model",
            created: 0,
            owned_by: "pupu-test",
          },
        ],
      });
      return;
    }
    if (
      request.method !== "POST" ||
      !["/responses", "/v1/responses"].includes(requestUrl.pathname)
    ) {
      sendJson(response, 404, {
        error: { type: "not_found", message: "fixture route not found" },
      });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const envelope = buildResponseEnvelope(body);
      ordinal += 1;
      const record = auditRecord(ordinal, requestUrl.pathname, envelope);
      requests.push({ body: stableCopy(body), ...record });
      appendAudit(record);

      if (body.stream === true) {
        const sse = serializeSse(envelope.events);
        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        response.end(sse);
        return;
      }
      sendJson(response, 200, envelope.response);
    } catch (error) {
      if (response.headersSent || response.destroyed) return;
      sendJson(response, Number(error?.status || 500), {
        error: {
          type:
            error?.type ||
            (Number(error?.status) === 400
              ? "invalid_request_error"
              : "server_error"),
          message: String(error?.message || "fixture request failed"),
          ...(error?.param ? { param: error.param } : {}),
          ...(error?.code ? { code: error.code } : {}),
        },
      });
    }
  };

  return {
    get baseUrl() {
      return baseUrl;
    },
    get requests() {
      return requests.map((entry) => stableCopy(entry));
    },
    async start() {
      if (server) return { baseUrl, host, port: server.address().port };
      server = http.createServer(handler);
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      const address = server.address();
      const actualPort =
        typeof address === "object" && address ? address.port : port;
      baseUrl = `http://${normalizeHostForUrl(host)}:${actualPort}/v1`;
      return { baseUrl, host, port: actualPort };
    },
    async stop() {
      if (!server) return;
      const active = server;
      server = null;
      await new Promise((resolve, reject) =>
        active.close((error) => (error ? reject(error) : resolve())),
      );
      baseUrl = "";
    },
  };
};

const parseCliArgs = (argv) => {
  const options = {
    host: process.env.PUPU_FAKE_LLM_HOST || "127.0.0.1",
    port: Number(process.env.PUPU_FAKE_LLM_PORT || 0),
    auditPath: process.env.PUPU_FAKE_LLM_AUDIT_PATH || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!["--host", "--port", "--audit"].includes(arg)) {
      throw new Error(`unknown argument: ${arg}`);
    }
    const value = argv[index + 1];
    if (value == null || value === "") {
      throw new Error(`${arg} requires a value`);
    }
    index += 1;
    if (arg === "--host") options.host = value;
    if (arg === "--port") options.port = Number(value);
    if (arg === "--audit") options.auditPath = value;
  }
  if (
    !Number.isInteger(options.port) ||
    options.port < 0 ||
    options.port > 65535
  ) {
    throw new Error("--port must be an integer from 0 to 65535");
  }
  return options;
};

const runCli = async () => {
  const fixture = createFakeOpenAIResponsesServer(
    parseCliArgs(process.argv.slice(2)),
  );
  const ready = await fixture.start();
  process.stdout.write(
    `${JSON.stringify({ ready: true, base_url: ready.baseUrl })}\n`,
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await fixture.stop();
      process.exitCode = 0;
    } catch (error) {
      process.stderr.write(`${String(error?.stack || error)}\n`);
      process.exitCode = 1;
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
};

module.exports = {
  FAIL_ONCE_KEY,
  GATE_CHECKPOINT,
  MARKER,
  PROGRESS_CHECKPOINT,
  WAIT_MILLISECONDS,
  buildResponseEnvelope,
  createFakeOpenAIResponsesServer,
  fixedToolCall,
  parseCliArgs,
  planResponse,
  serializeSse,
  stableStringify,
  validateResponseInputItems,
};

if (require.main === module) {
  runCli().catch((error) => {
    process.stderr.write(`${String(error?.stack || error)}\n`);
    process.exitCode = 1;
  });
}
