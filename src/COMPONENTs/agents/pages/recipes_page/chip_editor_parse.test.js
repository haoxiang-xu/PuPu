import { parse_chip_string, serialize_chip_nodes } from "./chip_editor_parse";

describe("parse_chip_string", () => {
  test("plain text returns single text node", () => {
    expect(parse_chip_string("Hello")).toEqual([
      { kind: "text", value: "Hello" },
    ]);
  });
  test("single variable in middle", () => {
    expect(parse_chip_string("a {{#start.text#}} b")).toEqual([
      { kind: "text", value: "a " },
      { kind: "var", node_id: "start", field: "text" },
      { kind: "text", value: " b" },
    ]);
  });
  test("leading variable", () => {
    expect(parse_chip_string("{{#a.out#}}x")).toEqual([
      { kind: "var", node_id: "a", field: "out" },
      { kind: "text", value: "x" },
    ]);
  });
  test("two adjacent variables", () => {
    expect(parse_chip_string("{{#a.o#}}{{#b.o#}}")).toEqual([
      { kind: "var", node_id: "a", field: "o" },
      { kind: "var", node_id: "b", field: "o" },
    ]);
  });
  test("empty string returns empty array", () => {
    expect(parse_chip_string("")).toEqual([]);
  });
});

describe("serialize_chip_nodes", () => {
  test("round-trips text + var", () => {
    const nodes = [
      { kind: "text", value: "a " },
      { kind: "var", node_id: "start", field: "text" },
      { kind: "text", value: " b" },
    ];
    expect(serialize_chip_nodes(nodes)).toBe("a {{#start.text#}} b");
  });
});
