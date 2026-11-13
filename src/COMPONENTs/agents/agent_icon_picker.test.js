import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AgentIconPicker from "./agent_icon_picker";
import { Z } from "../../BUILTIN_COMPONENTs/layer/z_layers";

let mockCapability = "supported";
jest.mock("./use_presentation_capability", () => ({
  ...jest.requireActual("./use_presentation_capability"),
  usePresentationCapability: () => mockCapability,
}));
beforeEach(() => { mockCapability = "supported"; });

const show = (value = null) => {
  const onChange = jest.fn();
  const onClose = jest.fn();
  render(<AgentIconPicker open anchor={{ x: 20, y: 30 }} value={value} onChange={onChange} onClose={onClose} isDark={false} />);
  return { onChange, onClose, picker: screen.getByTestId("agent-icon-picker") };
};

describe("the Agent icon picker", () => {
  test("is a body portal on the popover layer with the three groups", () => {
    const { picker } = show();
    // eslint-disable-next-line testing-library/no-node-access
    expect(picker.parentElement).toBe(document.body);
    expect(Number(picker.style.zIndex)).toBe(Z.POPOVER);
    ["robots", "providers", "everyday"].forEach((group) =>
      expect(screen.getByTestId(`agent-icon-picker-group-${group}`)).toBeInTheDocument());
    expect(screen.getByText("Robots")).toBeInTheDocument();
    expect(screen.getByText("Providers")).toBeInTheDocument();
    expect(screen.getByText("Everyday")).toBeInTheDocument();
  });

  test("marks the current icon, the default when nothing is stored", () => {
    show();
    expect(screen.getByTestId("agent-icon-picker-icon-bot")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("agent-icon-picker-icon-robot_face")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
  });

  test("choosing is a preview; Save commits { icon } alone, dropping a stored colour, and closes", () => {
    const { onChange, onClose } = show({ icon: "kimi", color: "#2e8f5a" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(screen.getByTestId("agent-icon-picker-icon-kimi")).toHaveAttribute("aria-pressed", "true");
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByTestId("agent-icon-picker-icon-robot_dome"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("agent-icon-picker-icon-robot_dome")).toHaveAttribute("aria-pressed", "true");
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toStrictEqual({ icon: "robot_dome" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("choosing the default icon is the same as Reset: Save removes the stored value", () => {
    const { onChange } = show({ icon: "kimi" });
    fireEvent.click(screen.getByTestId("agent-icon-picker-icon-bot"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("going back to the current value disables Save again", () => {
    show({ icon: "kimi" });
    fireEvent.click(screen.getByTestId("agent-icon-picker-icon-bot"));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    fireEvent.click(screen.getByTestId("agent-icon-picker-icon-kimi"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("Reset to default only changes the selection; Save then removes the stored value", () => {
    const { onChange } = show({ icon: "kimi" });
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("agent-icon-picker-icon-bot")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("Enter inside the picker is Save", () => {
    const { onChange, onClose } = show();
    const icon = screen.getByTestId("agent-icon-picker-icon-robot_face");
    fireEvent.click(icon);
    fireEvent.keyDown(icon, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith({ icon: "robot_face" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("closing without Save commits nothing", () => {
    const { onChange, onClose } = show();
    fireEvent.click(screen.getByTestId("agent-icon-picker-icon-robot_face"));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("a legacy document with an icon and a colour opens on its icon, in the default colours", () => {
    show({ icon: "kimi", color: "#123456" });
    const kimi = screen.getByTestId("agent-icon-picker-icon-kimi");
    expect(kimi).toHaveAttribute("aria-pressed", "true");
    expect(kimi.style.background).toBe("rgb(74, 91, 216)");
  });

  test("Escape and a press outside close it; a press inside does not", () => {
    const { onClose } = show();
    fireEvent.mouseDown(screen.getByTestId("agent-icon-picker-icon-bot"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  test("offers icons only: no colour controls of any kind", () => {
    const { picker } = show();
    // eslint-disable-next-line testing-library/no-node-access
    expect(picker.querySelectorAll('[data-testid^="agent-icon-picker-color-"]')).toHaveLength(0);
    expect(screen.queryByRole("group", { name: /colou?r/i })).toBeNull();
    expect(screen.queryByText(/colou?r/i)).toBeNull();
    /* Only the icon buttons, Reset and Save. */
    expect(screen.getAllByRole("button").filter((b) => !b.dataset.testid?.startsWith("agent-icon-picker-icon-"))
      .map((b) => b.getAttribute("aria-label"))).toEqual(["Reset to default", "Save"]);
    expect(screen.queryByTestId("agent-icon-picker-custom-color")).toBeNull();
    expect(screen.queryByRole("button", { name: /custom colou?r|open color picker/i })).toBeNull();
    expect(screen.queryByTestId("color-picker-trigger-anchor")).toBeNull();
  });
});

describe("a runtime that cannot store a presentation", () => {
  test.each(["unsupported", "unknown"])("%s: if open at all, shows no message and every choice is disabled and inert", (verdict) => {
    mockCapability = verdict;
    const { onChange } = show({ icon: "kimi" });
    expect(screen.queryByRole("status")).toBeNull();
    const icon = screen.getByTestId("agent-icon-picker-icon-robot_face");
    expect(icon).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(icon);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("while it is being asked the choices wait, without a message", () => {
    mockCapability = "checking";
    show();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("agent-icon-picker-icon-bot")).toBeDisabled();
  });
});
