import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import { TOOLKIT_POOL_TYPE } from "../recipe_graph";

const wrap = (ui, dark = false) => (
  <ConfigContext.Provider
    value={{ theme: {}, onThemeMode: dark ? "dark_mode" : "light_mode" }}
  >
    {ui}
  </ConfigContext.Provider>
);

const show = (document, selectedNodeId, dark = false) =>
  render(
    wrap(
      <DetailPanel
        document={document}
        onDocumentChange={() => {}}
        selectedNodeId={selectedNodeId}
      />,
      dark,
    ),
  );

const shell = (c) => c.querySelector('[data-testid="recipe-detail-panel"]');
const body = (c) => c.querySelector('[data-testid="recipe-detail-panel-body"]');
const header = (c) =>
  c.querySelector('[data-testid="recipe-detail-panel-header"]');

/* One node in a native document; `config` is the node's own settings. */
const one = (id, type, config = {}, extra = {}) => ({
  schema_version: 1,
  kind: "agent",
  id: "d",
  name: "D",
  nodes: [{ id, type, config: { execution: { inputs: [], outputs: [] }, ...config }, ...extra }],
  edges: [],
});

describe("DetailPanel shell", () => {
  test("only the body scrolls — the shell itself does not", () => {
    const { container } = show(one("start", "start"), "start");

    /* The scroll plumbing moved off the outer element, because the outer
     * element is what keeps the header still. */
    expect(body(container)).toHaveClass("scrollable");
    expect(body(container)).toHaveAttribute("data-sb-wall", "4");
    expect(body(container)).toHaveAttribute("data-sb-edge", "2");
    expect(body(container)).toHaveAttribute("data-sb-edge-top", "4");
    expect(body(container)).toHaveAttribute("data-sb-edge-bottom", "12");

    expect(shell(container)).not.toHaveClass("scrollable");
    expect(shell(container).style.overflowY).toBe("");
  });

  test("the header is a sibling of the body, not inside it", () => {
    const { container } = show(one("start", "start"), "start");
    expect(header(container)).toBeTruthy();
    expect(body(container).contains(header(container))).toBe(false);
    expect(header(container).style.flexShrink).toBe("0");
  });

  test("the empty state keeps the scroll plumbing and draws no header", () => {
    const { container } = show(one("start", "start"), null);
    expect(screen.getByText(/select a node/i)).toBeInTheDocument();
    expect(header(container)).toBeNull();
    expect(body(container)).toHaveClass("scrollable");
    expect(body(container)).toHaveAttribute("data-sb-edge-top", "36");
  });
});

describe("DetailPanel identity header", () => {
  test.each([
    ["start", "start", {}, "Start", "Workflow entry"],
    ["end", "end", {}, "End", "Workflow exit"],
    [
      "tp_1",
      TOOLKIT_POOL_TYPE,
      { toolkits: [{ id: "a", enabled_tools: null }] },
      "Toolkit Pool",
      "1 toolkit",
    ],
    [
      "sp_1",
      "subagent_pool",
      { subagents: [] },
      "Subagent Pool",
      "No subagents",
    ],
  ])(
    "%s draws its title and subtitle in the header",
    (id, type, extra, title, subtitle) => {
      const { container } = show(one(id, type, extra), id);
      expect(within(header(container)).getByText(title)).toBeInTheDocument();
      expect(within(header(container)).getByText(subtitle)).toBeInTheDocument();
    },
  );

  test("an agent node is titled by its own label and names its stored model", () => {
    const { container: named } = show(
      one("agent_1", "agent", { kernel: { profile: { model: "gpt-4.1" } } }, { label: "triage" }),
      "agent_1",
    );
    expect(within(header(named)).getByText("triage")).toBeInTheDocument();
    expect(within(header(named)).getByText("gpt-4.1")).toBeInTheDocument();
  });

  test("the panel body no longer repeats the title", () => {
    const { container } = show(one("start", "start"), "start");
    expect(within(header(container)).getByText("Start")).toBeInTheDocument();
    expect(
      within(body(container)).queryByText("Start"),
    ).not.toBeInTheDocument();
  });

  test("a node type with no identity still renders its body", () => {
    const { container } = show(one("x", "nonsense"), "x");
    expect(header(container)).toBeNull();
    expect(body(container)).toBeTruthy();
  });

  test("the header keeps both theme branches", () => {
    const { container: light } = show(
      one("start", "start"),
      "start",
    );
    const { container: dark } = show(
      one("start", "start"),
      "start",
      true,
    );
    const lightBorder = header(light).style.borderBottom;
    const darkBorder = header(dark).style.borderBottom;
    expect(lightBorder).toBeTruthy();
    expect(darkBorder).toBeTruthy();
    expect(lightBorder).not.toBe(darkBorder);
  });
});
