import {
  AGENT_PRESET_COLORS,
  DEFAULT_AGENT_PRESENTATION,
  normalize_presentation,
  reset_presentation,
  resolve_presentation,
  set_presentation,
  subscribe_presentation,
  with_document_presentation,
} from "./agent_resource_icons";

/* An Agent's presentation lives in its document; this module only knows the
   CLOSED shape {icon?, color?} and hands writes to whoever owns the document. */
describe("reading a presentation", () => {
  test("keeps exactly icon and color, lowercases hex, drops everything else", () => {
    expect(normalize_presentation({ icon: "robot_face", color: "#2E8F5A", extra: 1 })).toEqual({ icon: "robot_face", color: "#2e8f5a" });
    expect(Object.keys(normalize_presentation({ icon: "bot", color: "#d23f37", z: true }))).toEqual(["icon", "color"]);
  });

  test("an unknown icon or a malformed colour is dropped, and nothing valid reads as null", () => {
    expect(normalize_presentation({ icon: "nope", color: "#12345" })).toBeNull();
    expect(normalize_presentation({ icon: "constructor", color: "red" })).toBeNull();
    expect(normalize_presentation({ icon: "nope", color: "#1d8798" })).toEqual({ color: "#1d8798" });
    [null, undefined, "bot", 3, [], {}].forEach((raw) => expect(normalize_presentation(raw)).toBeNull());
  });

  test("never throws, even on a getter that does", () => {
    const hostile = {};
    Object.defineProperty(hostile, "icon", { enumerable: true, get() { throw new Error("boom"); } });
    expect(normalize_presentation(hostile)).toBeNull();
    expect(resolve_presentation(hostile)).toEqual(DEFAULT_AGENT_PRESENTATION);
  });

  test("resolve fills in the default per key", () => {
    expect(DEFAULT_AGENT_PRESENTATION).toEqual({ icon: "bot", color: "#4a5bd8" });
    expect(resolve_presentation(undefined)).toEqual({ icon: "bot", color: "#4a5bd8" });
    expect(resolve_presentation({ icon: "kimi" })).toEqual({ icon: "kimi", color: "#4a5bd8" });
    expect(resolve_presentation({ icon: "?", color: "#6E6E73" })).toEqual({ icon: "bot", color: "#6e6e73" });
  });
});

describe("writing it into a document", () => {
  const doc = Object.freeze({ schema_version: 1, kind: "agent", id: "a", name: "A", nodes: [], edges: [] });

  test("sets only the normalised shape, removes the key for null, and leaves an unchanged document alone", () => {
    const set = with_document_presentation(doc, { icon: "gemini", color: "#C0398F", bogus: 1 });
    expect(set.presentation).toEqual({ icon: "gemini", color: "#c0398f" });
    expect(doc).not.toHaveProperty("presentation");
    expect(with_document_presentation(set, { color: "#c0398f", icon: "gemini" })).toBe(set);
    const removed = with_document_presentation(set, null);
    expect(removed).not.toHaveProperty("presentation");
    expect(Object.keys(removed)).toEqual(Object.keys(doc));
    expect(with_document_presentation(doc, null)).toBe(doc);
    /* Nothing valid to store reads as "remove": the default. */
    expect(with_document_presentation(set, { icon: "nope" })).not.toHaveProperty("presentation");
  });
});

describe("set / reset through an injected writer", () => {
  test("hands the writer the normalised value, round-trips, and notifies listeners", async () => {
    const stored = Object.create(null);
    const write = jest.fn(async (id, value) => {
      if (value === null) delete stored[id];
      else stored[id] = JSON.parse(JSON.stringify(value));
      return { ok: true };
    });
    const heard = jest.fn();
    const off = subscribe_presentation(heard);
    for (const id of ["constructor", "__proto__", "agent-1"]) {
      const answer = await set_presentation(id, { icon: "robot_bust", color: "#D9622B", nope: 1 }, { write });
      expect(answer).toEqual({ ok: true, presentation: { icon: "robot_bust", color: "#d9622b" } });
      expect(write).toHaveBeenLastCalledWith(id, { icon: "robot_bust", color: "#d9622b" });
      expect(resolve_presentation(stored[id])).toEqual({ icon: "robot_bust", color: "#d9622b" });
      expect(heard).toHaveBeenLastCalledWith({ resourceId: id, presentation: { icon: "robot_bust", color: "#d9622b" } });
    }
    expect(Object.keys(stored).sort()).toEqual(["__proto__", "agent-1", "constructor"]);
    expect({}.icon).toBeUndefined();
    await reset_presentation("constructor", { write });
    expect(write).toHaveBeenLastCalledWith("constructor", null);
    expect(Object.prototype.hasOwnProperty.call(stored, "constructor")).toBe(false);
    expect(heard).toHaveBeenLastCalledWith({ resourceId: "constructor", presentation: null });
    off();
    await set_presentation("agent-1", { icon: "bot" }, { write });
    expect(heard).toHaveBeenCalledTimes(4);
  });

  test("a refused or failing write is reported and not announced", async () => {
    const heard = jest.fn();
    const off = subscribe_presentation(heard);
    expect(await set_presentation("a", { icon: "bot" }, { write: async () => ({ ok: false, code: "source_api_required" }) }))
      .toEqual({ ok: false, code: "source_api_required" });
    const thrown = await set_presentation("a", { icon: "bot" }, { write: () => { throw Object.assign(new Error("x"), { code: "edit_conflict" }); } });
    expect(thrown.ok).toBe(false);
    expect(thrown.code).toBe("edit_conflict");
    expect(await set_presentation("a", { icon: "bot" })).toEqual({ ok: false, code: "presentation_writer_missing" });
    expect(heard).not.toHaveBeenCalled();
    off();
  });

  test("a listener that throws does not stop the others", async () => {
    const second = jest.fn();
    const offA = subscribe_presentation(() => { throw new Error("bad listener"); });
    const offB = subscribe_presentation(second);
    await set_presentation("a", { color: "#7c4dd8" }, { write: () => ({ ok: true }) });
    expect(second).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });
});

describe("the palette", () => {
  const luminance = (hex) => {
    const channel = (offset) => {
      const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  test("is eleven lowercase colours, the default first", () => {
    expect(AGENT_PRESET_COLORS).toHaveLength(11);
    expect(AGENT_PRESET_COLORS[0]).toBe(DEFAULT_AGENT_PRESENTATION.color);
    expect(new Set(AGENT_PRESET_COLORS).size).toBe(11);
    AGENT_PRESET_COLORS.forEach((color) => expect(color).toMatch(/^#[0-9a-f]{6}$/));
  });

  test.each(AGENT_PRESET_COLORS)("%s reaches 3:1 on the dark and light lists and under a white glyph", (color) => {
    expect(contrast(color, "#1e1e1e")).toBeGreaterThanOrEqual(3);
    expect(contrast(color, "#f5f5f5")).toBeGreaterThanOrEqual(3);
    expect(contrast(color, "#ffffff")).toBeGreaterThanOrEqual(3);
  });

  test("a well-formed colour outside the palette reads as the default and is never written", () => {
    expect(normalize_presentation({ icon: "kimi", color: "#123456" })).toEqual({ icon: "kimi" });
    expect(resolve_presentation({ color: "#2F9A68" }).color).toBe("#4a5bd8");
    const doc = { schema_version: 1, kind: "agent", id: "a", name: "A", nodes: [], edges: [] };
    expect(with_document_presentation(doc, { color: "#123456" })).toBe(doc);
  });
});
