import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import SubagentPicker from "./subagent_picker";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listRecipes: jest.fn(),
    },
  },
}));

jest.mock("../../../../BUILTIN_COMPONENTs/modal/modal", () => {
  return function MockModal({ children }) {
    return <div>{children}</div>;
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/input/input", () => {
  return function MockInput({ value, set_value, placeholder }) {
    return (
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => set_value(event.target.value)}
      />
    );
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/input/textfield", () => {
  return function MockTextField({ value, set_value, placeholder }) {
    return (
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => set_value(event.target.value)}
      />
    );
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, disabled, onClick }) {
    return (
      <button type="button" disabled={disabled} onClick={onClick}>
        {label || "button"}
      </button>
    );
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/input/segmented_button", () => {
  return function MockSegmentedButton({ options, value, on_change }) {
    return (
      <div>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => on_change(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  };
});

test("references another Agent as a recipe_ref subagent", async () => {
  const onPick = jest.fn();
  api.unchain.listRecipes.mockResolvedValue({
    recipes: [
      { name: "Default", description: "main" },
      { name: "Explore", description: "scout" },
    ],
  });

  render(
    <SubagentPicker
      onPick={onPick}
      onClose={() => {}}
      isDark={false}
      currentRecipeName="Default"
    />,
  );

  expect(await screen.findByText("Explore")).toBeInTheDocument();
  expect(screen.queryByText("Default")).not.toBeInTheDocument();

  fireEvent.click(screen.getByText("Explore"));
  expect(onPick).toHaveBeenCalledWith({
    kind: "recipe_ref",
    recipe_name: "Explore",
    disabled_tools: [],
  });
});

test("a Workflow is not offered and cannot be picked", async () => {
  /* The pool holds Agents only. A resource that declares itself a Workflow must
   * not reach the list, so there is no row to click — this is the add gate every
   * route passes through. */
  const onPick = jest.fn();
  api.unchain.listRecipes.mockResolvedValue({
    recipes: [
      { name: "Explore", description: "scout", kind: "agent" },
      { name: "Nightly", description: "non-LLM cleanup", kind: "workflow" },
    ],
  });

  render(
    <SubagentPicker
      onPick={onPick}
      onClose={() => {}}
      isDark={false}
      currentRecipeName=""
    />,
  );

  expect(await screen.findByText("Explore")).toBeInTheDocument();
  expect(screen.queryByText("Nightly")).not.toBeInTheDocument();
  expect(screen.queryByText("non-LLM cleanup")).not.toBeInTheDocument();
  expect(onPick).not.toHaveBeenCalled();
});

test("the list calls what it holds Agents, not workflows", async () => {
  api.unchain.listRecipes.mockResolvedValue({ recipes: [] });

  render(
    <SubagentPicker
      onPick={() => {}}
      onClose={() => {}}
      isDark={false}
      currentRecipeName=""
    />,
  );

  expect(await screen.findByText("No other Agents available.")).toBeInTheDocument();
  expect(screen.queryByText(/workflow/i)).not.toBeInTheDocument();
});
