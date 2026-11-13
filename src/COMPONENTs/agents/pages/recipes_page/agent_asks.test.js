import { add_ask, add_reply, ask_rows, ask_unavailable, remove_ask, update_ask } from "./agent_asks";

const agent = (kernel = {}, outputs = []) => ({
  id: "a1",
  type: "agent",
  config: {
    execution: { inputs: [], outputs },
    kernel: { profile: { capabilities: { json_schema: true } }, json_schema: null, ...kernel },
  },
});
const doc = (node) => ({ nodes: [node], edges: [] });
const nodeOf = (document) => document.nodes[0];
const schemaOf = (document) => nodeOf(document).config.kernel.json_schema;
const outputsOf = (document) => nodeOf(document).config.execution.outputs;

test("asking writes one required field in a closed schema and the output that reads it", () => {
  const next = add_ask(doc(agent()), agent());
  expect(schemaOf(next)).toEqual({
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
    additionalProperties: false,
  });
  expect(outputsOf(next)).toEqual([{ name: "answer", source: { kind: "result", path: ["answer"] } }]);
  expect([...ask_rows(nodeOf(next)).keys()]).toEqual([0]);
});

test("rename, retype and describe move the field and the output together", () => {
  let document = add_ask(doc(agent()), agent());
  document = update_ask(document, nodeOf(document), 0, { name: "tags" });
  document = update_ask(document, nodeOf(document), 0, { type: "list", description: "Topics in the question" });
  expect(schemaOf(document).properties).toEqual({
    tags: { type: "array", description: "Topics in the question", items: { type: "string" } },
  });
  expect(schemaOf(document).required).toEqual(["tags"]);
  expect(outputsOf(document)).toEqual([{ name: "tags", source: { kind: "result", path: ["tags"] } }]);
});

test("removing the last ask returns the Agent to a plain reply", () => {
  let document = add_ask(doc(agent()), agent());
  document = remove_ask(document, nodeOf(document), 0);
  expect(schemaOf(document)).toBeNull();
  expect(outputsOf(document)).toEqual([]);
});

test("a second ask takes a free name and other outputs are left alone", () => {
  const passOn = { name: "q", source: { kind: "input", path: ["question"] } };
  let document = doc(agent({}, [passOn]));
  document = add_ask(document, nodeOf(document));
  document = add_ask(document, nodeOf(document));
  expect(outputsOf(document).map((mapping) => mapping.name)).toEqual(["q", "answer", "answer_2"]);
  expect([...ask_rows(nodeOf(document)).keys()]).toEqual([1, 2]);
});

test("the reply is an output reading message, under a free name", () => {
  const document = add_reply(doc(agent()), agent());
  expect(outputsOf(document)).toEqual([{ name: "reply", source: { kind: "result", path: ["message"] } }]);
  expect(ask_rows(nodeOf(document)).size).toBe(0);
});

test("asking is refused, with a reason, where it cannot work", () => {
  expect(ask_unavailable(agent())).toBeNull();
  expect(ask_unavailable(agent({ profile: { capabilities: { json_schema: false } } }))).toBe("agents.io.ask.model_cannot");
  const nested = { type: "object", properties: { a: { type: "object", properties: {} } } };
  expect(ask_unavailable(agent({ json_schema: nested }))).toBe("agents.io.ask.schema_is_json");
  expect(ask_rows(agent({ json_schema: nested }, [{ name: "a", source: { kind: "result", path: ["a"] } }])).size).toBe(0);
});
