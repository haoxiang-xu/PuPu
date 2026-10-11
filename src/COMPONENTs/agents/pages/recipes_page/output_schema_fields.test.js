import {
  BOUNDS_BY_TYPE,
  FIELD_TYPES,
  ITEM_TYPES,
  colliding_field_names,
  fields_hold_schema,
  free_field_name,
  new_field,
  same_json,
  schema_fields,
  schema_from_fields,
  why_fields_cannot_hold,
} from "./output_schema_fields";
import { output_schema_problems } from "./output_schema";
import { CAPTURED_FIELD_SCHEMAS } from "./output_schema_fields_capture";
import { CAPTURED_SCHEMA_ADMISSION } from "./output_schema_admission_capture";

describe("what the rows compose, the runtime takes", () => {
  CAPTURED_FIELD_SCHEMAS.forEach((case_) => {
    test(`${case_.label}`, () => {
      /* The capture records the real verdict; a composed schema it refused
         would be the editor building something unsaveable. */
      expect(case_.accepted).toBe(true);
      expect(output_schema_problems(case_.doc)).toEqual([]);
    });
  });

  test("the set covers every type the rows offer", () => {
    const labels = CAPTURED_FIELD_SCHEMAS.map((c) => c.label).join(" | ");
    FIELD_TYPES.forEach((type) => expect(labels).toContain(`one ${type} field`));
    ITEM_TYPES.forEach((type) => expect(labels).toContain(`a list of ${type}`));
  });

  test("and every bound, at its own zero", () => {
    const labels = CAPTURED_FIELD_SCHEMAS.map((c) => c.label);
    Object.entries(BOUNDS_BY_TYPE).forEach(([type, bounds]) =>
      bounds.forEach((bound) => expect(labels).toContain(`${type} with ${bound} at 0`)),
    );
  });
});

describe("a schema the rows can hold survives the round trip exactly", () => {
  CAPTURED_FIELD_SCHEMAS.forEach((case_) => {
    test(`${case_.label}`, () => {
      expect(fields_hold_schema(case_.doc)).toBe(true);
      const { fields, closed, root } = schema_fields(case_.doc);
      expect(same_json(schema_from_fields(fields, closed, root), case_.doc)).toBe(true);
    });
  });

  test("a field name is carried as it is, not as an identifier", () => {
    /* These are legal property names and an editor that normalised them would
       rename an author's field without saying so. */
    ["", "a.b", "a/b", "a~b", "two words", "输出"].forEach((name) => {
      const schema = schema_from_fields([{ ...new_field(name) }], false);
      expect(Object.keys(schema.properties)).toEqual([name]);
      expect(schema_fields(schema).fields[0].name).toBe(name);
    });
  });

  test("an absent bound stays absent rather than becoming null", () => {
    /* `null` is not a value any of these keywords takes, so writing one would
       turn an untouched row into a refused document. */
    const schema = schema_from_fields([{ ...new_field("a"), type: "string" }], false);
    expect(schema.properties.a).toEqual({ type: "string" });
  });

  test("closing the schema is what the result list reads as closed", () => {
    expect(schema_from_fields([new_field("a")], true).additionalProperties).toBe(false);
    expect(
      "additionalProperties" in schema_from_fields([new_field("a")], false),
    ).toBe(false);
  });
});

describe("admitted schemas the rows do hold", () => {
  /* Not composed by the composer: these come from the admission capture, which
     was enumerated from the validator. The rows have to hold a real schema,
     not only one they built. */
  [
    "$schema at the admitted dialect",
    "required naming its properties",
    "additionalProperties as false",
    "items on an array property",
    "minimum that is a float",
    "a property named with the empty string",
    "minLength on a nested string",
  ].forEach((label) => {
    test(`${label}`, () => {
      const case_ = CAPTURED_SCHEMA_ADMISSION.find((c) => c.label === label);
      expect(case_).toBeTruthy();
      expect(case_.accepted).toBe(true);
      expect(fields_hold_schema(case_.doc)).toBe(true);
    });
  });

  test("the dialect is carried even though no control shows it", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: { a: { type: "string" } },
    };
    const { fields, closed, root } = schema_fields(schema);
    expect(schema_from_fields(fields, closed, root).$schema).toBe(schema.$schema);
  });

  test("a root description is carried and is the author's own words", () => {
    const schema = {
      type: "object",
      description: "the classification and why",
      properties: {},
    };
    expect(fields_hold_schema(schema)).toBe(true);
    expect(schema_fields(schema).root.description).toBe("the classification and why");
  });
});

describe("a schema the rows cannot hold is not offered to them", () => {
  const admitted = CAPTURED_SCHEMA_ADMISSION.filter((c) => c.accepted);

  [
    "$ref with a ~1 escape",
    "a nested type given as a list",
    "enum of scalars",
    "const of null",
    "anyOf of two object alternatives",
    "nesting at the deepest the runtime takes",
  ].forEach((label) => {
    test(`${label} is recognised as beyond them`, () => {
      const case_ = CAPTURED_SCHEMA_ADMISSION.find((c) => c.label === label);
      expect(case_).toBeTruthy();
      expect(case_.accepted).toBe(true);
      expect(fields_hold_schema(case_.doc)).toBe(false);
      expect(why_fields_cannot_hold(case_.doc)).toMatch(/\S/);
    });
  });

  test("a root with no type at all is not row-shaped either", () => {
    /* The runtime refuses it, and the rows would silently add the `type` that
       makes it admissible — which is composing a different schema than the one
       on screen. */
    expect(fields_hold_schema({ properties: { a: { type: "string" } } })).toBe(false);
  });

  test("every admitted schema is either row-shaped or has a reason it is not", () => {
    /* No third state: the structured view is shown, or the reason is. */
    admitted.forEach((case_) => {
      if (fields_hold_schema(case_.doc)) return;
      expect(why_fields_cannot_hold(case_.doc)).toMatch(/\S/);
    });
  });

  test("the reason names the construct rather than blaming the schema", () => {
    expect(
      why_fields_cannot_hold({
        type: "object",
        $ref: "#/$defs/A",
        $defs: { A: { type: "object" } },
      }),
    ).toMatch(/definition/i);
    expect(
      why_fields_cannot_hold({
        type: "object",
        properties: { a: { type: "object", properties: {} } },
      }),
    ).toMatch(/nested object/i);
    expect(
      why_fields_cannot_hold({ type: "object", properties: { a: { enum: ["x"] } } }),
    ).toMatch(/fixed set/i);
  });

  test("a nested object is not flattened into a field", () => {
    const schema = {
      type: "object",
      properties: { outer: { type: "object", properties: { inner: { type: "string" } } } },
    };
    expect(fields_hold_schema(schema)).toBe(false);
  });

  test("something that is not a schema at all is refused, not guessed at", () => {
    [null, undefined, 7, "nope", []].forEach((value) => {
      expect(fields_hold_schema(value)).toBe(false);
      expect(() => why_fields_cannot_hold(value)).not.toThrow();
    });
  });
});

describe("same_json compares meaning, not spelling", () => {
  test("object key order does not matter", () => {
    expect(same_json({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  test("array order does", () => {
    /* `required` and `enum` are arrays the runtime keeps in order. */
    expect(same_json(["a", "b"], ["b", "a"])).toBe(false);
  });

  test("a missing key is not an undefined one", () => {
    expect(same_json({ a: 1 }, { a: 1, b: undefined })).toBe(false);
  });
});

describe("the reason is derived, not guessed", () => {
  /* Both of these are legal, benign and invisible, and both would have the
     rows rewrite the document if they claimed to hold them. A shrug would
     leave the author with no idea why the fields are not on offer. */
  test("an empty required list is named", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" } },
      required: [],
    };
    expect(fields_hold_schema(schema)).toBe(false);
    expect(why_fields_cannot_hold(schema)).toMatch(/empty list of required/i);
  });

  test("a required list ordered differently from the fields is named", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["b", "a"],
    };
    expect(fields_hold_schema(schema)).toBe(false);
    expect(why_fields_cannot_hold(schema)).toMatch(/different order/i);
  });

  test("the same list in the fields' own order is held", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "string" } },
      required: ["a", "b"],
    };
    expect(fields_hold_schema(schema)).toBe(true);
  });
});

describe("a name JavaScript treats specially is still a field name", () => {
  /* The runtime reserves `message` and `context` and nothing else. It admits
     a field called `__proto__`, and publishes one — the capture records the
     real `parse_kernel_output` doing it. Assigning that key onto a plain
     object calls the prototype setter instead of creating the property, so
     the field was composed away into an empty `properties`. */
  ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"].forEach((name) => {
    test(`${name} survives composition`, () => {
      const schema = schema_from_fields([{ ...new_field(name), type: "string" }], false);
      expect(Object.keys(schema.properties)).toEqual([name]);
      expect(JSON.parse(JSON.stringify(schema)).properties[name]).toEqual({
        type: "string",
      });
    });

    test(`${name} survives the round trip`, () => {
      const schema = JSON.parse(
        JSON.stringify({ type: "object", properties: { [name]: { type: "string" } } }),
      );
      expect(fields_hold_schema(schema)).toBe(true);
      expect(schema_fields(schema).fields.map((f) => f.name)).toEqual([name]);
    });
  });

  test("required carries such a name too", () => {
    const schema = schema_from_fields(
      [{ ...new_field("__proto__"), type: "string", required: true }],
      true,
    );
    expect(schema.required).toEqual(["__proto__"]);
    expect(fields_hold_schema(JSON.parse(JSON.stringify(schema)))).toBe(true);
  });
});

describe("two fields cannot share a name, and neither is thrown away", () => {
  /* A JSON object has one value per key, so a colliding rename cannot be
     written at all — and writing it anyway deleted the other field's whole
     declaration and moved its required marker across. The composer must not be
     the thing that decides; it must not be able to lose a row. */
  test("the composer reports the collision instead of resolving it", () => {
    const rows = [
      { ...new_field("score"), type: "string", required: true },
      { ...new_field("score"), type: "number" },
    ];
    expect(colliding_field_names(rows)).toEqual(["score"]);
  });

  test("a list with no collision reports none", () => {
    expect(colliding_field_names([new_field("a"), new_field("b")])).toEqual([]);
  });

  test("the empty name collides with itself like any other", () => {
    expect(colliding_field_names([new_field(""), new_field("")])).toEqual([""]);
  });

  test("a name JavaScript treats specially collides like any other", () => {
    expect(
      colliding_field_names([new_field("__proto__"), new_field("__proto__")]),
    ).toEqual(["__proto__"]);
  });

  test("three rows sharing a name report it once", () => {
    expect(
      colliding_field_names([new_field("a"), new_field("a"), new_field("a")]),
    ).toEqual(["a"]);
  });
});

describe("a declared type the rows have no control for", () => {
  test("does not throw on the way to saying so", () => {
    /* `BOUNDS_BY_TYPE[type]` on a plain object answers `Object.prototype` for
       `__proto__`, and `.forEach` on that is not a function — so the panel
       died inside the code that was about to explain the problem. Third time
       in this ticket. */
    const schema = { type: "object", properties: { a: { type: "__proto__" } } };
    expect(() => fields_hold_schema(schema)).not.toThrow();
    expect(fields_hold_schema(schema)).toBe(false);
    expect(() => why_fields_cannot_hold(schema)).not.toThrow();
  });

  test("the reason says the type is not one the rows know", () => {
    expect(
      why_fields_cannot_hold({ type: "object", properties: { a: { type: "constructor" } } }),
    ).toMatch(/type/i);
  });

  test("a keyword named like a prototype member is not read off the prototype", () => {
    expect(() =>
      why_fields_cannot_hold({
        type: "object",
        properties: JSON.parse('{"a":{"type":"string","__proto__":{}}}'),
      }),
    ).not.toThrow();
  });
});

describe("a new row needs a name it can be written under", () => {
  test("nothing is taken, so the empty name is free", () => {
    expect(free_field_name([])).toBe("");
  });

  test("the empty name is taken, so a placeholder is used", () => {
    expect(free_field_name([""])).toBe("field");
  });

  test("the placeholder is taken too, so the next one is used", () => {
    expect(free_field_name(["", "field"])).toBe("field_2");
    expect(free_field_name(["", "field", "field_2"])).toBe("field_3");
  });

  test("the name it returns is never one of the taken ones", () => {
    [
      [],
      [""],
      ["", "field"],
      ["", "field", "field_2", "field_3"],
      ["a", "b"],
      ["", "__proto__"],
    ].forEach((taken) => {
      expect(taken).not.toContain(free_field_name(taken));
    });
  });

  test("a row added under that name composes to a real field", () => {
    const taken = [""];
    const name = free_field_name(taken);
    const schema = schema_from_fields(
      [{ ...new_field("") }, { ...new_field(name) }],
      false,
    );
    expect(Object.keys(schema.properties).sort()).toEqual(["", name].sort());
    expect(colliding_field_names([new_field(""), new_field(name)])).toEqual([]);
  });
});
