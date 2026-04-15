/**
 * Guard regression test: a tool_call frame with interact_type="code_diff"
 * must NOT be auto-approved even when the same toolkit:tool pair is in
 * the session auto-approve set. This locks the spec §5.3 verification.
 *
 * We verify the guard by reading the source file and asserting the
 * critical clauses are present. A full hook integration test would
 * drag in the entire streaming pipeline; a source assertion is the
 * lightest way to lock the invariant against future refactors.
 */

const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

describe("use_chat_stream code_diff auto-approve guard", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("source file exists", () => {
    expect(source.length).toBeGreaterThan(0);
  });

  test("isAutoApprovable clause excludes non-confirmation interact types", () => {
    // The exact clause from commit 54f82c1 — must remain literally in place.
    const clause = /\(!itype\s*\|\|\s*itype\s*===\s*"confirmation"\)/;
    expect(source).toMatch(clause);
  });

  test("isAutoApprovable branch references HUMAN_INPUT_TOOL_NAME", () => {
    // Human input must also be excluded from session auto-approve.
    expect(source).toMatch(/toolName\s*!==\s*HUMAN_INPUT_TOOL_NAME/);
  });

  test("sessionAutoApproveRef key shape is toolkitId:toolName", () => {
    // Ensure keys don't accidentally become path-scoped later, which
    // would broaden the auto-approve surface. The .has(...) call may
    // span multiple lines in the source — match loosely across them.
    expect(source).toMatch(
      /sessionAutoApproveRef\.current\.has\([\s\S]*?`\$\{toolkitId\}:\$\{toolName\}`/,
    );
  });

  test("sessionAutoApproveRef.add uses the same key shape", () => {
    expect(source).toMatch(
      /sessionAutoApproveRef\.current\.add\(\s*`\$\{toolkitId\}:\$\{toolName\}`\s*\)/,
    );
  });
});
