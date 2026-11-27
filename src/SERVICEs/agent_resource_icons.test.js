import * as icons from "./agent_resource_icons";
import {
  DEFAULT_AGENT_PRESENTATION,
  normalize_presentation,
  presentation_to_store,
  reset_presentation,
  resolve_presentation,
  set_presentation,
  subscribe_presentation,
} from "./agent_resource_icons";

/* An Agent's presentation lives in its document; this module only knows the
   CLOSED shape {icon?, color?}, reads both (a legacy document still loads),
   draws only the icon and writes only `{ icon }`. */
describe("reading a presentation", () => {
  test("keeps exactly icon and color, lowercases hex, drops everything else", () => {
    expect(normalize_presentation({ icon: "robot_face", color: "#2E8F5A", extra: 1 })).toEqual({ icon: "robot_face", color: "#2e8f5a" });
    expect(Object.keys(normalize_presentation({ icon: "bot", color: "#d23f37", z: true }))).toEqual(["icon", "color"]);
  });

  test("a legacy colour in the stored format is read whatever its value", () => {
    expect(normalize_presentation({ icon: "kimi", color: "#123456" })).toEqual({ icon: "kimi", color: "#123456" });
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

  test("resolve draws the stored icon and always the default colour: a stored colour is ignored", () => {
    expect(DEFAULT_AGENT_PRESENTATION).toEqual({ icon: "bot", color: "#4a5bd8" });
    expect(resolve_presentation(undefined)).toEqual({ icon: "bot", color: "#4a5bd8" });
    expect(resolve_presentation({ icon: "kimi" })).toEqual({ icon: "kimi", color: "#4a5bd8" });
    expect(resolve_presentation({ icon: "kimi", color: "#d23f37" })).toEqual({ icon: "kimi", color: "#4a5bd8" });
    expect(resolve_presentation({ icon: "?", color: "#6E6E73" })).toEqual({ icon: "bot", color: "#4a5bd8" });
  });
});

describe("the value to store", () => {
  test("is { icon } alone: a colour, legacy or new, is never written", () => {
    expect(presentation_to_store({ icon: "gemini", color: "#C0398F", bogus: 1 })).toStrictEqual({ icon: "gemini" });
    expect(presentation_to_store({ icon: "gemini" })).toStrictEqual({ icon: "gemini" });
  });

  test("the default icon, no icon or nothing valid is null: remove the key", () => {
    expect(presentation_to_store({ icon: "bot" })).toBeNull();
    expect(presentation_to_store({ color: "#123456" })).toBeNull();
    expect(presentation_to_store({ icon: "nope" })).toBeNull();
    expect(presentation_to_store(null)).toBeNull();
  });

  test("there is no palette and no document helper any more", () => {
    expect(icons).not.toHaveProperty("AGENT_PRESET_COLORS");
    expect(icons).not.toHaveProperty("normalize_color");
    expect(icons).not.toHaveProperty("with_document_presentation");
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
      expect(answer).toEqual({ ok: true, presentation: { icon: "robot_bust" } });
      expect(write).toHaveBeenLastCalledWith(id, { icon: "robot_bust" });
      expect(stored[id]).toStrictEqual({ icon: "robot_bust" });
      expect(heard).toHaveBeenLastCalledWith({ resourceId: id, presentation: { icon: "robot_bust" } });
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
    await set_presentation("a", { icon: "kimi" }, { write: () => ({ ok: true }) });
    expect(second).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });
});
