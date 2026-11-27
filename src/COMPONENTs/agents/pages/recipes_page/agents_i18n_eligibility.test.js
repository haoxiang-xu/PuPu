import { entry_source_label, subagent_candidates, why_not_a_subagent, why_not_this_reference } from "./skeleton_subagent_eligibility";

const t = (key) => `T:${key}`;
test("reference eligibility's critical gate changes only explanations, preserving every null decision", () => {
  const options = { owner_id: "owner" };
  for (const id of [null, undefined, 0, {}, "", " ", "owner", "constructor", "__proto__", "agents.raw {id}"]) {
    const original = why_not_this_reference(id, options);
    const translated = why_not_this_reference(id, options, t);
    expect(translated === null).toBe(original === null);
    expect(translated).toEqual(original === null ? null : expect.stringMatching(/^T:agents\.eligibility\./));
  }
});
test("candidate inclusion and resource identities are independent of translated refusals", () => {
  const resources = [null, {}, { id: "" }, { id: "owner", kind: "agent" }, { id: "workflow", kind: "workflow" },
    { id: "unknown", kind: "constructor" }, { id: "archived", kind: "agent", archived: true },
    { id: "raw", name: "agents.raw {name}", kind: "agent" }];
  const before = JSON.stringify(resources); const options = { owner_id: "owner" };
  for (const resource of resources) {
    const english = why_not_a_subagent(resource, options);
    const translated = why_not_a_subagent(resource, options, t);
    expect(translated === null).toBe(english === null);
    expect(translated).toEqual(english === null ? null : expect.stringMatching(/^T:agents\.eligibility\./));
  }
  expect(subagent_candidates(resources, options)).toEqual([resources[7]]);
  expect(subagent_candidates(resources, options)[0]).toBe(resources[7]);
  expect(JSON.stringify(resources)).toBe(before);
});
test("only known source captions translate, with unchanged source kinds and fields", () => {
  for (const source of [{ kind: "agent_ref", agent_id: "raw" }, { kind: "embedded", document: {} }, { kind: "constructor" }, null]) {
    const entry = { source }; const before = JSON.stringify(entry);
    expect(entry_source_label(entry, t)).toMatch(/^T:agents\.eligibility\./);
    expect(JSON.stringify(entry)).toBe(before);
  }
});
