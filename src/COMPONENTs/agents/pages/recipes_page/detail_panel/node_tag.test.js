import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { AVATAR_DARK_GLYPH, AVATAR_LIGHT_GLYPH, avatar_glyph_color } from "../../../agent_avatar";
import NodeTag, { NODE_TAG_NAME_MAX, NodeRefTag, tint_of } from "./node_tag";
import { VariablePillValue } from "./variable_pill";
import InputVariablesSection from "./input_variables_section";
import { IDENTIFIED_NODE_TYPES, node_identity } from "./node_identity";
import { text } from "./panel_style";

jest.mock("../skeleton_resources", () => ({
  is_unavailable: () => false,
  list_resources: jest.fn(() => new Promise(() => {})),
  kernel_profiles: jest.fn(() => new Promise(() => {})),
}));

const wrap = (ui, dark = false) => (
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: dark ? "dark_mode" : "light_mode" }}>{ui}</ConfigContext.Provider>
);
const rgb = (hex) => `rgb(${[1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16)).join(", ")})`;
const out = (name, root) => ({ name, source: { kind: "result", path: [root] } });
const flow = (id, a, b) => ({ id, kind: "flow", source_node_id: a, source_port_id: "out", target_node_id: b, target_port_id: "in" });

function graph(inputs, extra = {}) {
  return {
    schema_version: 1, kind: "agent", id: "doc", name: "doc", ...extra,
    nodes: [
      { id: "start", type: "start", config: { execution: { outputs: [out("text", "text")] } } },
      { id: "agent", type: "agent", config: { execution: { inputs: [], outputs: [out("reply", "message")] } } },
      { id: "end", type: "end", config: { execution: { inputs, outputs: [] } } },
    ],
    edges: [flow("e1", "start", "agent"), flow("e2", "agent", "end")],
  };
}
const showEnd = (document, dark = false) => render(wrap(
  <InputVariablesSection document={document} node={document.nodes[2]} isDark={dark}
    onChange={() => {}} hideHeading addAtEnd breadcrumb />, dark));

describe("NodeTag", () => {
  test.each([false, true])("is a rounded rectangle filled with the step's colour, ink by luminance (dark=%s)", (dark) => {
    render(wrap(<NodeTag node={{ id: "s", type: "start", config: {} }} isDark={dark} testid="t" />, dark));
    const tag = screen.getByTestId("t");
    expect(tag.style.borderRadius).toBe("6px");
    expect(tag.style.height).toBe("22px");
    expect(tag.style.background).toBe(rgb("#2f9a68"));
    /* Start's green is light enough for near-black; the icon shares the ink. */
    expect(tag.style.color).toBe(rgb(AVATAR_DARK_GLYPH));
    expect(screen.getByTestId("t-icon").style.background).toBe("");
  });

  test("white ink on a dark or saturated colour", () => {
    render(wrap(<NodeTag node={{ id: "e", type: "end", config: {} }} isDark={false} testid="t" />));
    expect(screen.getByTestId("t").style.color).toBe(rgb(AVATAR_LIGHT_GLYPH));
  });

  test("every step colour gets the ink with the higher contrast, at least 3:1", () => {
    const L = (hex) => {
      const c = (o) => { const v = parseInt(hex.slice(o, o + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * c(1) + 0.7152 * c(3) + 0.0722 * c(5);
    };
    const ratio = (a, b) => { const [x, y] = [L(a), L(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    IDENTIFIED_NODE_TYPES.forEach((type) => {
      const fill = node_identity({ id: "x", type, config: {} }).gradient;
      const ink = avatar_glyph_color(fill);
      const other = ink === AVATAR_LIGHT_GLYPH ? AVATAR_DARK_GLYPH : AVATAR_LIGHT_GLYPH;
      expect(ratio(fill, ink)).toBeGreaterThanOrEqual(Math.max(3, ratio(fill, other)));
    });
  });

  test("an Agent node of an Agent document wears the Agent's own colour", () => {
    render(wrap(<NodeTag node={{ id: "a", type: "agent", config: {} }} presentation={{ icon: "bot", color: "#7c4dd8" }}
      isDark={false} testid="t" />));
    expect(screen.getByTestId("t").style.background).toBe(rgb("#7c4dd8"));
    expect(screen.getByTestId("t-avatar")).toHaveAttribute("data-agent-color", "#7c4dd8");
    expect(screen.getByTestId("t-avatar").style.color).toBe(rgb(AVATAR_LIGHT_GLYPH));
  });

  test("a long name ellipsises within its cap and keeps the whole name as its title", () => {
    const long = "A step with a very long name that will not fit";
    render(wrap(<NodeTag node={{ id: "c", type: "code", label: long, config: {} }} isDark={false} testid="t" />));
    const tag = screen.getByTestId("t");
    expect(tag).toHaveAttribute("title", long);
    // eslint-disable-next-line testing-library/no-node-access
    const name = tag.lastChild;
    expect(name.style.textOverflow).toBe("ellipsis");
    expect(name.style.maxWidth).toBe(`${NODE_TAG_NAME_MAX}px`);
  });
});

describe("a value read from a step is one tag", () => {
  test("node half in the step's fill, field half on a wash of it, one outline", () => {
    render(wrap(<NodeRefTag node={{ id: "s", type: "start", config: {} }} name="Start" detail="text" isDark={false} testid="r" />));
    const tag = screen.getByTestId("r");
    expect(tag).toHaveTextContent(/^Starttext$/);
    expect(tag.style.borderRadius).toBe("6px");
    expect(tag.style.overflow).toBe("hidden");
    expect(tag.style.background).toBe(tint_of("#2f9a68", 0.18));
    expect(screen.getByTestId("r-node").style.background).toBe(rgb("#2f9a68"));
    expect(screen.getByTestId("r-node").style.borderRadius).toMatch(/^0(px)?$/);
    expect(screen.getByTestId("r-field").style.color).toBe(rgb(text(false)));
    expect(within(tag).getByTestId("r-field")).toHaveTextContent("text");
  });

  test("a source that is not a step is the same tag in neutral", () => {
    render(wrap(<VariablePillValue label="Caller input" detail="message" isDark={false} testid="v" />));
    const tag = screen.getByTestId("v");
    expect(tag).toHaveTextContent(/^Caller inputmessage$/);
    expect(tag).toHaveAttribute("data-node-fill", "");
    expect(screen.getByTestId("v-node").style.background).toBe("rgba(0, 0, 0, 0.07)");
  });

  test("an End row's value is one tag: the Agent's colour, its name, and the field", () => {
    const document = graph([{ name: "answer", value: { kind: "ref", node_id: "agent", path: ["reply"] }, missing: "null" }],
      { presentation: { icon: "bot", color: "#7c4dd8" } });
    showEnd(document);
    const tag = screen.getByTestId("binding-row-0-tag");
    expect(tag).toHaveTextContent(/^agentreply$/);
    expect(tag).toHaveAttribute("data-node-fill", "#7c4dd8");
    expect(screen.getByTestId("binding-row-0-tag-node-avatar")).toHaveAttribute("data-agent-color", "#7c4dd8");
    /* Still one click target: the overlay ignores the pointer, the field under it opens the picker. */
    expect(screen.getByTestId("binding-row-0-selected").style.pointerEvents).toBe("none");
    fireEvent.click(within(screen.getByTestId("binding-row-0")).getByRole("textbox", { name: /^(?!name$).+/ }));
    /* The picker's options are the same tags: Start's field is offered too. */
    expect(screen.getByText("text", { exact: true })).toBeInTheDocument();
  });

  test("a Start source wears Start's green, in the dark too", () => {
    const document = graph([{ name: "q", value: { kind: "ref", node_id: "start", path: ["text"] }, missing: "null" }]);
    showEnd(document, true);
    const tag = screen.getByTestId("binding-row-0-tag");
    expect(tag).toHaveAttribute("data-node-fill", "#2f9a68");
    expect(tag.style.background).toBe(tint_of("#2f9a68", 0.22));
  });

  test("a source whose step is gone keeps its words, in neutral", () => {
    const document = graph([{ name: "q", value: { kind: "ref", node_id: "gone", path: ["text"] }, missing: "null" }]);
    showEnd(document);
    const tag = screen.getByTestId("binding-row-0-tag");
    expect(tag).toHaveTextContent(/^gonetext$/);
    expect(tag).toHaveAttribute("data-node-fill", "");
  });
});
