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

const createDeferred = () => {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const Harness = ({ selectedModelId }) => {
  const { computerOption, shouldDeselectComputer } = useComputerUseToolkitOption({
    selectedModelId,
  });
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
      <pre data-testid="deselect">
        {shouldDeselectComputer ? "true" : "false"}
      </pre>
    </ConfigContext.Provider>
  );
};

const readOption = () => {
  const text = screen.getByTestId("option").textContent || "null";
  return text === "null" ? null : JSON.parse(text);
};

const readDeselect = () =>
  (screen.getByTestId("deselect").textContent || "").trim() === "true";

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

  test("does not signal deselect while the status read is still in flight", async () => {
    const deferred = createDeferred();
    api.runtime.getComputerUseStatus.mockReturnValue(deferred.promise);

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    // Unresolved status must NOT strip a selection (would wrongly deselect a
    // supported+enabled session on every mount).
    await waitFor(() =>
      expect(api.runtime.getComputerUseStatus).toHaveBeenCalled(),
    );
    expect(readDeselect()).toBe(false);

    deferred.resolve({ enabled: true, supportedModelPrefixes: ["claude-opus"] });
    await waitFor(() => expect(readDeselect()).toBe(false));
  });

  test("signals deselect when the master switch is off", async () => {
    api.runtime.getComputerUseStatus.mockResolvedValue({
      enabled: false,
      supportedModelPrefixes: ["claude-opus"],
    });

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() => expect(readDeselect()).toBe(true));
  });

  test("signals deselect when the current model is unsupported", async () => {
    api.runtime.getComputerUseStatus.mockResolvedValue({
      enabled: true,
      supportedModelPrefixes: ["claude-opus"],
    });

    render(<Harness selectedModelId="openai:gpt-5" />);

    await waitFor(() => expect(readDeselect()).toBe(true));
  });

  test("signals deselect when the status bridge is unavailable", async () => {
    api.runtime.isComputerUseStatusAvailable.mockReturnValue(false);

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() => expect(readDeselect()).toBe(true));
  });

  test("does not signal deselect when enabled and the model is supported", async () => {
    api.runtime.getComputerUseStatus.mockResolvedValue({
      enabled: true,
      supportedModelPrefixes: ["claude-opus"],
    });

    render(<Harness selectedModelId="anthropic:claude-opus-4-8" />);

    await waitFor(() => expect(readOption()).not.toBeNull());
    expect(readDeselect()).toBe(false);
  });
});
