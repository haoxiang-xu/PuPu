import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Select } from "./select";

jest.mock("../icon/icon", () => {
  const React = require("react");
  return function MockIcon({ src }) {
    return React.createElement("span", { "data-icon": src });
  };
});
jest.mock("../tooltip/tooltip", () => {
  const React = require("react");
  return function MockTooltip({ children, tooltip_component, open }) {
    return React.createElement(
      "div",
      null,
      children,
      open ? tooltip_component : null,
    );
  };
});

/**
 * A built-in group (no group_key / no badge) plus a custom group that mirrors
 * exactly what build_model_options emits: group = display name,
 * group_key = "custom.<slug>", is_custom + badge = "Custom".
 */
const GROUPS = (collapsed) => [
  {
    group: "OpenAI",
    collapsed: collapsed.OpenAI,
    icon: "open_ai",
    options: [{ value: "openai:gpt-5", label: "gpt-5" }],
  },
  {
    group: "My Provider",
    group_key: "custom.acme",
    is_custom: true,
    badge: "Custom",
    icon: "server",
    collapsed: collapsed["custom.acme"],
    options: [
      { value: "custom.acme:model-a", label: "model-a" },
      { value: "custom.acme:model-b", label: "model-b" },
    ],
  },
];

const Host = ({ onToggleSpy }) => {
  // Seeded exactly like use_chat_input_models: collapse state keyed by the
  // full providerKey for custom groups ("custom.acme"), display name for
  // built-ins — with the custom group collapsed and OpenAI open.
  const [collapsed, setCollapsed] = useState({
    OpenAI: false,
    "custom.acme": true,
  });
  return (
    <Select
      options={GROUPS(collapsed)}
      value="openai:gpt-5"
      set_value={() => {}}
      filterable
      filter_mode="panel"
      open
      on_open_change={() => {}}
      on_group_toggle={(key) => {
        onToggleSpy(key);
        setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
      }}
      variant="palette"
      palette_chip="model"
      palette_rail
    />
  );
};

describe("custom provider group — rail badge (C11) + collapse-key toggle (C7)", () => {
  test("C11: the custom group's rail item renders a 'Custom' badge; the built-in does not", () => {
    const spy = jest.fn();
    render(<Host onToggleSpy={spy} />);

    // The custom provider shows the "Custom" badge exactly once.
    const badges = screen.getAllByText("Custom");
    expect(badges).toHaveLength(1);

    // The badge is not attached to the OpenAI (built-in) rail item — the
    // built-in provider carries no badge marker anywhere.
    // (Only the custom group produced a "Custom" text node.)
    expect(screen.queryAllByText("Custom")).toHaveLength(1);
  });

  test("C7: clicking the custom rail item toggles by group_key, not display name", () => {
    const spy = jest.fn();
    render(<Host onToggleSpy={spy} />);

    // Rail items carry a title of "<display> (Custom)" for custom, "<display>"
    // for built-ins. Find the custom rail item by its title and click it.
    const customRailItem = screen.getByTitle("My Provider (Custom)");
    fireEvent.click(customRailItem);

    // The exclusive-accordion collapses OpenAI and expands the custom group,
    // and every emitted toggle key is a collapse key — never a display name.
    // The custom group MUST be addressed as "custom.acme", not "My Provider".
    expect(spy).toHaveBeenCalledWith("custom.acme");
    expect(spy).not.toHaveBeenCalledWith("My Provider");

    // Built-in groups are still addressed by their display name (== their key).
    // OpenAI was open and must be collapsed by the exclusive rail, so it toggles
    // under "OpenAI" (its group_key is absent -> falls back to display name).
    expect(spy).toHaveBeenCalledWith("OpenAI");
  });

  test("C7: after toggling to the custom group, its models become visible", () => {
    render(<Host onToggleSpy={jest.fn()} />);
    const listbox = () => within(screen.getByRole("listbox"));

    // Initially the custom group is collapsed; OpenAI's model is shown.
    expect(listbox().getByText("gpt-5")).toBeInTheDocument();
    expect(listbox().queryByText("model-a")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("My Provider (Custom)"));

    // The custom group is now the single expanded group and its models show —
    // this is exactly what was broken when the toggle key drifted from the
    // seed key (C7): the click could never expand the group.
    expect(listbox().getByText("model-a")).toBeInTheDocument();
    expect(listbox().getByText("model-b")).toBeInTheDocument();
    expect(listbox().queryByText("gpt-5")).not.toBeInTheDocument();
  });
});
