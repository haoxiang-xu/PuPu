import { buildContextCompositionHintV2 } from "./context_composition_hint_v2";

const utf8Length = (value) => unescape(encodeURIComponent(value)).length;

const composer = (templateLength) => ({
  v: 1,
  rawText: "/skill hello",
  commands: [{ name: "skill", sourceToolkitId: "plugin.example" }],
  templateLength,
});

describe("Context Composition public hint v2", () => {
  test("emits one privacy-preserving aggregate for a visible template prefix", () => {
    expect(
      buildContextCompositionHintV2({
        message: "Skill body\n\nhello",
        composer: composer("Skill body".length),
      }),
    ).toEqual({
      schema: "pupu.context_composition_hint.v2",
      contributions: [
        {
          category: "skills",
          subtype: "expanded_invocation",
          surface: "messages",
          prefix_utf16_units: 10,
          utf8_bytes: 10,
          source_count: 1,
        },
      ],
    });
  });

  test("uses JavaScript UTF-16 units while counting strict UTF-8 bytes", () => {
    const prefix = "说明😀";
    expect(prefix.length).toBe(4);
    const hint = buildContextCompositionHintV2({
      message: `${prefix}\n\nquestion`,
      composer: composer(prefix.length),
    });
    expect(hint.contributions[0]).toMatchObject({
      prefix_utf16_units: 4,
      utf8_bytes: utf8Length(prefix),
      source_count: 1,
    });
  });

  test("omits zero-template, no-composer, and invalid-boundary hints", () => {
    expect(
      buildContextCompositionHintV2({
        message: "question",
        composer: composer(0),
      }),
    ).toBeNull();
    expect(
      buildContextCompositionHintV2({ message: "question", composer: null }),
    ).toBeNull();
    expect(
      buildContextCompositionHintV2({
        message: "😀 rest",
        composer: composer(1),
      }),
    ).toBeNull();
  });

  test("omits ill-formed scalar prefixes instead of replacement-encoding them", () => {
    expect(
      buildContextCompositionHintV2({
        message: `bad\ud800\n\nquestion`,
        composer: composer(4),
      }),
    ).toBeNull();
  });

  test("never forwards composer identity, command names, or raw text", () => {
    const hint = buildContextCompositionHintV2({
      message: "Skill body\n\nhello",
      composer: composer(10),
    });
    const serialized = JSON.stringify(hint);
    expect(serialized).not.toContain("plugin.example");
    expect(serialized).not.toContain("/skill hello");
    expect(serialized).not.toContain('"name"');
    expect(utf8Length(serialized)).toBeLessThanOrEqual(1024);
  });
});
