import { new_embedded_entry } from "./new_embedded_entry";
import capture from "./skeleton_native_embedded_capture.json";

const random = (byte) => (bytes) => bytes.fill(byte);
const root = () => capture.rows[0].document;
const create = (extra = {}) => new_embedded_entry({ rootDocument: root(), entries: [], randomBytes: random(7), ...extra });

test("new entry writes all native policies and a separate unfinished Agent graph", () => {
  const result = create();
  const expected = capture.rows[0].document.nodes.at(-1).config.subagents[0];
  expect(result.ok).toBe(true);
  expect(result.entry).toEqual({ ...expected, source: { kind: "embedded", document: { ...expected.source.document, id: "embedded-" + "07".repeat(16) } } });
  expect(result.entry.source.document.nodes[1].config.kernel).toBeUndefined();
});

test("ids and names are free in this pool, including malformed existing entries", () => {
  const entries = [null, { id: "subagent-1", name: "New Agent" }, { id: "subagent-3", name: "New Agent 2" }, { id: { toString: null }, name: { toString: null } }];
  const result = create({ entries });
  expect(result.entry.id).toBe("subagent-2");
  expect(result.entry.name).toBe("New Agent 3");
  expect(result.entry.source.document.name).toBe("New Agent 3");
  expect(entries).toHaveLength(4);
});

test("graph ids check the entire visible root, not just the displayed pool", () => {
  const document = JSON.parse(JSON.stringify(root()));
  document.nodes.at(-1).config.subagents[0].source.document.id = "embedded-" + "07".repeat(16);
  let calls = 0;
  const randomBytes = (bytes) => bytes.fill(++calls === 1 ? 7 : 8);
  expect(create({ rootDocument: document, randomBytes }).entry.source.document.id).toBe("embedded-" + "08".repeat(16));
  expect(calls).toBe(2);
});

test("root id participates in the graph-id check", () => {
  const document = { ...root(), id: "embedded-" + "07".repeat(16) };
  const result = create({ rootDocument: document });
  expect(result.ok).toBe(false);
  expect(result.entry).toBeNull();
});

test("unavailable entropy adds no entry and does not fall back to a clock or display name", () => {
  const entries = [{ id: "kept", name: "Mine", source: { kind: "agent_ref", agent_id: "existing" } }];
  const result = create({ entries, randomBytes: () => { throw new Error("unavailable"); } });
  expect(result.ok).toBe(false);
  expect(result.entry).toBeNull();
  expect(entries[0].id).toBe("kept");
});

test("deep and cyclic in-memory data cannot recurse or mutate during id collection", () => {
  const document = { ...root(), nodes: [] };
  let next = document;
  for (let n = 0; n < 4000; n += 1) {
    const child = { id: `deep-${n}`, nodes: [] };
    next.nodes.push({ type: "subagent_pool", config: { subagents: [{ source: { kind: "embedded", document: child } }] } });
    next = child;
  }
  next.nodes.push({ type: "subagent_pool", config: { subagents: [{ source: { kind: "embedded", document } }] } });
  expect(create({ rootDocument: document }).ok).toBe(true);
});
