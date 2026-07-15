import fs from "fs";
import path from "path";

const FILES = [
  path.join(__dirname, "diff_body.js"),
  path.join(__dirname, "..", "chat-bubble", "interact", "code_diff_interact.js"),
  path.join(
    __dirname,
    "..",
    "chat-bubble",
    "artifact-summary",
    "files_changed_card.js",
  ),
];

const FORBIDDEN = [
  "#0d1117",
  "#3a0d13",
  "#0d331a",
  "#0c2a4d",
  "#79c0ff",
  "#3fb950",
  "#f85149",
];

const REQUIRED_TOKENS = [
  "--pupu-success-rgb",
  "--pupu-danger-rgb",
  "--pupu-accent-rgb",
  "--pupu-text-muted",
];

describe("code-diff views follow semantic theme tokens", () => {
  const contents = FILES.map((file) => fs.readFileSync(file, "utf8"));

  test.each(FILES)("%s has no hardcoded GitHub-palette hex colors", (file) => {
    const source = fs.readFileSync(file, "utf8");
    for (const hex of FORBIDDEN) {
      expect(source.toLowerCase()).not.toContain(hex.toLowerCase());
    }
  });

  test.each(REQUIRED_TOKENS)(
    "at least one of the 3 files references semantic token %s",
    (token) => {
      const found = contents.some((source) => source.includes(token));
      expect(found).toBe(true);
    },
  );
});
