import {
  SKILL_BODY_MAX_BYTES,
  parseFrontmatter,
  toSkillPackId,
  canonicalSkillName,
  parseFlag,
  buildSkillPackFromScan,
  findCommandConflicts,
} from "./skill_pack_import";

const skillFile = (name, description, bodyExtra = "Do the thing.") => `---
name: ${name}
description: ${description}
---

# ${name}

${bodyExtra}
`;

describe("parseFrontmatter", () => {
  it("extracts name/description and returns the body after the fence", () => {
    const { data, body } = parseFrontmatter(skillFile("plan", "Plan a task"));
    expect(data.name).toBe("plan");
    expect(data.description).toBe("Plan a task");
    expect(body).toContain("# plan");
    expect(body.startsWith("---")).toBe(false);
  });

  it("returns null data and no error when there is no leading frontmatter fence", () => {
    const { data, error } = parseFrontmatter("# no frontmatter\n\njust text");
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it("tolerates quoted values and extra keys", () => {
    const { data } = parseFrontmatter(
      `---\nname: "foo-bar"\ndescription: 'has: colon'\nlicense: MIT\n---\nbody`,
    );
    expect(data.name).toBe("foo-bar");
    expect(data.description).toBe("has: colon");
    expect(data.license).toBe("MIT");
  });

  it("returns a non-null error (not just null data) for a malformed-but-fenced frontmatter block", () => {
    const { data, error } = parseFrontmatter("---\nname: demo\ndescription: no closing fence\n");
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error.message).toMatch(/unterminated/i);
  });

  it("parses block scalars and nested mappings via parseSkillFile instead of splitting on the first colon", () => {
    const { data } = parseFrontmatter(
      "---\nname: folded\ndescription: >\n  Line one.\n  Line two.\nmetadata:\n  author: Jane\n---\nbody",
    );
    expect(data.description).toBe("Line one. Line two.\n");
    expect(data.metadata).toEqual({ author: "Jane" });
  });
});

describe("toSkillPackId", () => {
  it("slugifies the picked directory name under the skillpack. namespace", () => {
    expect(toSkillPackId("Obra Superpowers")).toBe("skillpack.obra-superpowers");
    expect(toSkillPackId("../weird/Name!!")).toBe("skillpack.weird-name");
  });

  it("falls back to a stable id when the name is empty", () => {
    expect(toSkillPackId("")).toBe("skillpack.imported");
  });
});

describe("canonicalSkillName", () => {
  it("lowercases and turns underscores/other invalid chars into hyphens", () => {
    expect(canonicalSkillName("Echo_Loud")).toBe("echo-loud");
  });

  it("leaves an already-canonical name unchanged", () => {
    expect(canonicalSkillName("plan")).toBe("plan");
  });

  it("collapses runs of hyphens and strips leading/trailing hyphens", () => {
    expect(canonicalSkillName("--Weird__Name--")).toBe("weird-name");
  });

  it("truncates to 64 characters", () => {
    const result = canonicalSkillName("a".repeat(70));
    expect(result).toBe("a".repeat(64));
    expect(result.length).toBe(64);
  });

  it("strips a trailing hyphen left dangling by truncation", () => {
    const name = "a".repeat(63) + "-" + "b".repeat(10);
    const result = canonicalSkillName(name);
    expect(result).toBe("a".repeat(63));
    expect(result.length).toBeLessThanOrEqual(64);
  });

  it("is idempotent", () => {
    for (const name of ["Echo_Loud", "plan", "--Weird__Name--", "a".repeat(70), "___"]) {
      const once = canonicalSkillName(name);
      expect(canonicalSkillName(once)).toBe(once);
    }
  });

  it("can canonicalize to empty", () => {
    expect(canonicalSkillName("___")).toBe("");
    expect(canonicalSkillName("")).toBe("");
  });
});

describe("parseFlag", () => {
  it("returns the default when the value is missing", () => {
    expect(parseFlag(undefined, true)).toBe(true);
    expect(parseFlag(null, false)).toBe(false);
  });

  it("passes an actual boolean through", () => {
    expect(parseFlag(true, false)).toBe(true);
    expect(parseFlag(false, true)).toBe(false);
  });

  it("accepts the recognized strings case-insensitively", () => {
    for (const text of ["true", "TRUE", "yes", "On", "1"]) {
      expect(parseFlag(text, false)).toBe(true);
    }
    for (const text of ["false", "FALSE", "no", "Off", "0"]) {
      expect(parseFlag(text, true)).toBe(false);
    }
  });

  it("returns null for an unrecognized explicit value", () => {
    expect(parseFlag("maybe", true)).toBeNull();
    expect(parseFlag("", true)).toBeNull();
    expect(parseFlag(2, true)).toBeNull();
    expect(parseFlag([], true)).toBeNull();
  });
});

describe("buildSkillPackFromScan", () => {
  const scan = (files, dirName = "superpowers") => ({ dirName, files });

  it("imports a valid instruction-only skill as a composer command with no tools", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "brainstorming/SKILL.md",
          content: skillFile("brainstorming", "Explore intent before building"),
          folderFiles: [],
        },
      ]),
    );
    expect(result.toolkitId).toBe("skillpack.superpowers");
    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0];
    expect(skill.name).toBe("brainstorming");
    expect(skill.description).toBe("Explore intent before building");
    expect(skill.phase).toBe("composer");
    expect(skill.tools).toEqual([]);
    expect(skill.body).toContain("# brainstorming");
    expect(skill.aliases).toEqual([]);
    expect(skill.modelInvocable).toBe(true);
    expect(skill.userInvocable).toBe(true);
    expect(skill.metadata).toEqual({});
    expect(result.skipped).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.degraded).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("skips a skill missing required frontmatter name and reports it", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "no-name/SKILL.md",
          content: `---\ndescription: has description only\n---\nbody`,
          folderFiles: [],
        },
      ]),
    );
    expect(result.skills).toHaveLength(0);
    expect(result.skipped).toEqual([
      { relPath: "no-name/SKILL.md", reason: "missing_name" },
    ]);
  });

  it("skips a skill missing required frontmatter description", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "no-desc/SKILL.md",
          content: `---\nname: no-desc\n---\nbody`,
          folderFiles: [],
        },
      ]),
    );
    expect(result.skills).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("missing_description");
  });

  it("skips a file with no frontmatter fence at all", () => {
    const result = buildSkillPackFromScan(
      scan([
        { relPath: "raw/SKILL.md", content: "# just a heading", folderFiles: [] },
      ]),
    );
    expect(result.skills).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("no_frontmatter");
  });

  it("skips a skill whose name has illegal characters", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "bad/SKILL.md",
          content: skillFile("has spaces", "desc"),
          folderFiles: [],
        },
      ]),
    );
    expect(result.skills).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("invalid_name");
  });

  it("rejects a skill whose folder ships scripts / executables", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "docx/SKILL.md",
          content: skillFile("docx", "Work with docx"),
          folderFiles: ["docx/scripts/convert.py", "docx/SKILL.md"],
        },
      ]),
    );
    expect(result.skills).toHaveLength(0);
    expect(result.rejected).toEqual([
      { relPath: "docx/SKILL.md", reason: "scripts_present" },
    ]);
  });

  it("rejects a script folder even when the only extra file is a bare executable extension", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "sh/SKILL.md",
          content: skillFile("sh", "shell"),
          folderFiles: ["sh/run.sh"],
        },
      ]),
    );
    expect(result.rejected[0].reason).toBe("scripts_present");
  });

  it("imports but marks degraded when the body references a sibling reference/asset file", () => {
    const body = `See [the reference](references/deep-dive.md) and ![diagram](assets/flow.png).`;
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "writing/SKILL.md",
          content: skillFile("writing", "Write well", body),
          folderFiles: [
            "writing/references/deep-dive.md",
            "writing/assets/flow.png",
          ],
        },
      ]),
    );
    expect(result.skills).toHaveLength(1);
    expect(result.degraded).toHaveLength(1);
    expect(result.degraded[0].name).toBe("writing");
    expect(result.degraded[0].refs).toEqual(
      expect.arrayContaining(["references/deep-dive.md", "assets/flow.png"]),
    );
  });

  it("does not mark degraded for external URLs or in-page anchors", () => {
    const body = `See [docs](https://example.com) and [top](#intro).`;
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "ok/SKILL.md",
          content: skillFile("ok", "fine", body),
          folderFiles: [],
        },
      ]),
    );
    expect(result.degraded).toEqual([]);
    expect(result.skills).toHaveLength(1);
  });

  it("rejects a skill whose body exceeds the 64KB technical cap", () => {
    const huge = "x".repeat(SKILL_BODY_MAX_BYTES + 1);
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "big/SKILL.md",
          content: skillFile("big", "too big", huge),
          folderFiles: [],
        },
      ]),
    );
    expect(result.skills).toHaveLength(0);
    expect(result.rejected[0].reason).toBe("body_too_large");
  });

  it("keeps the first of duplicate skill names and reports the rest skipped", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "a/SKILL.md",
          content: skillFile("dup", "first"),
          folderFiles: [],
        },
        {
          relPath: "b/SKILL.md",
          content: skillFile("dup", "second"),
          folderFiles: [],
        },
      ]),
    );
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].description).toBe("first");
    expect(result.skipped).toEqual([
      { relPath: "b/SKILL.md", reason: "duplicate_name" },
    ]);
  });

  it("uses title from frontmatter when present, else the name", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "t/SKILL.md",
          content: `---\nname: tk\ntitle: Nice Title\ndescription: d\n---\nbody`,
          folderFiles: [],
        },
      ]),
    );
    expect(result.skills[0].title).toBe("Nice Title");
  });

  it("canonicalizes the name and keeps the raw frontmatter spelling as an alias", () => {
    const result = buildSkillPackFromScan(
      scan([
        {
          relPath: "e/SKILL.md",
          content: skillFile("Echo_Loud", "Loud echo"),
          folderFiles: [],
        },
      ]),
    );
    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0];
    expect(skill.name).toBe("echo-loud");
    expect(skill.aliases).toEqual(["Echo_Loud"]);
    expect(skill.title).toBe("echo-loud"); // falls back to the canonical name
  });

  it("does not add an alias when the name is already canonical", () => {
    const result = buildSkillPackFromScan(
      scan([
        { relPath: "p/SKILL.md", content: skillFile("plan", "Plan a task"), folderFiles: [] },
      ]),
    );
    expect(result.skills[0].name).toBe("plan");
    expect(result.skills[0].aliases).toEqual([]);
  });

  it("keeps BOTH rows when raw spellings only collide after canonicalization (P4, ticket #291)", () => {
    // Two different raw names ("echo-loud" and "Echo_Loud") canonicalize to
    // the same /command. The producer must no longer drop the second one as
    // a "duplicate_name" — it keeps every row with its own raw spelling so
    // the backend's normalize_skill_rows (which now retains colliding rows
    // under a suffixed canonical name) can resolve the collision instead of
    // silently losing a skill. Only an EXACT repeat of the same raw name
    // (see "keeps the first of duplicate skill names" above) is skipped.
    const result = buildSkillPackFromScan(
      scan([
        { relPath: "a/SKILL.md", content: skillFile("echo-loud", "first"), folderFiles: [] },
        { relPath: "b/SKILL.md", content: skillFile("Echo_Loud", "second"), folderFiles: [] },
      ]),
    );
    expect(result.skipped).toEqual([]);
    expect(result.skills).toHaveLength(2);
    expect(result.skills[0]).toMatchObject({
      name: "echo-loud",
      description: "first",
      aliases: [],
    });
    expect(result.skills[1]).toMatchObject({
      name: "echo-loud",
      description: "second",
      aliases: ["Echo_Loud"],
    });
  });

  it("defaults modelInvocable/userInvocable to true and metadata to {}", () => {
    const result = buildSkillPackFromScan(
      scan([
        { relPath: "d/SKILL.md", content: skillFile("defaults", "desc"), folderFiles: [] },
      ]),
    );
    const skill = result.skills[0];
    expect(skill.modelInvocable).toBe(true);
    expect(skill.userInvocable).toBe(true);
    expect(skill.metadata).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it("parses valid disable-model-invocation / user-invocable flags", () => {
    const content = `---
name: gated
description: A gated skill
disable-model-invocation: true
user-invocable: "no"
---

body
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "g/SKILL.md", content, folderFiles: [] }]),
    );
    const skill = result.skills[0];
    expect(skill.modelInvocable).toBe(false);
    expect(skill.userInvocable).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it("keeps the restrictive value and reports a warning for an invalid flag", () => {
    const content = `---
name: bad-flags
description: Has bad flags
disable-model-invocation: maybe
user-invocable: nope
---

body
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "bf/SKILL.md", content, folderFiles: [] }]),
    );
    const skill = result.skills[0];
    expect(skill.modelInvocable).toBe(false);
    expect(skill.userInvocable).toBe(false);
    expect(result.warnings).toEqual([
      { name: "bad-flags", relPath: "bf/SKILL.md", reason: "invalid_flag:disable-model-invocation" },
      { name: "bad-flags", relPath: "bf/SKILL.md", reason: "invalid_flag:user-invocable" },
    ]);
  });

  it("collects unknown frontmatter keys into metadata as strings", () => {
    const content = `---
name: meta
description: Has metadata
title: Meta Skill
license: MIT
version: "2"
disable-model-invocation: false
user-invocable: true
---

body
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "m/SKILL.md", content, folderFiles: [] }]),
    );
    const skill = result.skills[0];
    expect(skill.metadata).toEqual({ license: "MIT", version: "2" });
    // name/description/title/policy keys are their own fields, not metadata
    expect(skill.metadata.name).toBeUndefined();
    expect(skill.metadata.description).toBeUndefined();
    expect(skill.metadata.title).toBeUndefined();
    expect(skill.metadata["disable-model-invocation"]).toBeUndefined();
    expect(skill.metadata["user-invocable"]).toBeUndefined();
  });

  // -------------------------------------------------------------------
  // P4 (ticket #291 feature audit): the old importer was a single-line
  // colon splitter. These repro the finding's exact failure modes against
  // the real parseSkillFile-backed parser (skill_frontmatter.js) and prove
  // producer parity with Unchain's authoritative SKILL.md YAML subset.
  // -------------------------------------------------------------------

  it("folds a `description: >` block scalar and nests a `metadata:` mapping instead of flattening it (audit repro)", () => {
    // Old bug: description ended up as the literal string ">", the
    // `metadata:` field ended up as "" (empty), and `author` was flattened
    // onto the top level as its own unrelated field.
    const content = `---
name: pdf-form-filler
description: >
  Fill in PDF forms with structured data, validate required fields, and
  export a completed copy without altering the original template.
metadata:
  author: Jane Doe
  license: Apache-2.0
---

Body.
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "pdf/SKILL.md", content, folderFiles: [] }]),
    );
    expect(result.skipped).toEqual([]);
    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0];
    expect(skill.description).toBe(
      "Fill in PDF forms with structured data, validate required fields, and " +
        "export a completed copy without altering the original template.",
    );
    expect(skill.metadata).toEqual({ author: "Jane Doe", license: "Apache-2.0" });
    expect(skill.metadata.author).not.toBeUndefined();
  });

  it("drops an inline `#` comment outside quotes from a plain scalar value", () => {
    const content = `---
name: commented
description: Use when planning a trip # not part of the description
---

Body.
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "c/SKILL.md", content, folderFiles: [] }]),
    );
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].description).toBe("Use when planning a trip");
  });

  it("parses a literal block scalar (`|`) into a metadata field with newlines preserved", () => {
    const content = `---
name: literal-block
description: Has a literal block metadata field
notes: |
  Line one.
  Line two.
---

Body.
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "l/SKILL.md", content, folderFiles: [] }]),
    );
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].metadata.notes).toBe("Line one.\nLine two.\n");
  });

  it("parses a `- item` list under a key into a real array, not a stringified blob", () => {
    const content = `---
name: has-list
description: Has a list metadata field
tags:
  - alpha
  - beta
---

Body.
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "t/SKILL.md", content, folderFiles: [] }]),
    );
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].metadata.tags).toEqual(["alpha", "beta"]);
  });

  it("skips a skill with a duplicate `description` key as invalid_frontmatter", () => {
    const content = `---
name: dup-desc
description: first
description: second
---

Body.
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "dd/SKILL.md", content, folderFiles: [] }]),
    );
    expect(result.skills).toHaveLength(0);
    expect(result.skipped).toEqual([
      { relPath: "dd/SKILL.md", reason: "invalid_frontmatter" },
    ]);
  });

  it("still reports the missing-fence case as no_frontmatter, not invalid_frontmatter", () => {
    const result = buildSkillPackFromScan(
      scan([{ relPath: "raw2/SKILL.md", content: "no fence here at all", folderFiles: [] }]),
    );
    expect(result.skipped).toEqual([
      { relPath: "raw2/SKILL.md", reason: "no_frontmatter" },
    ]);
  });

  it("reports an unterminated frontmatter fence as invalid_frontmatter (not no_frontmatter)", () => {
    const content = "---\nname: unterminated\ndescription: no closing fence\n";
    const result = buildSkillPackFromScan(
      scan([{ relPath: "u/SKILL.md", content, folderFiles: [] }]),
    );
    expect(result.skipped).toEqual([
      { relPath: "u/SKILL.md", reason: "invalid_frontmatter" },
    ]);
  });

  it("merges an explicit frontmatter `aliases:` list in behind the raw-spelling alias", () => {
    const content = `---
name: Echo_Loud
description: Loud echo
aliases:
  - loud-echo
  - echo-loud
---

Body.
`;
    const result = buildSkillPackFromScan(
      scan([{ relPath: "al/SKILL.md", content, folderFiles: [] }]),
    );
    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0];
    expect(skill.name).toBe("echo-loud");
    // "Echo_Loud" (raw spelling) first, then "loud-echo" from the explicit
    // list; "echo-loud" is dropped because it equals the canonical name.
    expect(skill.aliases).toEqual(["Echo_Loud", "loud-echo"]);
    // The frontmatter's own `aliases:` key never leaks into metadata.
    expect(skill.metadata.aliases).toBeUndefined();
  });

  it("tolerates empty / garbage input without throwing", () => {
    expect(buildSkillPackFromScan(null).skills).toEqual([]);
    expect(buildSkillPackFromScan({ dirName: "x", files: null }).skills).toEqual([]);
    expect(buildSkillPackFromScan({ files: [1, "y", {}] }).skills).toEqual([]);
  });
});

describe("findCommandConflicts", () => {
  it("reports skills whose /command is already registered", () => {
    const registered = new Set(["/plan", "/brainstorming"]);
    const conflicts = findCommandConflicts(
      [{ name: "plan" }, { name: "novel" }, { name: "brainstorming" }],
      (cmd) => registered.has(cmd),
    );
    expect(conflicts).toEqual([
      { name: "plan", command: "/plan" },
      { name: "brainstorming", command: "/brainstorming" },
    ]);
  });

  it("returns empty for no collisions or bad input", () => {
    expect(findCommandConflicts([{ name: "x" }], () => false)).toEqual([]);
    expect(findCommandConflicts(null, () => true)).toEqual([]);
    expect(findCommandConflicts([{ name: "x" }], null)).toEqual([]);
  });
});
