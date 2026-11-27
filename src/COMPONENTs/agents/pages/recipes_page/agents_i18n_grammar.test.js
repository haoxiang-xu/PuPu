import { document_problems } from "./skeleton_document";
import { CAPTURED_DOCUMENT_ENVELOPE } from "./skeleton_document_envelope_capture";
import { text_problem } from "./managed_code_sources";

const t = (key, vars) => `T:${key}:${JSON.stringify(vars || {})}`;
test.each(CAPTURED_DOCUMENT_ENVELOPE.map((row) => [row.label, row.document]))("local grammar keeps exact codes/paths and documents: %s", (_label, document) => {
  const before = JSON.stringify(document);
  const original = document_problems(document);
  const translated = document_problems(document, t);
  expect(translated.map(({ message, ...issue }) => issue)).toEqual(original.map(({ message, ...issue }) => issue));
  expect(translated.map((issue) => issue.message)).toEqual(original.map(() => expect.stringMatching(/^T:agents\.local_validation\./)));
  expect(JSON.stringify(document)).toBe(before);
});
test.each([false, "\ud800", "a".repeat(4 * 1024 * 1024 + 1), "def main(input, context):\n    return input"])("Code text validation only localizes its explanation", (text) => {
  const original = text_problem(text); const translated = text_problem(text, t);
  expect(translated && translated.code).toBe(original && original.code);
  expect(translated && translated.message).toEqual(original ? expect.stringMatching(/^T:agents\.local_validation\./) : null);
});
