import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { StreamingMessageStoreContext } from "../../chat-bubble/components/streaming_message_store_context";
import TraceChainRunner from "./trace_chain_runner";
import { TestDockContext } from "../test_dock_context";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

// Only the Stop scenario, so the runner starts on it.
jest.mock("../scenarios/trace_chain_scenarios", () => {
  const actual = jest.requireActual("../scenarios/trace_chain_scenarios").default;
  return {
    __esModule: true,
    default: actual.filter((scenario) => scenario.name === "Provider Retry (Stop)"),
  };
});

/* #386: Settings → Dev → UI testing → trace chain runner, retry Stop scenario. */

const withProviders = (ui) => (
  <ConfigContext.Provider
    value={{
      theme: { color: "#222", font: { fontFamily: "sans-serif" } },
      onThemeMode: "dark_mode",
    }}
  >
    <StreamingMessageStoreContext.Provider
      value={{ chatId: "chat", store: null, notifyStreamingContentCommitted: jest.fn() }}
    >
      {ui}
    </StreamingMessageStoreContext.Provider>
  </ConfigContext.Provider>
);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse("2026-09-30T12:00:00.000Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

test("the runner plays the Stop scenario and its Stop ends the turn", () => {
  // The controls (Play, Reset) are portaled into the modal's dock.
  const dockEl = document.createElement("div");
  document.body.appendChild(dockEl);
  render(
    withProviders(
      <TestDockContext.Provider value={{ dockEl, registerControls: jest.fn() }}>
        <TraceChainRunner />
      </TestDockContext.Provider>,
    ),
  );

  fireEvent.click(screen.getByRole("button", { name: "Play" }));
  // run.started after the normal gap, the 1.5 s wait, then the long wait.
  act(() => {
    jest.advanceTimersByTime(700);
  });
  act(() => {
    jest.advanceTimersByTime(700);
  });
  act(() => {
    jest.advanceTimersByTime(1700);
  });

  expect(screen.getByText("Waiting for Gemini")).toBeInTheDocument();
  // Live timestamps: the long wait counts down from its full length.
  expect(screen.getByText("next try in 30s")).toBeInTheDocument();
  expect(screen.getByText("2 failed")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Stop" }));

  expect(screen.getByText("Stopped while retrying")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
});
