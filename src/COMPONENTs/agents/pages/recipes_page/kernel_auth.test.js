import capture from "./kernel_auth_capture.json";
import { kernel_admission_problems } from "./kernel_config";

// Captured from the real Core validator. This exercises the editor's admission
// mirror; selection, credentials and SDK serialization have separate tests.
test.each(capture.map((row, index) => [index, row]))("actual auth capture %s", (_index, row) => {
  const before = JSON.stringify(row.kernel);
  const problems = kernel_admission_problems(row.kernel);
  if (row.accepted) expect(problems).toEqual([]);
  else expect(problems).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: row.code, where: row.path.join(".") }),
  ]));
  expect(JSON.stringify(row.kernel)).toBe(before);
});

test.each([{ toString: null }, ["anthropic"], null, false])("a malformed protocol stays repairable with auth present: %p", (protocol) => {
  const kernel = JSON.parse(JSON.stringify(capture[0].kernel));
  kernel.profile.protocol = protocol;
  expect(() => kernel_admission_problems(kernel)).not.toThrow();
  expect(kernel_admission_problems(kernel)).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: "invalid_value", where: "kernel.profile.protocol" }),
  ]));
});
