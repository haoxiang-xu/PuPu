import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";

/* A Tool Call on the native canvas (#352): one way in, one way out, and the
   arguments it is about to use listed in the pool nodes' row language. The
   editor is a probe that keeps its props and draws each node. */

let editor = null;
jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    editor = props;
    return <div>{(props.nodes || []).map((node) => <div key={node.id}>{props.render_node(node)}</div>)}</div>;
  },
}));

const out = (name, root) => ({ name, source: { kind: "result", path: [root] } });
const doc = (tool) => ({
  schema_version: 1, kind: "agent", id: "c", name: "c",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [out("message", "message")] } } },
    { id: "tool", type: "tool_call", config: tool },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
});
const show = (config) => render(
  <ConfigContext.Provider value={{ theme: {} }}>
    <SkeletonCanvas resourceId="c" document={doc(config)} onSelectNode={() => {}} isDark={false} onGraphCommand={() => ({ ok: true })} />
  </ConfigContext.Provider>,
);

test("its ports are one inlet and one outlet", () => {
  show({ execution: { inputs: [], outputs: [] } });
  const drawn = editor.nodes.find((node) => node.id === "tool");
  expect(drawn.ports).toStrictEqual([
    { id: "in", side: "left", kind: "in" },
    { id: "out", side: "right", kind: "out" },
  ]);
});

test("an unpicked step says so; a picked one is titled by its tool and lists each argument's value or source", () => {
  const { unmount } = show({ execution: { inputs: [], outputs: [] } });
  expect(screen.getByTestId("tool-call-node-tool")).toHaveTextContent("Tool call · pick a tool");
  unmount();
  show({
    execution: {
      inputs: [
        { name: "path", value: { kind: "ref", node_id: "start", path: ["message"] }, missing: "error" },
        { name: "limit", value: { kind: "literal", value: 20 }, missing: "error" },
      ],
      outputs: [],
    },
    tool: { name: "read", on_error: "continue", approval_timeout_ms: 60000 },
  });
  const node = screen.getByTestId("tool-call-node-tool");
  expect(node).toHaveTextContent("read");
  expect(within(screen.getByTestId("tool-call-node-tool-row-0")).getByText("start.message")).toBeInTheDocument();
  expect(screen.getByTestId("tool-call-node-tool-row-1")).toHaveTextContent("limit20");
});

test("a Skill Read has the same ports; it is titled by its skill and says where the skill lives", () => {
  const { unmount } = show({ execution: { inputs: [], outputs: [] } });
  unmount();
  render(
    <ConfigContext.Provider value={{ theme: {} }}>
      <SkeletonCanvas resourceId="c" isDark={false} onSelectNode={() => {}} onGraphCommand={() => ({ ok: true })} document={{
        ...doc({ execution: { inputs: [], outputs: [] } }),
        nodes: [
          { id: "start", type: "start", config: { execution: { outputs: [out("message", "message")] } } },
          { id: "skill", type: "skill_read", config: { execution: { inputs: [], outputs: [] } } },
          { id: "notes", type: "skill_read", config: { execution: { inputs: [], outputs: [] },
            skill: { source: "user-unchain", source_id: "/h/.unchain/skills/notes/SKILL.md", name: "notes" } } },
        ],
      }} />
    </ConfigContext.Provider>,
  );
  expect(editor.nodes.find((node) => node.id === "skill").ports).toStrictEqual([
    { id: "in", side: "left", kind: "in" },
    { id: "out", side: "right", kind: "out" },
  ]);
  expect(screen.getByTestId("skill-read-node-skill")).toHaveTextContent("Skill read · pick a skill");
  expect(screen.getByTestId("skill-read-node-notes")).toHaveTextContent("notes");
  expect(screen.getByTestId("skill-read-node-notes")).toHaveTextContent("Skill read · your skills (~/.unchain)");
});

/* R-352-02 and the same class on the Tool Call node: a draft the real store
   keeps and reads back exactly (steps-352/probe/stored-shapes-01) is drawn
   without coercing a stored object, and a shape that is not a source or a
   field is not drawn as if it were one. */
test("stored shapes that are not names are drawn as unreadable, without throwing", () => {
  const skill = (id, source) => ({ id, type: "skill_read", config: { execution: { inputs: [], outputs: [] },
    skill: { source, source_id: "/h/.agents/skills/review/SKILL.md", name: "review" } } });
  const ref = (node_id, path) => ({ name: "path", value: { kind: "ref", node_id, path }, missing: "error" });
  const tool = (id, binding) => ({ id, type: "tool_call", config: { execution: { inputs: [binding], outputs: [] },
    tool: { name: "read", on_error: "continue", approval_timeout_ms: 60000 } } });
  const original = console.error;
  console.error = () => {};
  try {
    render(
      <ConfigContext.Provider value={{ theme: {} }}>
        <SkeletonCanvas resourceId="c" isDark={false} onSelectNode={() => {}} onGraphCommand={() => ({ ok: true })} document={{
          ...doc({ execution: { inputs: [], outputs: [] } }),
          nodes: [
            { id: "start", type: "start", config: { execution: { outputs: [out("message", "message")] } } },
            skill("object", { toString: null }),
            skill("listed", ["user-unchain"]),
            skill("number", 42),
            tool("node-object", ref({ toString: null }, ["message"])),
            tool("path-object", ref("start", [{ toString: null }])),
            tool("node-list", ref(["start"], ["message"])),
          ],
        }} />
      </ConfigContext.Provider>,
    );
  } finally {
    console.error = original;
  }
  ["object", "listed", "number"].forEach((id) => {
    expect(screen.getByTestId(`skill-read-node-${id}`)).toHaveTextContent("review");
    expect(screen.getByTestId(`skill-read-node-${id}`)).toHaveTextContent("Skill read · an unreadable source");
  });
  ["node-object", "path-object", "node-list"].forEach((id) => {
    expect(screen.getByTestId(`tool-call-node-${id}-row-0`)).toHaveTextContent("path");
    expect(screen.getByTestId(`tool-call-node-${id}-row-0`)).not.toHaveTextContent("start.message");
  });
});
