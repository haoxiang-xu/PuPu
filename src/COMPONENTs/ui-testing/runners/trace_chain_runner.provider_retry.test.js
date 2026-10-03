import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { StreamingMessageStoreContext } from "../../chat-bubble/components/streaming_message_store_context";
import TraceChain from "../../chat-bubble/trace_chain";
import { createRuntimeEventStore } from "../../../SERVICEs/runtime_events/event_store";
import { reduceActivityTree } from "../../../SERVICEs/runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../../../SERVICEs/runtime_events/trace_chain_adapter";
import TRACE_CHAIN_SCENARIOS from "../scenarios/trace_chain_scenarios";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

/* #386: the provider retry row can be previewed in Settings → Dev → UI testing. */

const RETRY_SCENARIOS = TRACE_CHAIN_SCENARIOS.filter((scenario) =>
  scenario.name.startsWith("Provider Retry"),
);

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

test("the three retry scenarios are registered", () => {
  expect(RETRY_SCENARIOS.map((scenario) => scenario.name)).toEqual([
    "Provider Retry (answered)",
    "Provider Retry (gave up)",
    "Provider Retry (Stop)",
  ]);
});

test.each([
  ["Provider Retry (answered)", "Retried 2×"],
  ["Provider Retry (gave up)", "Retried 3×"],
  ["Provider Retry (Stop)", "Waiting for Gemini"],
])("%s plays through the real activity tree into %s", (name, label) => {
  const scenario = RETRY_SCENARIOS.find((item) => item.name === name);
  const store = createRuntimeEventStore();
  store.appendMany(
    scenario.events.map((event) => ({ ...event, timestamp: new Date().toISOString() })),
  );
  const trace = adaptActivityTreeToTraceChain(
    reduceActivityTree(null, store.getSnapshot()),
  );
  expect(trace.frames.filter((frame) => frame.type === "provider_retry")).toHaveLength(
    scenario.events.filter((event) => event.payload?.kind === "provider_retry").length,
  );

  render(
    withProviders(
      <TraceChain frames={trace.frames} status={trace.status} onStopStream={jest.fn()} />,
    ),
  );
  expect(screen.getByText(label)).toBeInTheDocument();
});
