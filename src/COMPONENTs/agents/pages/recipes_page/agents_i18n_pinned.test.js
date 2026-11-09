import { agentMessage, renderAgentMessage } from "./agents_i18n";
import { pinned_open_failed_message, pinned_view_caption, pinned_view_crumbs, pinned_view_label } from "./pinned_workflow_view";

const raw = "agents.pinned.caption {ordinal} · RAW";
const version = { ordinal: 3, revision_id: raw, workflow_id: raw, document: { name: raw } };
const translate = (key, vars) => `T:${key}:${JSON.stringify(vars || {})}`;
test("fixed-version captions translate wrappers while preserving immutable version and authored crumb identity", () => {
  const before = JSON.stringify(version);
  expect(pinned_view_label(version)).toBe(`${raw} · revision 3`);
  expect(pinned_view_label(version, translate)).toContain("T:agents.pinned.");
  expect(pinned_view_caption(version, translate)).toContain("T:agents.pinned.");
  const original = [{ label: raw, depth: null, navigable: false }];
  const result = pinned_view_crumbs(original, 2, raw, raw, translate);
  expect(result[0]).toEqual({ label: raw, depth: 2, navigable: true });
  expect(result[1].label).toContain("T:agents.pinned.via_label"); expect(result[2].label).toBe(raw);
  expect(JSON.stringify(version)).toBe(before); expect(original[0].depth).toBeNull();
});
test("a retained open failure rerenders only owned provenance and keeps backend detail literal", () => {
  const notice = pinned_open_failed_message({ error: { message: raw } }, agentMessage);
  expect(renderAgentMessage(notice, translate)).toContain("T:agents.pinned.");
  expect(renderAgentMessage(notice, translate)).toContain(raw);
  expect(renderAgentMessage(raw, translate)).toBe(raw);
});
