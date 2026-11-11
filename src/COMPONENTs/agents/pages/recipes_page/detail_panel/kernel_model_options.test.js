import { kernel_model_options } from "./kernel_model_options";
import { agentEnglishText } from "../agents_i18n";

const first = { id: "host-profile-1", provider: "openai", model: "Same model" };
const second = { ...first, id: "host-profile-2" };
const group = (profiles, stored = first, collapsed = {}) => kernel_model_options(profiles, stored, collapsed, agentEnglishText);

test("same-named models retain distinct host profile identities and order", () => {
  const profiles = [first, second];
  const original = JSON.stringify(profiles);
  const result = group(profiles);
  expect(result).toHaveLength(1);
  expect(result[0].options.map((entry) => entry.value)).toEqual([first.id, second.id]);
  expect(JSON.stringify(profiles)).toBe(original);
});

test("an unlisted stored profile stays visible, including its warning in the trigger", () => {
  const result = group([second]);
  expect(result[0].options[0].value).toBe(first.id);
  expect(result[0].options[0].trigger_label).toMatch(/not offered by this build/i);
  expect(result[0].options[1].value).toBe(second.id);
});

test("only host-offered providers appear and folding never alters a profile", () => {
  const custom = { id: "exact-custom-profile", provider: "custom.team", model: "Team model" };
  const result = group([custom], null, { "custom.team": true });
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ group_key: "custom.team", collapsed: true, is_custom: true });
  expect(result[0].options[0].value).toBe(custom.id);
});

test("no catalog and no stored profile produce no invented defaults", () => {
  expect(group([], null)).toEqual([]);
});
