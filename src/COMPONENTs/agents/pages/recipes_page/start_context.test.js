import { start_context_for_view } from "./start_context";

const graph = (names = ["question", "notes"]) => ({ nodes: [{
  id: "start", type: "start", config: { execution: { outputs: names.map((name) => ({
    name, source: { kind: "result", path: ["not-the-caller-name"] },
  })) } },
}] });

test("a standalone library graph does not invent Chat fields or an input key", () => {
  const result = start_context_for_view([], [], graph());
  expect(result.kind).toBe("unknown");
  expect(result.fields).toEqual([]);
  expect(result.message).toMatch(/caller.*not specified/i);
});

test("embedded and referenced Subagents use the current Start output names, not paths", () => {
  for (const [steps, frames] of [[[{}], []], [[], [{ kind: "resource" }]]]) {
    const document = graph();
    const before = JSON.stringify(document);
    const result = start_context_for_view(steps, frames, document);
    expect(result.kind).toBe("subagent");
    expect(result.fields).toEqual([{ name: "question", type: "text" }, { name: "notes", type: "text" }]);
    expect(JSON.stringify(document)).toBe(before);
    document.nodes[0].config.execution.outputs[0].name = "edited";
    expect(start_context_for_view(steps, frames, document).fields[0].name).toBe("edited");
  }
});

test.each(["hooks", "unknown", null, false])("member %s is not guessed to be a Subagent", (member) => {
  expect(start_context_for_view([{ member }], [], graph()).kind).toBe("unknown");
});

test.each([
  { nodes: [] },
  { nodes: [...graph().nodes, ...graph().nodes] },
  { nodes: [{ id: "s", type: "start", config: {} }] },
  graph(["same", "same"]),
  graph([""]),
  graph([{ toString: null }]),
])("invalid Start definitions do not become a filtered plausible field list", (document) => {
  const result = start_context_for_view([{}], [], document);
  expect(result.kind).toBe("invalid");
  expect(result.fields).toEqual([]);
});

test("a valid empty Subagent input and navigation back to an unknown root remain distinct", () => {
  expect(start_context_for_view([{}], [], graph([]))).toMatchObject({ kind: "subagent", fields: [] });
  expect(start_context_for_view([], [], graph([]))).toMatchObject({ kind: "unknown", fields: [] });
  expect(start_context_for_view([{ member: "hooks" }], [{ kind: "resource" }], graph()).kind).toBe("unknown");
});
