/**
 * Guard regression test: artifact_summary effects must (1) carry an eventId
 * so they survive runtimeEventEffectKey deduplication, (2) be keyed in a way
 * that distinguishes (turnId, reason) so multiple flushed effects from a
 * single run.completed all survive, and (3) be mirrored onto the streaming
 * assistant message via syncStreamMessages.
 *
 * Source-level assertions match the convention used by
 * use_chat_stream.code_diff_guard.test.js — a full hook integration test
 * would drag in the entire streaming pipeline.
 */

const fs = require("fs");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "use_chat_stream.js");

describe("use_chat_stream artifact_summary plumbing", () => {
  let source;

  beforeAll(() => {
    source = fs.readFileSync(HOOK_PATH, "utf8");
  });

  test("runtimeEventEffectKey distinguishes artifact summaries by scope and reason", () => {
    // The key function must mix turnId + reason for artifact_summary effects,
    // otherwise multiple flushed effects from one run.completed collide.
    expect(source).toMatch(/effect\?\.type\s*===\s*"artifact_summary"/);
    expect(source).toMatch(/effect\?\.type\s*===\s*"run_artifact_summary"/);
    expect(source).toMatch(/effect\.turnId/);
    expect(source).toMatch(/effect\.reason/);
    expect(source).toMatch(/run:\$\{effect\.reason/);
  });

  test("effects loop has artifact summary branches", () => {
    expect(source).toMatch(/effect\.type\s*===\s*"artifact_summary"/);
    expect(source).toMatch(/effect\.type\s*===\s*"run_artifact_summary"/);
  });

  test("artifact_summary branch reads from runtimeEventActivityTree.artifactSummariesByTurnId", () => {
    expect(source).toMatch(/artifactSummariesByTurnId/);
  });

  test("artifact summary branch writes through syncStreamMessages", () => {
    // The branch must follow the same pattern as syncAssistantSubagentState:
    // build nextStreamMessages via streamMessages.map and call syncStreamMessages.
    const branch = source.match(
      /const patchArtifactSummary[\s\S]{0,1800}/,
    );
    expect(branch).not.toBeNull();
    expect(branch[0]).toMatch(/streamMessages\.map/);
    expect(branch[0]).toMatch(/syncStreamMessages\(/);
    expect(branch[0]).toMatch(/assistantMessageId/);
    expect(branch[0]).toMatch(/runArtifactSummary/);
  });
});
