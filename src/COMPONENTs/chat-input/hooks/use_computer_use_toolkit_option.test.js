import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import api from "../../../SERVICEs/api";
import useComputerUseToolkitOption from "./use_computer_use_toolkit_option";
import { ConfigContext } from "../../../CONTAINERs/config/context";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    runtime: {
      isComputerUseStatusAvailable: jest.fn(() => true),
      getComputerUseStatus: jest.fn(),
    },
  },
}));

const Harness = ({ selectedModelId }) => {
  const { computerOption } = useComputerUseToolkitOption({ selectedModelId });
  return (
    <ConfigContext.Provider value={{ isDark: false, theme: {} }}>
      <pre data-testid="option">
        {computerOption
          ? JSON.stringify({
              value: computerOption.value,
              disabled: computerOption.disabled,
              label: computerOption.label,
              description: computerOption.description,
            })
          : "null"}
      </pre>
    </ConfigContext.Provider>
  );
};

const readOption = () => {
  const text = screen.getByTestId("option").textContent || "null";
  return text === "null" ? null : JSON.parse(text);
};

describe("useComputerUseToolkitOption", () => {
  beforeEach(() => {
    api.runtime.isComputerUseStatusAvailable.mockReset();
    api.runtime.isComputerUseStatusAvailable.mockReturnValue(true);
    api.runtime.getComputerUseStatus.mockReset();
  });

  test("no option when the master switch is disabled", async () => {
    api.runtime.getComputerUseStatus.mockResolvedValue({
      enabled: false,
      supportedModelPrefixes: ["claude-opus"],
    });

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() =>
      expect(api.runtime.getComputerUseStatus).toHaveBeenCalled(),
    );
    await waitFor(() => expect(readOption()).toBeNull());
  });

  test("enabled + supported model yields an active option", async () => {
    api.runtime.getComputerUseStatus.mockResolvedValue({
      enabled: true,
      supportedModelPrefixes: ["claude-opus", "claude-sonnet"],
    });

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() => expect(readOption()).not.toBeNull());
    const option = readOption();
    expect(option.value).toBe("builtin.computer");
    expect(option.disabled).toBe(false);
  });

  test("enabled + unsupported model yields a disabled option with hint", async () => {
    api.runtime.getComputerUseStatus.mockResolvedValue({
      enabled: true,
      supportedModelPrefixes: ["claude-opus"],
    });

    render(<Harness selectedModelId="openai:gpt-5" />);

    await waitFor(() => expect(readOption()).not.toBeNull());
    const option = readOption();
    expect(option.value).toBe("builtin.computer");
    expect(option.disabled).toBe(true);
    expect(option.description).toBe("Requires a supported Anthropic model");
  });

  test("missing prefix field (older sidecar) is treated as unsupported", async () => {
    api.runtime.getComputerUseStatus.mockResolvedValue({ enabled: true });

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() => expect(readOption()).not.toBeNull());
    expect(readOption().disabled).toBe(true);
  });

  test("no option when the status bridge is unavailable", async () => {
    api.runtime.isComputerUseStatusAvailable.mockReturnValue(false);

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() => expect(readOption()).toBeNull());
    expect(api.runtime.getComputerUseStatus).not.toHaveBeenCalled();
  });

  test("no option when the status read throws", async () => {
    api.runtime.getComputerUseStatus.mockRejectedValue(new Error("boom"));

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() =>
      expect(api.runtime.getComputerUseStatus).toHaveBeenCalled(),
    );
    await waitFor(() => expect(readOption()).toBeNull());
  });
});
