import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import AgentPanel from "./agent_panel";

test.each([
  "openai:gpt-6-sol", "openai:gpt-6-luna",
  "anthropic:claude-opus-5-5", "anthropic:claude-sonnet-5",
  "gemini:gemini-3.7-flash", "gemini:gemini-3.8-flash", "gemini:gemini-3.5-flash-lite",
])("selecting %s preserves its provider in the recipe override", (model) => {
  const recipe = {
    nodes: [{ id: "agent", type: "agent", override: {}, outputs: [] }], edges: [],
  };
  const onChange = jest.fn();
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <AgentPanel node={recipe.nodes[0]} recipe={recipe} onChange={onChange} />
    </ConfigContext.Provider>,
  );
  fireEvent.click(screen.getByText("(use recipe default)"));
  fireEvent.click(screen.getByText(model));
  expect(onChange.mock.calls[0][0].nodes[0].override.model).toBe(model);
});
