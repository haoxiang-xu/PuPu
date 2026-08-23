import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatBubble from "./chat_bubble";
import CharacterChatBubble from "./character_chat_bubble";
import { computeCompletionDiagnosticsDigestV1 } from "../../SERVICEs/completion_diagnostics_v1";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

jest.mock("./lazy_trace_chain", () => (props) => (
  <div data-testid="default-memory-trace">
    {props.completionDiagnostics?.memory_v2?.mode ||
      props.bundle?.memory_v2?.mode ||
      "missing"}
  </div>
));

jest.mock("./trace_chain", () => (props) => (
  <div data-testid="character-memory-trace">
    {props.completionDiagnostics?.memory_v2?.mode ||
      props.bundle?.memory_v2?.mode ||
      "missing"}
  </div>
));

const renderBubble = (bubble) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      {bubble}
    </ConfigContext.Provider>,
  );

const message = {
  id: "assistant-memory",
  role: "assistant",
  content: "done",
  status: "done",
  meta: {
    completion_diagnostics: {
      schema: "pupu.completion_diagnostics.v1",
      diagnostics_digest: computeCompletionDiagnosticsDigestV1({
        mode: "active",
        trace_status: "complete",
      }),
      memory_v2: { mode: "active", trace_status: "complete" },
    },
  },
};

describe("chat bubbles mount a Memory V2-only trace", () => {
  test("default chat mounts TraceChain without tool frames or token totals", () => {
    renderBubble(<ChatBubble message={message} traceFrames={[]} />);
    expect(screen.getByTestId("default-memory-trace")).toHaveTextContent(
      "active",
    );
  });

  test("character chat mounts TraceChain without tool frames or token totals", () => {
    renderBubble(
      <CharacterChatBubble
        message={message}
        traceFrames={[]}
        characterName="Lena"
      />,
    );
    expect(screen.getByTestId("character-memory-trace")).toHaveTextContent(
      "active",
    );
  });
});
