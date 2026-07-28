import {
  SKILL_BODY_MAX_BYTES,
  parseFrontmatter,
  toSkillPackId,
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

  it("returns null data when there is no leading frontmatter fence", () => {
    const { data } = parseFrontmatter("# no frontmatter\n\njust text");
    expect(data).toBeNull();
  });

  it("tolerates quoted values and extra keys", () => {
    const { data } = parseFrontmatter(
      `---\nname: "foo-bar"\ndescription: 'has: colon'\nlicense: MIT\n---\nbody`,
    );
    expect(data.name).toBe("foo-bar");
    expect(data.description).toBe("has: colon");
    expect(data.license).toBe("MIT");
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
    expect(result.skipped).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(result.degraded).toEqual([]);
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
