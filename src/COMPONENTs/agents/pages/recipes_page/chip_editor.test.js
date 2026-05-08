import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import ChipEditor from "./chip_editor";

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => {
  const React = require("react");
  return (props) =>
    React.createElement("span", {
      "data-testid": `icon-${props.src || "unknown"}`,
    });
});

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const scope = [
  { node_id: "start", field: "text", type: "string", source_type: "start" },
];

describe("ChipEditor", () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      disconnect() {}
    };
  });

  test("renders chips from value string", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="Hi {{#start.text#}}!"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const chip = container.querySelector('[data-var-chip="start.text"]');
    expect(chip).toBeTruthy();
  });

  test("renders built-in system prompt as an applied chip", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="{{USE_BUILTIN_DEVELOPER_PROMPT}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const chip = container.querySelector(
      '[data-system-prompt-chip="USE_BUILTIN_DEVELOPER_PROMPT"]',
    );
    expect(chip).toBeTruthy();
    expect(chip).toHaveTextContent("Built-in developer prompt");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("clicking a tag switches to raw text editing", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="{{USE_BUILTIN_DEVELOPER_PROMPT}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    fireEvent.click(
      container.querySelector(
        '[data-system-prompt-chip="USE_BUILTIN_DEVELOPER_PROMPT"]',
      ),
    );
    expect(
      screen.getByDisplayValue("{{USE_BUILTIN_DEVELOPER_PROMPT}}"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Type raw prompt...")).not.toBeInTheDocument();
  });

  test("renders subagent list prompt tag without warning", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="{{SUBAGENT_LIST}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const chip = container.querySelector(
      '[data-system-prompt-chip="SUBAGENT_LIST"]',
    );
    expect(chip).toBeTruthy();
    expect(chip).toHaveTextContent("Subagent list");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("warns for unknown system prompt token", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="{{NO_SUCH_PROMPT}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const chip = container.querySelector(
      '[data-system-prompt-chip="NO_SUCH_PROMPT"]',
    );
    expect(chip).toBeTruthy();
    expect(chip).toHaveAttribute("data-chip-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unknown system prompt {{NO_SUCH_PROMPT}}",
    );
  });

  test("warns for unknown variable token", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="{{#missing.output#}}"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const chip = container.querySelector('[data-var-chip="missing.output"]');
    expect(chip).toBeTruthy();
    expect(chip).toHaveAttribute("data-chip-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unknown variable {{#missing.output#}}",
    );
  });

  test("Variable select opens Mini UI picker", () => {
    render(wrap(<ChipEditor value="" onChange={() => {}} scope={scope} />));
    fireEvent.click(screen.getByText("+ Variable"));
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  test("picking a variable fires onChange with serialized chip string", () => {
    const onChange = jest.fn();
    render(wrap(<ChipEditor value="" onChange={onChange} scope={scope} />));
    fireEvent.click(screen.getByText("+ Variable"));
    fireEvent.click(screen.getByText("start.text"));
    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("{{#start.text#}}"),
    );
  });
});
