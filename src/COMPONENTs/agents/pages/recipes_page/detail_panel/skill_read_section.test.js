import React, { useState } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import SkillReadSection from "./skill_read_section";
import { api } from "../../../../../SERVICEs/api";
import capture from "../skill_read_capture.json";

/* The Skill Read panel (#352), fed the sidecar's own answers: the skill list
 * and the previews were captured from the real routes on the fixed installed
 * runtime (skill_read_capture.json, steps-352/probe/skill-preview-capture-01).
 * Only the controls are probes. */

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
let mockUserDirs = true;
jest.mock("../../../../../SERVICEs/plugin_skill_sync", () => ({ readSkillsIncludeUserDirsSetting: () => mockUserDirs }));
jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => function MockSelect({ options, value, set_value, disabled, placeholder }) {
  return (
    <select data-testid="select" value={value === undefined || value === null ? "" : value} disabled={disabled}
      onChange={(event) => set_value(event.target.value)}>
      <option value="">{placeholder || ""}</option>
      {(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => function MockButton({ label, ariaLabel, onClick, disabled }) {
  return <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{label || ariaLabel}</button>;
});

const INVENTORY = JSON.parse(capture.inventory.body_text);
const PREVIEWS = [capture.preview_notes, capture.preview_drafts].map((entry) => JSON.parse(entry.body_text));
const SHADOWED = JSON.parse(capture.preview_shadowed.body_text).error;
const identityOf = (name) => {
  const skill = INVENTORY.skills.find((item) => item.name === name);
  return { source: skill.source, source_id: skill.source_id, name: skill.name };
};

const graph = (skillNode) => ({
  schema_version: 1, kind: "agent", id: "doc", name: "doc",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [] } } },
    skillNode,
    { id: "router", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
});
const skillNode = (config = {}) => ({ id: "skill", type: "skill_read", config: { execution: { inputs: [], outputs: [] }, ...config } });

let latest;
let writes;
function Harness({ initial }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return <SkillReadSection document={document} node={document.nodes.find((node) => node.id === "skill")} isDark={false}
    onChange={(next) => { writes.push(next); setDocument(next); }} />;
}
const show = async (document) => {
  render(<Harness initial={document} />);
  await act(async () => { await Promise.resolve(); });
};
const settle = () => act(async () => { await Promise.resolve(); });
const node = () => latest.nodes.find((item) => item.id === "skill");
const optionValue = (name) => {
  const option = within(screen.getByTestId("skill-read-picker")).getAllByRole("option").find((item) => item.textContent.startsWith(`${name} ·`));
  return option.value;
};

beforeEach(() => {
  writes = [];
  latest = null;
  mockUserDirs = true;
  api.unchain.getSkillInventory = jest.fn(async () => INVENTORY);
  api.unchain.previewSkeletonSkill = jest.fn(async (identity) => {
    const found = PREVIEWS.find((preview) => preview.identity.name === identity.name && preview.identity.source_id === identity.source_id);
    if (!found) {
      // eslint-disable-next-line no-throw-literal
      throw { ...SHADOWED, status: 404 };
    }
    return { identity: found.identity, body: found.body, revision: found.revision, bytes: found.bytes };
  });
});

test("an unpicked step lists the skills, says it takes no inputs, and invents nothing", async () => {
  await show(graph(skillNode()));
  expect(api.unchain.getSkillInventory).toHaveBeenCalledWith({ workspaceRoot: "", includeUserDirs: true, toolkits: [] });
  const labels = within(screen.getByTestId("skill-read-picker")).getAllByRole("option").map((option) => option.textContent);
  expect(labels).toEqual(["pick a skill", "drafts · your skills (~/.agents)", "notes · your skills (~/.unchain)"]);
  expect(screen.getByTestId("skill-read-inputs")).toHaveTextContent("No inputs. A Skill Read takes none.");
  expect(screen.getByTestId("skill-read-problems")).toHaveTextContent("Pick the skill this step reads.");
  expect(screen.queryByTestId("skill-read-preview")).toBeNull();
  expect(api.unchain.previewSkeletonSkill).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
});

test("picking stores exactly the listed identity, and the preview is the runtime's read", async () => {
  await show(graph(skillNode()));
  fireEvent.change(within(screen.getByTestId("skill-read-picker")).getByTestId("select"), { target: { value: optionValue("notes") } });
  await settle();
  expect(node().config).toStrictEqual({ execution: { inputs: [], outputs: [] }, skill: identityOf("notes") });
  expect(api.unchain.previewSkeletonSkill).toHaveBeenCalledWith(identityOf("notes"), true);
  expect(screen.getByTestId("skill-read-preview-body").textContent).toBe(PREVIEWS[0].body);
  expect(screen.getByTestId("skill-read-preview-size")).toHaveTextContent(`${PREVIEWS[0].bytes} bytes`);
  expect(screen.getByTestId("skill-read-preview")).toHaveTextContent("not what runs");
  expect(screen.getByTestId("skill-read-source")).toHaveTextContent(identityOf("notes").source_id);
  expect(screen.queryByTestId("skill-read-problems")).toBeNull();
});

test("the preview is never written into the document", async () => {
  await show(graph(skillNode({ skill: identityOf("drafts") })));
  await settle();
  expect(screen.getByTestId("skill-read-preview-body").textContent).toBe("Drafting rules — ünïcode");
  expect(writes).toHaveLength(0);
  expect(JSON.stringify(latest)).not.toContain("Drafting rules");
});

test("a stored identity the list no longer has is kept, named, and its refusal explained", async () => {
  const gone = { source: "user-agents", source_id: "/old/home/.agents/skills/notes/SKILL.md", name: "notes" };
  await show(graph(skillNode({ skill: gone })));
  await settle();
  expect(within(screen.getByTestId("skill-read-picker")).getAllByRole("option")[1]).toHaveTextContent("notes (not in the skill list now)");
  expect(screen.getByTestId("skill-read-preview-error")).toHaveTextContent("its exact source, location and name could not be read");
  expect(screen.getByTestId("skill-read-problems")).toHaveTextContent("“notes” is not in the skill list now");
  expect(writes).toHaveLength(0);
  expect(node().config.skill).toStrictEqual(gone);
});

test("stored inputs and settings the runtime does not read are shown and removable, the rest kept", async () => {
  const rows = [{ name: "x", value: { kind: "literal", value: 1 }, missing: "error" }];
  await show(graph(skillNode({ skill: identityOf("notes"), preview: "cached", execution: { inputs: rows, outputs: [] } })));
  expect(screen.getByTestId("skill-read-inputs")).toHaveTextContent("the runtime refuses a Skill Read that has any");
  fireEvent.click(screen.getByRole("button", { name: "Remove inputs" }));
  expect(node().config.execution.inputs).toStrictEqual([]);
  expect(screen.getByTestId("skill-read-setting-preview")).toHaveTextContent("Unsupported setting: preview");
  fireEvent.click(screen.getByRole("button", { name: "Remove setting preview" }));
  expect(node().config).toStrictEqual({ skill: identityOf("notes"), execution: { inputs: [], outputs: [] } });
});

test("with the user-skills switch off the list and the preview are asked for without them", async () => {
  mockUserDirs = false;
  await show(graph(skillNode({ skill: identityOf("notes") })));
  await settle();
  expect(api.unchain.getSkillInventory).toHaveBeenCalledWith({ workspaceRoot: "", includeUserDirs: false, toolkits: [] });
  expect(api.unchain.previewSkeletonSkill).toHaveBeenCalledWith(identityOf("notes"), false);
});

test("a skill list that cannot be read is reported with a retry and nothing is written", async () => {
  api.unchain.getSkillInventory = jest.fn(async () => ({ schema: "pupu.skill_inventory.v2", skills: [] }));
  await show(graph(skillNode()));
  expect(screen.getByTestId("skill-read-list-error")).toHaveTextContent("The skill list could not be read.");
  expect(writes).toHaveLength(0);
});

/* R-352-03 and R-352-02 in the panel: a stored identity the runtime refuses —
   an extra key, or a part that is not text — is drawn, shown as it is stored,
   and an explicit pick of a listed skill replaces it, even the same skill. The
   real store keeps both drafts exactly (steps-352/probe/stored-shapes-01;
   review producer-results-v2). */
const select = () => within(screen.getByTestId("skill-read-picker")).getByTestId("select");

test("re-picking the listed skill repairs a stored identity with an extra key", async () => {
  await show(graph(skillNode({ skill: { ...identityOf("notes"), unexpected: "bad" } })));
  await settle();
  expect(screen.getByTestId("skill-read-problems")).toHaveTextContent("Pick it again");
  fireEvent.change(select(), { target: { value: optionValue("notes") } });
  await settle();
  expect(writes).toHaveLength(1);
  expect(node().config).toStrictEqual({ execution: { inputs: [], outputs: [] }, skill: identityOf("notes") });
  expect(screen.queryByTestId("skill-read-problems")).toBeNull();
});

test("a stored identity with an extra key is shown as it is stored, extra key included, until it is replaced", async () => {
  await show(graph(skillNode({ skill: { ...identityOf("notes"), unexpected: "bad" } })));
  await settle();
  expect(screen.getByTestId("skill-read-stored")).toHaveTextContent("unexpected");
  expect(select().selectedOptions[0].textContent).toBe("notes (stored in a form the runtime cannot read)");
  expect(writes).toHaveLength(0);
  fireEvent.change(select(), { target: { value: optionValue("notes") } });
  await settle();
  expect(screen.queryByTestId("skill-read-stored")).toBeNull();
});

test("re-picking the skill a valid step already reads writes nothing", async () => {
  await show(graph(skillNode({ skill: identityOf("notes") })));
  await settle();
  fireEvent.change(select(), { target: { value: optionValue("notes") } });
  await settle();
  expect(writes).toHaveLength(0);
});

test.each([
  ["an object that cannot be made text", { toString: null }],
  ["a list naming a known source", ["user-unchain"]],
  ["a number", 42],
  ["null", null],
])("a stored source that is %s is drawn, shown as stored, never previewed, and a pick repairs it", async (_label, source) => {
  const original = console.error;
  console.error = () => {};
  try {
    await show(graph(skillNode({ skill: { ...identityOf("notes"), source } })));
    await settle();
  } finally {
    console.error = original;
  }
  expect(screen.getByTestId("skill-read-problems")).toHaveTextContent("Pick it again");
  expect(screen.getByTestId("skill-read-stored")).toHaveTextContent(identityOf("notes").name);
  expect(screen.getByTestId("skill-read-stored")).not.toHaveTextContent("your skills");
  expect(api.unchain.previewSkeletonSkill).not.toHaveBeenCalled();
  expect(writes).toHaveLength(0);
  fireEvent.change(select(), { target: { value: optionValue("notes") } });
  await settle();
  expect(node().config.skill).toStrictEqual(identityOf("notes"));
});
