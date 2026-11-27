import { identity_of, own, safe_text } from "./document_values";
import { execution_keys_for, node_takes_inputs } from "./skeleton_document";
import { bounds_for } from "./output_schema_fields";
import { result_roots_for } from "./skeleton_result_roots";

/* A value out of a draft is not asked what it is, and it is not asked to be
   a string. `{"toString": null}` round-trips through the real store, and
   every way of making text out of it throws — including, which is the part
   that was missed, using it as a property key. */
const HOSTILE = { toString: null };

describe("a table is read with a key, and a key is a string", () => {
  test("a name out of a document that cannot become one answers nothing", () => {
    /* `hasOwnProperty.call(table, key)` coerces the key, so the LOOKUP throws
       on this value — which is why guarding the table was not enough. */
    expect(() => own({ a: 1 }, HOSTILE)).not.toThrow();
    expect(own({ a: 1 }, HOSTILE)).toBeUndefined();
  });

  test("a prototype member is still not an answer", () => {
    expect(own({}, "__proto__")).toBeUndefined();
    expect(own({}, "toString")).toBeUndefined();
    expect(own({ __proto__: 1 }, "__proto__")).toBeUndefined();
  });

  test("a stated key is answered", () => {
    expect(own({ a: 1 }, "a")).toBe(1);
    expect(own({ a: undefined }, "a")).toBeUndefined();
  });

  test("nothing else is a key either", () => {
    [null, undefined, 1, true, [], {}].forEach((key) => {
      expect(() => own({ a: 1 }, key)).not.toThrow();
      expect(own({ a: 1 }, key)).toBeUndefined();
    });
  });
});

describe("every table in this page that is keyed by something stored", () => {
  /* The same lookup, four readers. Fixing the one that was reported would
     have left three live, which is how this family keeps coming back. */
  test("a node type that cannot become text does not throw", () => {
    expect(() => execution_keys_for(HOSTILE)).not.toThrow();
    expect(execution_keys_for(HOSTILE)).toBe(null);
    expect(() => node_takes_inputs(HOSTILE)).not.toThrow();
  });

  test("a field type that cannot become text does not throw", () => {
    expect(() => bounds_for(HOSTILE)).not.toThrow();
    expect(bounds_for(HOSTILE)).toEqual([]);
  });

  test("a node whose type cannot become text still gets an inventory", () => {
    expect(() =>
      result_roots_for({ id: "n", type: HOSTILE, config: { execution: {} } }),
    ).not.toThrow();
  });
});

describe("a value shown as text, without asking it what it is", () => {
  test("a string is itself", () => {
    expect(safe_text("Summarizer")).toBe("Summarizer");
    expect(safe_text("")).toBe("");
  });

  test("the other JSON scalars say what they are", () => {
    expect(safe_text(null)).toBe("null");
    expect(safe_text(7)).toBe("7");
    expect(safe_text(false)).toBe("false");
    expect(safe_text(undefined)).toBe("nothing");
  });

  test("a shape is named rather than converted", () => {
    expect(safe_text([1, 2])).toBe("a list");
    expect(safe_text({})).toBe("an unreadable value");
    expect(() => safe_text(HOSTILE)).not.toThrow();
    expect(safe_text(HOSTILE)).toBe("an unreadable value");
  });
});

describe("an identity made of several stored names", () => {
  /* `a + ":" + b` is not an encoding: a delimiter that may appear inside the
     parts makes two different tuples the same string, and both of these are
     legal ids the real store saves and reloads. */
  test("a separator inside a part does not fake a boundary", () => {
    expect(identity_of(["r", "pool:a", "b"])).not.toBe(
      identity_of(["r", "pool", "a:b"]),
    );
    expect(identity_of(["r", "a", "b:c"])).not.toBe(identity_of(["r", "a:b", "c"]));
    expect(identity_of(['r", "x', "b"])).not.toBe(identity_of(["r", 'x", "b']));
  });

  test("the same tuple is the same identity", () => {
    expect(identity_of(["r", "pool", "sa1"])).toBe(identity_of(["r", "pool", "sa1"]));
  });

  test("a part that is not text does not throw", () => {
    expect(() => identity_of(["r", HOSTILE, "b"])).not.toThrow();
  });
});
