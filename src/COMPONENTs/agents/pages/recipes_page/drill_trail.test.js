import { drill_level_icon, drill_trail_segments, graph_icon } from "./drill_trail";
import { FRAME } from "./skeleton_drill";

test("a resource-backed Agent wears its own icon, an embedded one the plain bot, a Workflow the flow glyph", () => {
  expect(graph_icon({ kind: "agent", presentation: { icon: "brain" } }, false)).toEqual({ presentation: { icon: "brain" } });
  expect(graph_icon({ kind: "agent" }, false)).toEqual({ presentation: null });
  expect(graph_icon({ kind: "agent", presentation: { icon: "brain" } }, true)).toEqual({ icon: "bot" });
  expect(graph_icon({ kind: "workflow" }, false)).toEqual({ icon: "workflow" });
  expect(graph_icon(null, false)).toEqual({ presentation: null });
});

test("a level left behind is read from the session that held it", () => {
  const live = { document: { kind: "agent", presentation: { icon: "live" } } };
  const stashed = { document: { kind: "agent", presentation: { icon: "root" } } };
  /* Root resource left for a referenced Agent: the stashed session is the
     root's. */
  const stack = [{ kind: FRAME.RESOURCE, steps: [], session: stashed }];
  expect(drill_level_icon(stack, live, 0)).toEqual({ presentation: { icon: "root" } });
  /* Root left for an embedded child: the root is still the live session. */
  expect(drill_level_icon([{ kind: FRAME.EMBEDDED, steps: [] }], live, 0)).toEqual({ presentation: { icon: "live" } });
  /* A frame that was itself an embedded graph is the plain bot. */
  expect(drill_level_icon([{ kind: FRAME.EMBEDDED, steps: [] }, { kind: FRAME.EMBEDDED, steps: [{}] }], live, 1).icon).toBe("bot");
  expect(drill_level_icon([], live, 3)).toEqual({ icon: "bot" });
});

test("segments keep the graphs, drop the pool captions, and only graphs left behind lead back", () => {
  const crumbs = [
    { label: "Reviewer", depth: 0, navigable: true },
    { label: "Subagent Pool", depth: null, navigable: false },
    { label: "Shortener", depth: 1, navigable: true },
    { label: "Subagent Pool", depth: null, navigable: false },
    { label: "Deepest", depth: null, navigable: false },
  ];
  const icons = { 0: { presentation: { icon: "a" } }, 1: { icon: "bot" } };
  const segments = drill_trail_segments(crumbs, (depth) => icons[depth], { icon: "bot" });
  expect(segments).toEqual([
    { key: "drill-0", label: "Reviewer", depth: 0, presentation: { icon: "a" }, ariaLabel: "Back to Reviewer" },
    { key: "drill-1", label: "Shortener", depth: 1, icon: "bot", ariaLabel: "Back to Shortener" },
    { key: "drill-2", label: "Deepest", depth: null, icon: "bot" },
  ]);
});
