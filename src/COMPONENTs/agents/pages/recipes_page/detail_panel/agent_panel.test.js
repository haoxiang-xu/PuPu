import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import AgentPanel from "./agent_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

describe("AgentPanel", () => {
  test("renders current prompt value", () => {
    const recipe = {
      nodes: [
        {
          id: "start",
          type: "start",
          outputs: [{ name: "text", type: "string" }],
        },
        {
          id: "a1",
          type: "agent",
          override: { model: "m", prompt: "Hi {{#start.text#}}" },
          outputs: [{ name: "output", type: "string" }],
        },
      ],
      edges: [
        {
          id: "e",
          kind: "flow",
          source_node_id: "start",
          source_port_id: "out",
          target_node_id: "a1",
          target_port_id: "in",
        },
      ],
    };
    const { container } = render(
      wrap(
        <AgentPanel
          node={recipe.nodes[1]}
          recipe={recipe}
          onChange={() => {}}
        />,
      ),
    );
    expect(container.querySelector('[data-var-chip="start.text"]')).toBeTruthy();
  });

  test("clicking an input variable appends it to the prompt", () => {
    const onChangeSilent = jest.fn();
    const recipe = {
      nodes: [
        {
          id: "start",
          type: "start",
          outputs: [{ name: "text", type: "string" }],
        },
        {
          id: "a1",
          type: "agent",
          override: { model: "m", prompt: "Hi " },
          outputs: [],
        },
      ],
      edges: [
        {
          id: "e",
          kind: "flow",
          source_node_id: "start",
          source_port_id: "out",
          target_node_id: "a1",
          target_port_id: "in",
        },
      ],
    };
    render(
      wrap(
        <AgentPanel
          node={recipe.nodes[1]}
          recipe={recipe}
          onChange={() => {}}
          onChangeSilent={onChangeSilent}
        />,
      ),
    );
    fireEvent.click(screen.getByText("start.text"));
    expect(onChangeSilent).toHaveBeenCalled();
    const call = onChangeSilent.mock.calls[0][0];
    expect(call.nodes[1].override.prompt).toBe("Hi {{#start.text#}}");
  });

  test("+ Add field appends a new output row", () => {
    const onChange = jest.fn();
    const recipe = {
      nodes: [
        {
          id: "a1",
          type: "agent",
          override: { model: "m", prompt: "" },
          outputs: [],
        },
      ],
      edges: [],
    };
    render(
      wrap(
        <AgentPanel
          node={recipe.nodes[0]}
          recipe={recipe}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(screen.getByText("+ Add field"));
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].outputs).toEqual([{ name: "", type: "string" }]);
  });

  test("renders optimizer controls and disabling writes the off preset", () => {
    const onChange = jest.fn();
    const recipe = {
      nodes: [
        {
          id: "a1",
          type: "agent",
          override: { model: "m", prompt: "", optimizer: { preset: "default" } },
          outputs: [],
        },
      ],
      edges: [],
    };
    const { container } = render(
      wrap(
        <AgentPanel
          node={recipe.nodes[0]}
          recipe={recipe}
          onChange={onChange}
        />,
      ),
    );

    expect(screen.getByText("Context Optimizer")).toBeTruthy();
    fireEvent.click(
      container
        .querySelector('[data-testid="optimizer-enabled-switch"]')
        .querySelector(".mini-ui-switch-track"),
    );

    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].override.optimizer).toEqual({
      preset: "off",
      enabled: false,
    });
  });

  test("custom optimizer fields clamp and write full config", () => {
    const onChange = jest.fn();
    const recipe = {
      nodes: [
        {
          id: "a1",
          type: "agent",
          override: {
            model: "m",
            prompt: "",
            optimizer: {
              preset: "custom",
              sliding_window: {
                enabled: true,
                max_window_pct: 0.5,
                max_window_tokens: null,
              },
              tool_history_compaction: {
                enabled: true,
                keep_completed_turns: 1,
                max_chars: 1200,
                preview_chars: 160,
                hash_payloads: true,
              },
              context_usage: { enabled: true },
              tool_pair_safety: { enabled: true },
            },
          },
          outputs: [],
        },
      ],
      edges: [],
    };
    render(
      wrap(
        <AgentPanel
          node={recipe.nodes[0]}
          recipe={recipe}
          onChange={onChange}
        />,
      ),
    );

    fireEvent.change(screen.getByDisplayValue("0.5"), {
      target: { value: "0.01" },
    });

    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].override.optimizer.preset).toBe("custom");
    expect(
      call.nodes[0].override.optimizer.sliding_window.max_window_pct,
    ).toBe(0.05);
  });
});
