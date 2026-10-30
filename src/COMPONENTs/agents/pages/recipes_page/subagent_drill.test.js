import {
  DRILL,
  can_drill,
  drill_crumbs,
  drill_target,
  drill_unavailable_reason,
  frame_is_stale,
  left_behind_message,
  missing_reference_message,
  push_drill_frame,
  read_failure_message,
  reference_exists,
  saves_since,
  stale_frame_message,
  unwind_drill_stack,
} from "./subagent_drill";

describe("a drill-in resolves to the real resource, not a copy", () => {
  test("a reference resolves to the Agent's identity", () => {
    expect(drill_target({ kind: "recipe_ref", recipe_name: "Summarizer" })).toEqual(
      { kind: DRILL.REFERENCE, name: "Summarizer" },
    );
    expect(can_drill({ kind: "recipe_ref", recipe_name: "Summarizer" })).toBe(true);
  });

  test("a reference with no name is not openable", () => {
    expect(drill_target({ kind: "recipe_ref" })).toEqual({ kind: DRILL.NONE });
    expect(can_drill({ kind: "recipe_ref" })).toBe(false);
  });

  test("an embedded graph says it is not connected rather than doing nothing", () => {
    expect(drill_target({ kind: "embedded" })).toEqual({ kind: DRILL.EMBEDDED });
    expect(can_drill({ kind: "embedded" })).toBe(false);
    expect(drill_unavailable_reason({ kind: "embedded" })).toMatch(
      /not connected yet/i,
    );
  });

  test("a legacy entry has a prompt, not a graph", () => {
    expect(drill_unavailable_reason({ kind: "inline", name: "s" })).toMatch(
      /convert it to an agent/i,
    );
    expect(drill_unavailable_reason({ kind: "ref", template_name: "t" })).toMatch(
      /convert it to an agent/i,
    );
    expect(can_drill({ kind: "inline", name: "s" })).toBe(false);
  });

  test("an openable reference has no unavailable reason", () => {
    expect(
      drill_unavailable_reason({ kind: "recipe_ref", recipe_name: "S" }),
    ).toBeNull();
  });
});

describe("a missing reference is said out loud", () => {
  const entry = { kind: "recipe_ref", recipe_name: "Summarizer" };

  test("a reference to a resource that is gone does not exist", () => {
    expect(reference_exists(entry, [{ name: "Explore" }])).toBe(false);
    expect(reference_exists(entry, [{ name: "Summarizer" }])).toBe(true);
  });

  test("an unknown library is not evidence the reference is broken", () => {
    /* Before the list has loaded, nothing is known — claiming the reference is
     * missing would be a guess that reads as data loss. */
    expect(reference_exists(entry, undefined)).toBe(true);
    expect(reference_exists(entry, null)).toBe(true);
  });

  test("a non-reference entry is never reported as a missing reference", () => {
    expect(reference_exists({ kind: "inline", name: "s" }, [])).toBe(true);
  });

  test("the messages name the resource instead of blaming the user", () => {
    expect(missing_reference_message("Summarizer")).toMatch(/Summarizer/);
    expect(missing_reference_message("Summarizer")).toMatch(/repointed or removed/i);
    expect(read_failure_message("Summarizer", new Error("EACCES"))).toBe(
      'Could not open "Summarizer" — EACCES',
    );
    expect(read_failure_message("Summarizer", null)).toBe(
      'Could not open "Summarizer"',
    );
  });
});

describe("the stack remembers the graph it left", () => {
  const frame = {
    name: "Reviewer",
    label: "Reviewer",
    via_label: "Subagent Pool",
    recipe: { name: "Reviewer", nodes: [], edges: [] },
    dirty: true,
    selectedNodeId: "sp",
    viewport: { x: 12, y: -8, zoom: 1.4 },
  };

  test("pushing keeps the unsaved definition, not a re-read of it", () => {
    const stack = push_drill_frame([], frame);
    expect(stack).toHaveLength(1);
    expect(stack[0].recipe).toBe(frame.recipe);
    expect(stack[0].dirty).toBe(true);
    expect(stack[0].viewport).toEqual({ x: 12, y: -8, zoom: 1.4 });
    expect(stack[0].selectedNodeId).toBe("sp");
  });

  test("unwinding to a depth returns that frame and drops what was above it", () => {
    const second = { ...frame, name: "Summarizer", label: "Summarizer" };
    const stack = push_drill_frame(push_drill_frame([], frame), second);
    expect(unwind_drill_stack(stack, 1)).toEqual({
      frame: second,
      stack: [frame],
    });
    expect(unwind_drill_stack(stack, 0)).toEqual({ frame, stack: [] });
  });

  test("unwinding out of range changes nothing", () => {
    const stack = push_drill_frame([], frame);
    expect(unwind_drill_stack(stack, 5)).toEqual({ frame: null, stack });
    expect(unwind_drill_stack(stack, -1)).toEqual({ frame: null, stack });
    expect(unwind_drill_stack([], 0)).toEqual({ frame: null, stack: [] });
  });
});

describe("the breadcrumb names the step, not just the graphs", () => {
  test("one level reads Reviewer › Subagent Pool › Summarizer", () => {
    const stack = [
      { label: "Reviewer", via_label: "Subagent Pool" },
    ];
    expect(drill_crumbs(stack, "Summarizer").map((c) => c.label)).toEqual([
      "Reviewer",
      "Subagent Pool",
      "Summarizer",
    ]);
  });

  test("only the graphs left behind are navigable", () => {
    const stack = [{ label: "Reviewer", via_label: "Subagent Pool" }];
    const crumbs = drill_crumbs(stack, "Summarizer");
    expect(crumbs.map((c) => c.navigable)).toEqual([true, false, false]);
    expect(crumbs[0].depth).toBe(0);
  });

  test("nesting adds a pool crumb per level", () => {
    const stack = [
      { label: "Reviewer", via_label: "Subagent Pool" },
      { label: "Summarizer", via_label: "Subagent Pool" },
    ];
    expect(drill_crumbs(stack, "Quoter").map((c) => c.label)).toEqual([
      "Reviewer",
      "Subagent Pool",
      "Summarizer",
      "Subagent Pool",
      "Quoter",
    ]);
    expect(drill_crumbs(stack, "Quoter")[2].depth).toBe(1);
  });

  test("at the root there is one crumb and nothing to go back to", () => {
    expect(drill_crumbs([], "Reviewer")).toEqual([
      { label: "Reviewer", depth: null, navigable: false },
    ]);
  });
});

describe("a frame's history is only good for the content it was taken on", () => {
  const frame = { name: "Reviewer", saved_version: 2 };

  test("no write since the frame was taken means it is still current", () => {
    expect(frame_is_stale(frame, { Reviewer: 2 })).toBe(false);
    expect(saves_since(frame, { Reviewer: 2 })).toBe(0);
  });

  test("a write while the frame was held makes it stale", () => {
    /* The same Agent can sit at two levels — a graph referencing an Agent that
     * references it back — so saving deeper writes what a frame below holds. */
    expect(frame_is_stale(frame, { Reviewer: 3 })).toBe(true);
    expect(saves_since(frame, { Reviewer: 3 })).toBe(1);
  });

  test("a resource never written in this session is not stale", () => {
    expect(frame_is_stale({ name: "Fresh" }, {})).toBe(false);
    expect(frame_is_stale({ name: "Fresh" }, { Other: 9 })).toBe(false);
  });

  test("no frame is not a stale frame", () => {
    expect(frame_is_stale(null, { Reviewer: 3 })).toBe(false);
    expect(saves_since(null, {})).toBe(0);
  });

  test("a resource named after something every object has is counted too", () => {
    /* The table is keyed by a resource id, and the store accepts
       `constructor`, `toString`, `valueOf` and `hasOwnProperty` as ids —
       measured in `skeleton_entry_id_capture`. Read as a plain key,
       `saved_versions["constructor"]` answered with a function, `function - 0`
       is NaN, and NaN is never greater than zero: the frame below was never
       told its copy had been overtaken. */
    ["constructor", "toString", "valueOf", "hasOwnProperty"].forEach((name) => {
      const held = { name, saved_version: 2 };
      const counted = Object.create(null);
      counted[name] = 3;
      expect([name, saves_since(held, counted)]).toEqual([name, 1]);
      expect([name, frame_is_stale(held, counted)]).toEqual([name, true]);
      /* And a table that happens to be a plain object cannot bring it back. */
      expect([name, saves_since(held, {})]).toEqual([name, -2]);
      expect([name, frame_is_stale({ name }, {})]).toEqual([name, false]);
    });
  });

  test("the messages say what happened and what it costs", () => {
    expect(stale_frame_message("Reviewer")).toMatch(/saved elsewhere/i);
    expect(stale_frame_message("Reviewer")).toMatch(/history was dropped/i);
    expect(stale_frame_message("Reviewer")).toMatch(/replace that newer version/i);
    expect(left_behind_message("Summarizer")).toMatch(/Summarizer/);
    expect(left_behind_message("Summarizer")).toMatch(/left behind/i);
  });
});
