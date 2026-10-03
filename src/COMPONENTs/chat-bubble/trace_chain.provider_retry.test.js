import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { StreamingMessageStoreContext } from "./components/streaming_message_store_context";
import TraceChain from "./trace_chain";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

/* #386 AC-386-11: provider retry waits render as design A2. */

const NOW = Date.parse("2026-09-30T12:00:00.000Z");

const retryFrame = ({
  seq,
  failed = 1,
  max = 11,
  delay = 4000,
  status = 503,
  providerStatus = "UNAVAILABLE",
  ts = NOW,
  runId = "graph-step-1",
  iteration = 0,
}) => ({
  seq,
  ts,
  type: "provider_retry",
  run_id: runId,
  iteration,
  payload: {
    provider: "gemini",
    attempt_failed: failed,
    next_attempt: failed + 1,
    max_attempts: max,
    delay_ms: delay,
    remaining_ms: delay,
    http_status: status,
    provider_status: providerStatus,
  },
});

const renderTrace = ({ frames, status = "streaming", onStopStream }) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{ chatId: "chat", store: null, notifyStreamingContentCommitted: jest.fn() }}
      >
        <TraceChain
          frames={frames}
          status={status}
          messageId="assistant"
          onStopStream={onStopStream}
        />
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TraceChain provider retry (design A2)", () => {
  test("bounded records separate grouped waits without consuming either display format", () => {
    renderTrace({
      status: "done",
      frames: [
        retryFrame({ seq: 1 }),
        {
          ...retryFrame({ seq: 2 }),
          payload: {
            provider: "gemini", http_status: 503,
            retry_ordinal: 1, max_retries: 2, delay_ms: 500,
          },
        },
        retryFrame({ seq: 3, failed: 2 }),
      ],
    });
    expect(screen.getByText("Retried 1×")).toBeInTheDocument();
    expect(screen.getByText("Retried 2×")).toBeInTheDocument();
    expect(screen.getByText("Gemini temporarily busy — retrying 1/2")).toBeInTheDocument();
    expect(screen.queryByText("Retrying…")).not.toBeInTheDocument();
  });

  test("rejected records separate valid grouped waits", () => {
    renderTrace({
      status: "done",
      frames: [
        retryFrame({ seq: 1 }),
        { ...retryFrame({ seq: 2 }), payload: {} },
        retryFrame({ seq: 3, failed: 2 }),
      ],
    });
    expect(screen.getByText("Retried 1×")).toBeInTheDocument();
    expect(screen.getByText("Retried 2×")).toBeInTheDocument();
    expect(screen.getAllByText("Gemini · Overloaded (HTTP 503)")).toHaveLength(2);
  });

  test.each([
    {},
    { attempt_failed: "1", next_attempt: 2, max_attempts: 11, delay_ms: 4000,
      remaining_ms: 4000, http_status: 503, provider_status: "UNAVAILABLE", provider: "gemini" },
    { attempt_failed: 1, next_attempt: 2, max_attempts: 11, delay_ms: 4000,
      remaining_ms: 4000, http_status: 503, provider_status: "UNAVAILABLE", provider: "gemini",
      retry_ordinal: null },
    { attempt_failed: 1, next_attempt: 2, max_attempts: 11, delay_ms: 4000,
      remaining_ms: 4000, http_status: 503, provider_status: "UNAVAILABLE", provider: "gemini",
      retry_ordinal: 1, max_retries: 2, response_body: "private provider body" },
  ])("rejected retry records cannot create an invisible waiting header: %p", (payload) => {
    renderTrace({ frames: [{ ...retryFrame({ seq: 1 }), payload }] });
    expect(screen.queryByText("Retrying…")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for Gemini")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/private provider body/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Thinking…").length).toBeGreaterThan(0);
  });

  test("a wait shows the reason, a countdown, the try budget and Stop", () => {
    const onStopStream = jest.fn();
    renderTrace({ frames: [retryFrame({ seq: 1 })], onStopStream });

    expect(screen.getByText("Waiting for Gemini")).toBeInTheDocument();
    expect(screen.getByText("Retrying…")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
    expect(screen.getByText(/Overloaded \(HTTP 503\) ·/)).toBeInTheDocument();
    expect(screen.getByText("next try in 4s")).toBeInTheDocument();
    // The failed tries are one code block, in the code block's own colors.
    const attempts = screen.getByTestId("provider-retry-attempts");
    expect(attempts.querySelector("code")).not.toBeNull();
    expect(attempts.textContent).toBe("#1  Overloaded (HTTP 503)");

    const bar = screen.getByRole("progressbar", { name: "Tries used out of 11" });
    expect(bar).toHaveAttribute("aria-valuemax", "11");
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar.children).toHaveLength(11);
    expect(screen.getByText("1 failed")).toBeInTheDocument();
    expect(screen.getByText("try 2")).toBeInTheDocument();
    expect(screen.getByText("9 left")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStopStream).toHaveBeenCalledTimes(1);
  });

  test("the countdown runs down and then says the next try is on its way", () => {
    renderTrace({ frames: [retryFrame({ seq: 1, delay: 2000 })], onStopStream: jest.fn() });
    expect(screen.getByText("next try in 2s")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText("next try in 1s")).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    expect(screen.getByText("trying again (try 2 of 11)")).toBeInTheDocument();
  });

  test("waits of one model turn share a row and list every failed try", () => {
    renderTrace({
      frames: [
        retryFrame({ seq: 1, ts: NOW - 5000 }),
        retryFrame({ seq: 2, failed: 2, status: 429, providerStatus: "RESOURCE_EXHAUSTED" }),
      ],
      onStopStream: jest.fn(),
    });
    expect(screen.getAllByText("Waiting for Gemini")).toHaveLength(1);
    expect(screen.getByText("2 failed")).toBeInTheDocument();
    expect(screen.getByText("try 3")).toBeInTheDocument();
    expect(screen.getByText("8 left")).toBeInTheDocument();
    expect(screen.getByTestId("provider-retry-attempts").textContent).toBe(
      "#1  Overloaded (HTTP 503)\n#2  Rate or quota limit (HTTP 429)",
    );
  });

  test("without a stop handler the wait has no Stop button", () => {
    renderTrace({ frames: [retryFrame({ seq: 1 })] });
    expect(screen.getByText("Waiting for Gemini")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  test("a later frame from the same run settles the row while the turn streams on", () => {
    renderTrace({
      frames: [
        retryFrame({ seq: 1 }),
        {
          seq: 2,
          ts: NOW + 4500,
          type: "reasoning",
          run_id: "graph-step-1",
          iteration: 0,
          payload: { reasoning: "thinking now" },
        },
      ],
      onStopStream: jest.fn(),
    });
    expect(screen.getByText("Retried 1×")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for Gemini")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  test("an answered turn keeps a Retried record", () => {
    renderTrace({
      frames: [retryFrame({ seq: 1 }), retryFrame({ seq: 2, failed: 2 })],
      status: "done",
    });
    expect(screen.getByText("Retried 2×")).toBeInTheDocument();
    expect(screen.getByText("Gemini · Overloaded (HTTP 503)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  test("a stopped turn says it was stopped while retrying", () => {
    renderTrace({ frames: [retryFrame({ seq: 1 })], status: "cancelled", onStopStream: jest.fn() });
    expect(screen.getByText("Stopped while retrying")).toBeInTheDocument();
    expect(screen.getByTestId("provider-retry-attempts").textContent).toBe(
      "#1  Overloaded (HTTP 503)\n#2  stopped by you",
    );
    expect(screen.queryByText("Waiting for Gemini")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
  });

  test("a turn that gave up after the whole budget shows how many retries ran", () => {
    renderTrace({
      frames: [
        retryFrame({ seq: 1, failed: 10, status: 429, providerStatus: "RESOURCE_EXHAUSTED" }),
        {
          seq: 2,
          ts: NOW + 40000,
          type: "error",
          run_id: "graph-step-1",
          payload: { message: "Provider rate or quota limit reached (HTTP 429) after 10 retries" },
        },
      ],
      status: "error",
    });
    expect(screen.getByText("Retried 10×")).toBeInTheDocument();
    expect(screen.getByText("Gemini · Rate or quota limit (HTTP 429)")).toBeInTheDocument();
  });

  test("a retry without HTTP evidence uses the generic reason", () => {
    renderTrace({
      frames: [retryFrame({ seq: 1, status: null, providerStatus: "" })],
      status: "done",
    });
    expect(screen.getByText("Gemini · Temporary failure")).toBeInTheDocument();
  });

  test("the record subtitle is a plain string in the timeline's default body style", () => {
    renderTrace({ frames: [retryFrame({ seq: 1 })], status: "done" });
    const subtitle = screen.getByText("Gemini · Overloaded (HTTP 503)");
    // Timeline wraps a string body in its own styled block; an element body
    // would carry no color of its own and inherit the title color instead.
    expect(subtitle.tagName).toBe("DIV");
    expect(subtitle.style.color).not.toBe("");
  });

  test("Stop is the builtin button", () => {
    const onStopStream = jest.fn();
    renderTrace({ frames: [retryFrame({ seq: 1 })], onStopStream });
    const stop = screen.getByRole("button", { name: "Stop" });
    expect(stop.style.cursor).not.toBe("");
    fireEvent.click(stop);
    expect(onStopStream).toHaveBeenCalledTimes(1);
  });
});
