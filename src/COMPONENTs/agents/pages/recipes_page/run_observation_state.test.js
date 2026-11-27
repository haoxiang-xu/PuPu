import completed from "./__fixtures__/run_observation/test_real_route_observes_compl0--producer-observation-completed.json";
import waiting from "./__fixtures__/run_observation/test_real_route_receipt_record0--producer-observation-approval-0.json";
import receipt from "./__fixtures__/run_observation/test_real_route_receipt_record0--producer-observation-receipt-0.json";
import hookWait from "./__fixtures__/run_observation/test_real_native_subagent_and_1--producer-projection-embedded_hook.json";
import hookReceipt from "./__fixtures__/run_observation/test_real_native_subagent_and_1--producer-projection-hook-upstream-receipt.json";
import { accept_run_observation, observation_finished } from "./run_observation_state";

const copy = (value) => JSON.parse(JSON.stringify(value));
const scope = { owner_chat_id: "production-chat", execution_id: "view-wait-session", resource_id: "production-agent" };
const finishedScope = { ...scope, execution_id: "view-session" };

test("accepts exact real producer scope, then pins the root and generation", () => {
  expect(accept_run_observation(null, waiting.run, scope)).toEqual({ ok: true, run: waiting.run });
  const other = { ...receipt.run, root_run_id: "other" };
  expect(accept_run_observation(waiting.run, other, scope).error).toBe("run_identity_changed");
  expect(accept_run_observation(waiting.run, { ...receipt.run, generation_id: "other" }, scope).error).toBe("run_identity_changed");
  expect(accept_run_observation(null, completed.run, scope).error).toBe("run_scope_mismatch");
});

test("a canonical approval receipt advances the prefix without changing the graph event", () => {
  expect(receipt.run.high_watermark).toBeGreaterThan(waiting.run.high_watermark);
  expect(receipt.run.graphs[0].revision).toBe(waiting.run.graphs[0].revision);
  expect(receipt.run.graphs[0].event_id).toBe(waiting.run.graphs[0].event_id);
  expect(accept_run_observation(waiting.run, receipt.run, scope).ok).toBe(true);
  expect(accept_run_observation(receipt.run, waiting.run, scope).error).toBe("older_observation");
});

test("equal prefix accepts semantic key reordering, refuses contradictory state", () => {
  const reordered = Object.fromEntries(Object.entries(waiting.run).reverse());
  expect(accept_run_observation(waiting.run, reordered, scope).ok).toBe(true);
  const altered = copy(waiting.run);
  altered.graphs[0].nodes[0].state = "failed";
  expect(accept_run_observation(waiting.run, altered, scope).error).toBe("observation_conflict");
});

test.each(["revision", "store_seq", "event_id", "document", "definition_digest"])("protects graph continuity: %s", (field) => {
  const altered = copy(receipt.run);
  if (field === "document") altered.graphs[0].document.name = "edited B";
  else if (field === "definition_digest" || field === "event_id") altered.graphs[0][field] = "different";
  else altered.graphs[0][field] -= 1;
  expect(accept_run_observation(waiting.run, altered, scope).ok).toBe(false);
});

test("known absence differs from a pinned run disappearing; a missing graph is refused", () => {
  expect(accept_run_observation(null, null, scope)).toEqual({ ok: true, run: null });
  expect(accept_run_observation(waiting.run, null, scope).error).toBe("run_disappeared");
  expect(accept_run_observation(waiting.run, { ...receipt.run, graphs: [] }, scope).error).toBe("graph_disappeared");
});

test("completed graph needs root commit; another child's unresolved state keeps polling", () => {
  expect(observation_finished(completed.run)).toBe(true);
  const uncommitted = copy(completed.run);
  uncommitted.graphs[0].root_committed = false;
  expect(observation_finished(uncommitted)).toBe(false);
  expect(observation_finished({ ...completed.run, graphs: [...completed.run.graphs, waiting.run.graphs[0]] })).toBe(false);
  expect(observation_finished(waiting.run)).toBe(false);
  expect(observation_finished(null)).toBe(false);
  expect(accept_run_observation(null, completed.run, finishedScope).ok).toBe(true);
});

test.each([
  ["graph status", (g) => { g.status = "cancelled"; }],
  ["root commit", (g) => { g.root_committed = true; }],
  ["pause", (g) => { g.paused = true; }],
  ["graph error", (g) => { g.error = { code: "invented", path: [] }; }],
  ["skipped path", (g) => { g.skipped_edges = [g.document.edges[0].id]; }],
  ["completed node", (g) => { g.nodes[0].state = "cancelled"; g.nodes[0].phase = "cancelled"; }],
  ["waiting node success", (g) => { const n = g.nodes.find((x) => x.phase === "awaiting_approval"); n.state = "succeeded"; n.phase = "completed"; }],
  ["waiting node failure", (g) => { const n = g.nodes.find((x) => x.phase === "awaiting_approval"); n.state = "failed"; n.phase = "failed"; }],
])("a higher unrelated prefix cannot rewrite the same graph record: %s", (_name, change) => {
  const altered = copy(waiting.run);
  altered.high_watermark += 1;
  change(altered.graphs[0]);
  expect(accept_run_observation(waiting.run, altered, scope).error).toBe("graph_record_conflict");
});

test("real Hook parent/leaf receipts advance derived wait phases without a graph revision", () => {
  const hookScope = { owner_chat_id: "skeleton-host-chat", execution_id: "native-observation", resource_id: "skeleton-root-delivery" };
  expect(hookReceipt.run.graphs.map((g) => [g.revision, g.event_id])).toEqual(hookWait.run.graphs.map((g) => [g.revision, g.event_id]));
  expect(accept_run_observation(hookWait.run, hookReceipt.run, hookScope).ok).toBe(true);
  const forged = copy(hookReceipt.run);
  forged.graphs[1].nodes.find((n) => n.phase === "receipt_recorded_upstream").interaction_id = "foreign";
  expect(accept_run_observation(hookWait.run, forged, hookScope).error).toBe("graph_record_conflict");
});
