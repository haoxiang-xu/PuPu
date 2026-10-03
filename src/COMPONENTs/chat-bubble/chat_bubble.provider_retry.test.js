import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatBubble from "./chat_bubble";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

/* #386 AC-386-11: a turn that is only waiting to retry still shows its trace,
   and the trace's Stop is the composer's stop. */

const retryFrame = {
  seq: 1,
  ts: Date.now(),
  type: "provider_retry",
  run_id: "run-1",
  iteration: 0,
  payload: {
    provider: "gemini",
    attempt_failed: 1,
    next_attempt: 2,
    max_attempts: 11,
    delay_ms: 30000,
    remaining_ms: 30000,
    http_status: 503,
    provider_status: "UNAVAILABLE",
  },
};

test("a streaming turn with only a retry wait shows it with a working Stop", () => {
  const onStopStream = jest.fn();
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <ChatBubble
        message={{ id: "assistant-1", role: "assistant", status: "streaming", content: "" }}
        traceFrames={[retryFrame]}
        onStopStream={onStopStream}
      />
    </ConfigContext.Provider>,
  );
  expect(screen.getByText("Waiting for Gemini")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  expect(onStopStream).toHaveBeenCalledTimes(1);
});
