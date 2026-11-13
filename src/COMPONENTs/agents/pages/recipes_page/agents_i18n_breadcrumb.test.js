import { agentMessage } from "./agents_i18n";
import { drill_crumbs } from "./subagent_drill";
import { drill_trail_segments } from "./drill_trail";

test("only owned pool breadcrumb captions translate, never an author's identical English name", () => {
  const raw = "Subagent Pool";
  const stack = [{ label: raw, via_label: agentMessage("agents.nodes.subagent_pool") }, { label: "agents.nodes.subagent_pool {raw}", via_label: "Hooks Pool" }];
  const crumbs = drill_crumbs(stack, raw, (key) => `T:${key}`);
  expect(crumbs[0].label).toBe(raw);
  expect(crumbs[1].label).toBe("T:agents.nodes.subagent_pool");
  expect(crumbs[2].label).toBe("agents.nodes.subagent_pool {raw}");
  expect(crumbs[3].label).toBe("Hooks Pool"); expect(crumbs[4].label).toBe(raw);
});

test("the side menu's drill segments name the way back in the current language, with the authored label unchanged", () => {
  const raw = "agents.drill.back_to {name}";
  const crumbs = [{ label: raw, depth: 0, navigable: true }, { label: "Subagent Pool", depth: null, navigable: false }, { label: "child", depth: null, navigable: false }];
  const before = JSON.stringify(crumbs);
  const t = (key, values) => `T:${key}:${values ? values.label : ""}`;
  const segments = drill_trail_segments(crumbs, () => ({ icon: "bot" }), { icon: "bot" }, t);
  expect(segments.map((segment) => segment.label)).toEqual([raw, "child"]);
  expect(segments[0].ariaLabel).toBe(`T:agents.editor.back_to:${raw}`);
  expect(segments[0].depth).toBe(0);
  expect(segments[1].depth).toBeNull();
  expect(segments[1].ariaLabel).toBeUndefined();
  expect(segments[1].hint).toBeUndefined();
  expect(JSON.stringify(crumbs)).toBe(before);
});
