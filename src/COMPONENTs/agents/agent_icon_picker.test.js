import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AgentIconPicker, { AGENT_PRESET_COLORS } from "./agent_icon_picker";
import AgentIconButton from "./agent_icon_button";
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

  test("marks the current icon and colour, the default when nothing is stored", () => {
    show();
    expect(screen.getByTestId("agent-icon-picker-icon-bot")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("agent-icon-picker-icon-robot_face")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("agent-icon-picker-color-4a5bd8")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Reset to default" })).toBeDisabled();
  });

  test("choosing is a preview; Save commits the whole selection once and closes", () => {
    const { onChange, onClose } = show({ icon: "kimi", color: "#2e8f5a" });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByTestId("agent-icon-picker-icon-robot_dome"));
    fireEvent.click(screen.getByTestId("agent-icon-picker-color-d23f37"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("agent-icon-picker-icon-robot_dome")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("agent-icon-picker-color-d23f37")).toHaveAttribute("aria-pressed", "true");
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ icon: "robot_dome", color: "#d23f37" });
    expect(onClose).toHaveBeenCalledTimes(1);
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

  test("a stored colour outside the palette reads as the default", () => {
    show({ icon: "kimi", color: "#123456" });
    expect(screen.getByTestId("agent-icon-picker-color-4a5bd8")).toHaveAttribute("aria-pressed", "true");
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

  test("offers the palette swatches and no custom colour control", () => {
    show();
    expect(AGENT_PRESET_COLORS.length).toBe(11);
    AGENT_PRESET_COLORS.forEach((color) =>
      expect(screen.getByTestId(`agent-icon-picker-color-${color.slice(1)}`)).toBeInTheDocument());
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
    expect(screen.getByTestId("agent-icon-picker-color-d23f37")).toBeDisabled();
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

describe("the avatar button on a runtime that does not store icons", () => {
  test.each(["unsupported", "unknown", "checking"])("%s: a plain avatar, no button and no picker", (verdict) => {
    mockCapability = verdict;
    render(<AgentIconButton presentation={{ icon: "gemini" }} onChange={() => {}} isDark={false} testid="btn" />);
    expect(screen.getByTestId("btn").tagName).toBe("SPAN");
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByTestId("btn"));
    expect(screen.queryByTestId("btn-picker")).toBeNull();
  });
});

describe("the avatar button", () => {
  function Harness() {
    const [value, setValue] = useState(null);
    return <AgentIconButton presentation={value} onChange={setValue} isDark={false} testid="btn" />;
  }

  test("previews on the avatar, and a dismissed picker restores it", () => {
    render(<Harness />);
    expect(screen.queryByTestId("btn-picker")).toBeNull();
    fireEvent.click(screen.getByTestId("btn"));
    fireEvent.click(screen.getByTestId("btn-picker-icon-robot_bust"));
    fireEvent.click(screen.getByTestId("btn-picker-color-b94a74"));
    const avatar = screen.getByTestId("btn-avatar");
    expect(avatar.getAttribute("data-agent-icon")).toBe("robot_bust");
    expect(avatar.getAttribute("data-agent-color")).toBe("#b94a74");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("btn-picker")).toBeNull();
    expect(screen.getByTestId("btn-avatar").getAttribute("data-agent-icon")).toBe("bot");
  });

  test("Save keeps the choice", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("btn"));
    fireEvent.click(screen.getByTestId("btn-picker-icon-robot_bust"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByTestId("btn-picker")).toBeNull();
    expect(screen.getByTestId("btn-avatar").getAttribute("data-agent-icon")).toBe("robot_bust");
  });

  test("without onChange it is just the avatar", () => {
    render(<AgentIconButton presentation={{ icon: "gemini" }} testid="plain" />);
    expect(screen.getByTestId("plain").tagName).toBe("SPAN");
  });
});
