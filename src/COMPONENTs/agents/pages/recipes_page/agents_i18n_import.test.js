import { import_document, import_occurrences, import_refusal, read_import_file } from "./resource_import";
import { renderAgentMessage } from "./agents_i18n";
import producer from "../../../../SERVICEs/managed_transfer_producer.json";

const raw = "agents.import.title {name} · OPAQUE";

test("local import explanations translate while backend code, path and message remain opaque", async () => {
  const t = (key, vars) => `${key}:${JSON.stringify(vars || {})}`;
  const error = { code: "import_conflict", path: [raw], message: raw };
  const document = { id: raw };
  const result = import_refusal(error, document, [], t);
  expect(result.code).toBe(error.code); expect(result.path).toBe(JSON.stringify(error.path)); expect(result.message).toBe(raw);
  expect(result.sentence).toContain("agents.import."); expect(result.sentence).toContain(raw);
  expect(import_document("no", t).message).toContain("agents.import.");
  const read = await read_import_file(null, 100, t);
  expect(read.message).toContain("agents.import.");
});

test("locally retained notices can rerender in a new locale but a backend string never acquires provenance", async () => {
  const read = await read_import_file(null, 100, (key, vars) => ({ key, vars }));
  expect(read.message).toEqual(expect.objectContaining({ key: expect.stringMatching(/^agents\.import\./) }));
  expect(renderAgentMessage(raw, () => "WRONG")).toBe(raw);
  const body = import_document(producer.export.source_json);
  expect(body.ok).toBe(true);
  const occurrences = import_occurrences(body.document);
  expect(occurrences.map(({ node_path }) => node_path)).toEqual([["nodes", 1]]);
});
