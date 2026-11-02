import { subagentDisplayResult } from "./subagent_display_result";
import capture from "./__fixtures__/ticket_356_inline_subagent.json";

const envelope = (text) => ({ inline: true, preview: text, content_bytes: new Blob([text]).size });

test("decodes the exact packaged producer output without changing its frame", () => {
  const original = capture.result.payload.result;
  const before = JSON.stringify(original);
  expect(subagentDisplayResult(original)).toEqual(JSON.parse(original.preview));
  expect(JSON.stringify(original)).toBe(before);
});

test("uses UTF-8 bytes, including non-ASCII child output", () => {
  const value = { status: "completed", output: "审核 👋" };
  expect(subagentDisplayResult(envelope(JSON.stringify(value)))).toEqual(value);
});

test.each([null, undefined, [], "text", { status: "failed", error: "actual failure" }, { status: "cancelled" }])(
  "preserves legacy values: %j", value => expect(subagentDisplayResult(value)).toBe(value),
);

test.each([
  { ...envelope('{}'), inline: false },
  { ...envelope('{}'), content_bytes: 9 },
  { ...envelope('{}'), content_bytes: -1 },
  { ...envelope('{}'), content_bytes: "2" },
  { inline: true, preview: '{"status":"completed"}' },
  envelope('{"status":"completed"'),
  envelope('null'), envelope('[]'), envelope('42'), envelope('"completed"'),
])("does not turn incomplete or non-object content into a child result: %j", value => {
  expect(subagentDisplayResult(value)).toBe(value);
});
