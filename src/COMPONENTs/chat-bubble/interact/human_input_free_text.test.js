import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import InteractWrapper from "./interact_wrapper";
import MultiSelectInteract from "./multi_select_interact";
import SingleSelectInteract from "./single_select_interact";
import fixture from "./__fixtures__/human_input_free_text.json";

// Keep the real TextInputInteract, TextField, and Button while avoiding the
// unrelated asynchronous SVG lookup performed by Button's icon.
jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => null,
}));

const configContext = {
  theme: {},
  onThemeMode: "light_mode",
};

const renderInteract = (Component, props = {}) =>
  render(
    <ConfigContext.Provider value={configContext}>
      <Component isDark={false} onSubmit={jest.fn()} {...props} />
    </ConfigContext.Provider>,
  );

const freeTextCases = [
  ["single", SingleSelectInteract, fixture.single],
  ["multiple", MultiSelectInteract, fixture.multiple],
];

describe.each(freeTextCases)(
  "%s selector free-text interaction",
  (_mode, Component, freeTextFixture) => {
    test("renders a direct labelled textbox without an Other choice", () => {
      renderInteract(Component, {
        config: freeTextFixture.pending.presentation.tool_call.interact_config,
      });

      expect(screen.getByText("Project folder")).toBeInTheDocument();
      expect(screen.getByText("What folder path should I use?")).toBeInTheDocument();
      expect(screen.getByText("Folder path")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Enter the folder path")).toBeInTheDocument();
      expect(screen.queryByText("Other")).not.toBeInTheDocument();
      expect(screen.queryByRole("radio")).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    test("blocks blank input and trims the submitted text", () => {
      const onSubmit = jest.fn();
      renderInteract(Component, {
        onSubmit,
        config: freeTextFixture.pending.presentation.tool_call.interact_config,
      });
      const textbox = screen.getByPlaceholderText("Enter the folder path");

      fireEvent.keyDown(textbox, { key: "Enter" });
      expect(onSubmit).not.toHaveBeenCalled();

      fireEvent.change(textbox, { target: { value: "  /Users/example/project  " } });
      fireEvent.keyDown(textbox, { key: "Enter" });

      expect(onSubmit).toHaveBeenCalledWith(
        freeTextFixture.user_response.values
          ? { values: ["__other__"], other_text: "/Users/example/project" }
          : { value: "__other__", other_text: "/Users/example/project" },
      );
    });

    test("submits through the visible button", () => {
      const onSubmit = jest.fn();
      renderInteract(Component, {
        onSubmit,
        config: freeTextFixture.pending.presentation.tool_call.interact_config,
      });
      fireEvent.change(screen.getByPlaceholderText("Enter the folder path"), {
        target: { value: " /Users/example/button " },
      });

      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      expect(onSubmit).toHaveBeenCalledWith({
        ...(freeTextFixture.user_response.values
          ? { values: ["__other__"] }
          : { value: "__other__" }),
        other_text: "/Users/example/button",
      });
    });

    test("shows historical text while disabled", () => {
      renderInteract(Component, {
        disabled: true,
        config: freeTextFixture.pending.presentation.tool_call.interact_config,
        uiState: { userResponse: freeTextFixture.user_response },
      });

      const textbox = screen.getByDisplayValue(freeTextFixture.user_response.other_text);
      expect(textbox).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    });

    test("resets text when the request id changes", () => {
      const { rerender } = renderInteract(Component, {
        config: freeTextFixture.pending.presentation.tool_call.interact_config,
      });
      const textbox = screen.getByPlaceholderText("Enter the folder path");
      fireEvent.change(textbox, { target: { value: "/first/request" } });

      const nextConfig = {
        ...freeTextFixture.pending.presentation.tool_call.interact_config,
        request_id: `${freeTextFixture.pending.presentation.tool_call.interact_config.request_id}-next`,
      };
      rerender(
        <ConfigContext.Provider value={configContext}>
          <Component isDark={false} config={nextConfig} onSubmit={jest.fn()} />
        </ConfigContext.Provider>,
      );

      expect(screen.getByPlaceholderText("Enter the folder path")).toHaveValue("");
    });

    test("preserves unsent text when the parent rerenders the same request", () => {
      const { rerender } = renderInteract(Component, {
        config: freeTextFixture.pending.presentation.tool_call.interact_config,
      });
      const textbox = screen.getByPlaceholderText("Enter the folder path");
      fireEvent.change(textbox, { target: { value: "/unsent/request" } });

      rerender(
        <ConfigContext.Provider value={configContext}>
          <Component
            isDark={false}
            config={freeTextFixture.pending.presentation.tool_call.interact_config}
            onSubmit={jest.fn()}
          />
        </ConfigContext.Provider>,
      );

      expect(screen.getByPlaceholderText("Enter the folder path")).toHaveValue(
        "/unsent/request",
      );
    });
  },
);

test("InteractWrapper reaches the single free-text selector through the registry", () => {
  const onSubmit = jest.fn();
  render(
    <ConfigContext.Provider value={configContext}>
      <InteractWrapper
        type="single"
        isDark={false}
        onSubmit={onSubmit}
        config={fixture.single.pending.presentation.tool_call.interact_config}
      />
    </ConfigContext.Provider>,
  );

  fireEvent.change(screen.getByPlaceholderText("Enter the folder path"), {
    target: { value: `  ${fixture.single.user_response.other_text}  ` },
  });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));

  expect(onSubmit).toHaveBeenCalledWith(fixture.single.user_response);
});

describe.each([
  ["single", SingleSelectInteract, { value: "existing" }, { value: "__other__", other_text: "custom" }],
  ["multiple", MultiSelectInteract, { values: ["existing"] }, { values: ["__other__"], other_text: "custom" }],
])("%s bounded selector behavior", (_mode, Component, existingResponse, otherResponse) => {
  test("keeps options and Other behavior", () => {
    const onSubmit = jest.fn();
    const config = {
      title: "Choose an approach",
      question: "Which approach should I use?",
      options: [{ label: "Existing", value: "existing" }],
      allow_other: true,
      other_label: "Other approach",
      other_placeholder: "Describe it",
      min_selected: 1,
      max_selected: _mode === "multiple" ? 2 : 1,
    };
    const { unmount } = renderInteract(Component, { config, onSubmit });

    expect(screen.queryByPlaceholderText("Describe it")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Existing"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith(existingResponse);

    unmount();
    renderInteract(Component, { config, onSubmit });
    fireEvent.click(screen.getByText("Other approach"));
    fireEvent.change(screen.getByPlaceholderText("Describe it"), {
      target: { value: " custom " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onSubmit).toHaveBeenCalledWith(otherResponse);
  });
});
