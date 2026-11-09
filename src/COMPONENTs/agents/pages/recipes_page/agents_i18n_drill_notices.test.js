import { agentMessage, renderAgentMessage } from "./agents_i18n";
import { drill_blocked_reason, drill_lost_reason, drill_target, hook_drill_target, notices_still_true, open_failed_message, save_target_caption } from "./skeleton_drill";
import { library_unavailable_message, missing_reference_message, read_failure_message } from "./subagent_drill";

const raw = "agents.drill.own {name} · RAW";
const t = (key, vars) => `T:${key}:${JSON.stringify(vars || {})}`;
test("native Agent/Hook target classification never changes with the reason translator", () => {
  const entries = [null, {}, { source: { kind: "agent_ref", agent_id: raw } }, { source: { kind: "agent_ref", agent_id: "" } },
    { source: { kind: raw } }, { source: { kind: "embedded", document: { kind: "workflow", nodes: [], edges: [] } } },
    { source: { kind: "embedded", document: { kind: "agent", nodes: false, edges: [] } } }];
  for (const entry of entries) {
    const before = JSON.stringify(entry); const english = drill_target(entry); const translated = drill_target(entry, t);
    expect({ ...translated, reason: english.reason }).toEqual({ ...english, reason: english.reason });
    expect(translated.reason).toEqual(english.reason ? expect.stringMatching(/^T:/) : english.reason);
    expect(JSON.stringify(entry)).toBe(before);
  }
  for (const workflow of [undefined, { kind: "pinned" }, { kind: "embedded", document: false }, { kind: "embedded", document: { kind: "agent" } },
    { kind: "embedded", document: { kind: "workflow", nodes: [], edges: [] } }]) {
    const entry = { workflow }; const english = hook_drill_target(entry); const translated = hook_drill_target(entry, t);
    expect(translated.kind).toBe(english.kind);
    expect(translated.reason).toEqual(english.reason ? expect.stringMatching(/^T:/) : english.reason);
  }
});
test("owned open/read/save captions retain opaque author/error slots as presentation records", () => {
  for (const notice of [open_failed_message(raw, { message: raw }, agentMessage), save_target_caption(raw, agentMessage),
    library_unavailable_message({ message: raw }, agentMessage), missing_reference_message(raw, agentMessage), read_failure_message(raw, { message: raw }, agentMessage)]) {
    expect(renderAgentMessage(notice, t)).toContain("T:agents.drill.");
    expect(renderAgentMessage(notice, t)).toContain(raw);
  }
});
test("fixed lost/write notices keep stable identity and stop claiming a write is in flight after it lands", () => {
  const blocked = drill_blocked_reason({ saving: true }, agentMessage);
  expect(blocked).toBe(drill_blocked_reason({ saving: true }, agentMessage));
  expect(renderAgentMessage(blocked, t)).toContain("T:agents.drill.");
  expect(notices_still_true([blocked, raw], { saving: false })).toEqual([raw]);
  const steps = [{ node_id: "missing", entry_id: "missing", taken_in: 0 }];
  const document = { nodes: [], edges: [] };
  const lost = drill_lost_reason(document, steps, 0, agentMessage);
  expect(lost).toBe(drill_lost_reason(document, steps, 0, agentMessage));
  expect(renderAgentMessage(lost, t)).toContain("T:agents.drill.");
});
