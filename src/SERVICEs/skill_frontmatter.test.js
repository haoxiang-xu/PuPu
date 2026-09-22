import fs from "fs";
import path from "path";
import {
  SkillFrontmatterError,
  coerceBool,
  parseSkillFile,
} from "./skill_frontmatter";

/* Parity suite for skill_frontmatter.js — a line-for-line JS port of
 * Unchain's src/unchain/skills/frontmatter.py (ticket #327 D1). Fixtures
 * are copied verbatim from unchain's tests/fixtures/skills/*.md and the
 * expected values below are transcribed from unchain's
 * tests/test_skills_frontmatter.py so the two parsers can be proven to
 * agree (PuPu ticket #291 P4). */

const FIXTURES = path.join(__dirname, "__fixtures__", "skills");

const load = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");
const parse = (name) => parseSkillFile(load(name));

describe("plain scalars", () => {
  it("parses name/description with body edge stripping", () => {
    const result = parse("plain.md");
    expect(result.fields).toEqual({
      name: "demo-skill",
      description: "A simple demo skill for greeting the user.",
    });
    expect(result.body).toBe(
      "Follow these steps when the user asks for a greeting.\n\n" +
        "1. Read their name from the conversation.\n" +
        "2. Reply with a short, friendly greeting.",
    );
  });
});

describe("quoted scalars, escapes, inline comments", () => {
  it("keeps internal colons and drops comments", () => {
    const result = parse("quoted_comments.md");
    expect(result.fields).toEqual({
      name: "quote-demo",
      description: "Use when: x",
      foo: "bar#notcomment",
      note: "hello world",
      "quoted-single": "It's a test",
    });
    expect(result.body).toBe("Body text.");
  });

  it("supports backslash escapes in double-quoted scalars", () => {
    const result = parse("escapes.md");
    expect(result.fields.label).toBe('Quote: " Backslash: \\ Tab:\t Newline:\n end');
  });
});

describe("block scalars", () => {
  it("handles literal block scalar chomping variants", () => {
    const result = parse("block_literal.md");
    expect(result.fields.clip).toBe("Line one.\nLine two.\n");
    expect(result.fields.strip).toBe("Line one.\nLine two.");
    expect(result.fields.keep).toBe("Line one.\n\n");
    expect(result.fields.tags).toBe("after");
  });

  it("handles folded block scalar chomping variants", () => {
    const result = parse("block_folded.md");
    expect(result.fields.clip).toBe("Line one. continues here.\nNew paragraph.\n");
    expect(result.fields.strip).toBe("Only one line here.");
    expect(result.fields.keep).toBe("Folded line.\n\n");
    expect(result.fields.next).toBe("value");
  });
});

describe("nested mappings, block lists, flow sequences", () => {
  it("parses nested mapping, list, and flow sequence", () => {
    const result = parse("nested_and_list.md");
    expect(result.fields.interface).toEqual({
      display_name: "Ticket Buddy",
      icon: "ticket",
    });
    expect(result.fields.tags).toEqual(["alpha", "beta", "gamma"]);
    expect(result.fields["allowed-tools"]).toEqual(["Bash", "Read", "Write"]);
  });
});

describe("unknown keys and policy-key string passthrough", () => {
  it("preserves unknown keys verbatim and keeps policy keys as strings", () => {
    const result = parse("unknown_keys.md");
    expect(result.fields["custom-field"]).toBe("some value");
    expect(result.fields["another-custom"]).toBe("42");
    expect(result.fields["disable-model-invocation"]).toBe("true");
    expect(result.fields["user-invocable"]).toBe("false");
    // The two policy keys stay strings in `fields`; coercion is separate.
    expect(coerceBool(result.fields["disable-model-invocation"], false)).toBe(true);
    expect(coerceBool(result.fields["user-invocable"], true)).toBe(false);
  });
});

describe("real-world style fixture", () => {
  it("folds description, nests metadata, and keeps body fences intact", () => {
    const result = parse("real_world.md");
    expect(result.fields.name).toBe("pdf-form-filler");
    expect(result.fields.description).toBe(
      "Fill in PDF forms with structured data, validate required fields, and " +
        "export a completed copy without altering the original template.\n",
    );
    expect(result.fields.metadata).toEqual({
      category: "documents",
      license: "Apache-2.0",
      version: "1.2.0",
    });
    expect(result.fields["allowed-tools"]).toEqual(["Read", "Write", "Bash"]);

    // The body's own `---` lines (inside a fenced code block) must not be
    // mistaken for frontmatter delimiters, and code fences/links survive
    // untouched.
    expect(result.body.startsWith("# PDF Form Filler\n\n")).toBe(true);
    expect(result.body).toContain(
      "```bash\npython fill_form.py --input form.pdf --output filled.pdf\n",
    );
    expect(result.body).toContain(
      "---\nnot a real fence, just literal text with dashes\n---\n```",
    );
    expect(result.body).toContain(
      "[PDF toolkit reference](https://example.com/docs/pdf-toolkit)",
    );
  });
});

describe("rejections", () => {
  it("rejects missing frontmatter", () => {
    expect(() => parse("reject_missing_frontmatter.md")).toThrow(SkillFrontmatterError);
    expect(() => parse("reject_missing_frontmatter.md")).toThrow(
      /missing YAML frontmatter delimited by ---/,
    );
  });

  it("rejects unterminated frontmatter", () => {
    expect(() => parse("reject_unterminated.md")).toThrow(/unterminated YAML frontmatter/);
  });

  it("rejects tab indentation", () => {
    expect(() => parse("reject_tab_indent.md")).toThrow(/tab/);
  });

  it("rejects a YAML tag", () => {
    expect(() => parse("reject_tag.md")).toThrow(/tag/);
  });

  it("rejects a YAML anchor", () => {
    expect(() => parse("reject_anchor.md")).toThrow(/anchor/);
  });

  it("rejects a YAML alias", () => {
    expect(() => parse("reject_alias.md")).toThrow(/alias/);
  });

  it("rejects a duplicate policy key", () => {
    expect(() => parse("reject_duplicate_name.md")).toThrow(/duplicate/);
  });

  it("rejects an invalid top-level line", () => {
    expect(() => parse("reject_invalid_line.md")).toThrow(/invalid frontmatter line/);
  });

  it("rejects a flow mapping", () => {
    expect(() => parseSkillFile("---\nfoo: {a: 1}\n---\nBody.\n")).toThrow(
      /flow mapping/,
    );
  });
});

describe("coerceBool", () => {
  it("uses the default for undefined/null/blank", () => {
    expect(coerceBool(undefined, true)).toBe(true);
    expect(coerceBool(null, false)).toBe(false);
    expect(coerceBool("", true)).toBe(true);
    expect(coerceBool("   ", false)).toBe(false);
  });

  it.each(["true", "TRUE", "True", "yes", "Yes", "on", "ON", "1"])(
    "accepts %s as true",
    (value) => {
      expect(coerceBool(value, false)).toBe(true);
    },
  );

  it.each(["false", "FALSE", "False", "no", "No", "off", "OFF", "0"])(
    "accepts %s as false",
    (value) => {
      expect(coerceBool(value, true)).toBe(false);
    },
  );

  it("rejects an unrecognized string", () => {
    expect(() => coerceBool("maybe", true)).toThrow(/expected a boolean/);
  });

  it("rejects a non-string value", () => {
    expect(() => coerceBool(["x"], true)).toThrow(/expected a boolean/);
  });
});
