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

  test("auto-approve and session-cache paths both apply the cache policy", () => {
    expect(source).toMatch(
      /return\s*\(\s*isToolConfirmationCacheable\(toolkitId, toolName\)/,
    );
    expect(source).toMatch(
      /shouldCacheToolConfirmationDecision\(\{[\s\S]*?approved,[\s\S]*?scope,[\s\S]*?toolkitId,[\s\S]*?toolName,[\s\S]*?\}\)/,
    );
  });

  test("session auto-approve state is isolated by chatId", () => {
    expect(source).toMatch(/sessionAutoApproveRef\s*=\s*useRef\(new Map\(\)\)/);
    expect(source).toMatch(
      /sessionAutoApproveRef\.current[\s\S]*?\.get\(normalizedChatId\)[\s\S]*?\.has\(`\$\{toolkitId\}:\$\{toolName\}`\)/,
    );
    expect(source.match(/isToolCallAutoApprovable\(targetChatId, frame\)/g)).toHaveLength(2);
  });

  test("session approval is cached only after a successful current-generation response", () => {
    const handlerStart = source.indexOf("const handleToolConfirmationDecision");
    const handlerEnd = source.indexOf("const handleContinuationDecision", handlerStart);
    const handlerSource = source.slice(handlerStart, handlerEnd);
    const submitIndex = handlerSource.indexOf(
      "await submitToolConfirmationWithRetry",
    );
    const generationIndex = handlerSource.indexOf(
      "if (!isRunGenerationCurrent",
      submitIndex,
    );
    const cacheIndex = handlerSource.indexOf("allowedTools.add", generationIndex);

    expect(submitIndex).toBeGreaterThan(-1);
    expect(generationIndex).toBeGreaterThan(submitIndex);
    expect(cacheIndex).toBeGreaterThan(generationIndex);
    expect(source).toMatch(
      /allowedTools\.add\(`\$\{toolkitId\}:\$\{toolName\}`\)/,
    );
  });

  test("session approvals survive chat switches but are cleared on unmount", () => {
    expect(source).not.toMatch(
      /useEffect\(\(\)\s*=>\s*\{\s*sessionAutoApproveRef\.current\.clear\(\);\s*\},\s*\[chatId\]\)/,
    );
    expect(source).toMatch(/sessionAutoApprovalsByChatId\.clear\(\)/);
  });
});
