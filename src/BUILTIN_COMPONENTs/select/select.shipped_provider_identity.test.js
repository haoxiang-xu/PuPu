import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Select } from "./select";
import { build_model_options } from "../../COMPONENTs/chat-input/utils/build_model_options";
import { readShippedPresetEnvelope } from "../../SERVICEs/shipped_provider_registry";

jest.mock("../icon/icon", () => {
  const React = require("react");
  return function MockIcon({ src }) {
    return React.createElement("span", { "data-icon": src });
  };
});
jest.mock("../tooltip/tooltip", () => {
  const React = require("react");
  return function MockTooltip({ children, tooltip_component, open }) {
    return React.createElement("div", null, children, open ? tooltip_component : null);
  };
});

test.each([
  ["deepseek", "deepseek"],
  ["kimi", "kimi"],
  ["kimi-cn", "kimi"],
])("%s has a branded rail entry and preserves model selection", (slug, icon) => {
  const provider = readShippedPresetEnvelope(slug).provider;
  const onSelect = jest.fn();
  const options = build_model_options({
    custom_provider_groups: [{ ...provider, slug }],
  });
  const { rerender } = render(
    <Select
      options={options}
      value={`custom.${slug}:${provider.default_model}`}
      set_value={onSelect}
      open
      on_open_change={() => {}}
      filterable
      filter_mode="panel"
      variant="palette"
      palette_chip="model"
      palette_rail
    />,
  );

  const brandedEntry = screen.getByTitle(provider.display_name);
  expect(brandedEntry.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
  expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  const model = provider.models.find((item) => item.id !== provider.default_model);
  fireEvent.click(within(screen.getByRole("listbox")).getByText(model.display_name));
  expect(onSelect).toHaveBeenCalledWith(`custom.${slug}:${model.id}`, {
    value: `custom.${slug}:${model.id}`,
    label: model.display_name,
    trigger_label: model.display_name,
  });

  // A matching display name must not grant a user-authored provider identity.
  rerender(
    <Select
      options={build_model_options({
        custom_provider_groups: [{
          slug: "user-proxy",
          display_name: provider.display_name,
          models: [{ id: "proxy-model", display_name: "Proxy model" }],
        }],
      })}
      value="custom.user-proxy:proxy-model"
      set_value={onSelect}
      open
      on_open_change={() => {}}
      filterable
      filter_mode="panel"
      variant="palette"
      palette_chip="model"
      palette_rail
    />,
  );
  const customEntry = screen.getByTitle(`${provider.display_name} (Custom)`);
  expect(within(customEntry).getByText("Custom")).toBeInTheDocument();
  expect(customEntry.querySelector('[data-icon="server"]')).not.toBeNull();
});
