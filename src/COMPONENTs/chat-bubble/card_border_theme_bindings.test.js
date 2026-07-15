/**
 * Source-scan lock: every in-bubble "card" surface (code-diff card, the
 * trace-chain tool-call info block, and each artifact card) binds the
 * cardBorder JSON-details channel — constant 1px transparent border by
 * default, themeable via --pupu-card-border (high_contrast opts in).
 *
 * See src/CONTAINERs/config/theme_semantic.js (DETAIL_DEFAULTS.cardBorder)
 * and src/BUILTIN_COMPONENTs/theme/semantic_tokens.js (high_contrast details).
 */
const fs = require("fs");
const path = require("path");

const CARD_BORDER_VAR = 'var(--pupu-card-border, transparent)';

const read = (relPath) =>
  fs.readFileSync(path.join(__dirname, relPath), "utf8");

describe("cardBorder details channel bindings", () => {
  test("code-diff card outer container binds --pupu-card-border", () => {
    const src = read("interact/code_diff_interact.js");
    expect(src).toContain(CARD_BORDER_VAR);
  });

  test("trace-chain tool-call info/detail block (Timeline details container) binds --pupu-card-border", () => {
    const src = read("../../BUILTIN_COMPONENTs/timeline/timeline.js");
    expect(src).toContain(CARD_BORDER_VAR);
  });

  test("files_changed_card outer container binds --pupu-card-border", () => {
    const src = read("artifact-summary/files_changed_card.js");
    expect(src).toContain(CARD_BORDER_VAR);
  });

  test("generic_artifact_card outer container binds --pupu-card-border", () => {
    const src = read("artifact-summary/generic_artifact_card.js");
    expect(src).toContain(CARD_BORDER_VAR);
  });

  test("plan_card outer container binds --pupu-card-border", () => {
    const src = read("artifact-summary/plan_card.js");
    expect(src).toContain(CARD_BORDER_VAR);
  });
});
