import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ChatBubble from "./chat_bubble";
import CharacterChatBubble from "./character_chat_bubble";

const {
  buildRunBundleV1,
} = require("../../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

const CONTEXT_COMPOSITION_EXTENSION_KEY =
  "unchain.context/context_composition_v1";

const attachContextComposition = (bundle) => {
  bundle.provider_calls[0].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] = {
    schema: CONTEXT_COMPOSITION_EXTENSION_KEY,
    method: "utf8_heuristic_v1",
    quality: "reconciled_estimate",
    context_window_tokens: 128000,
    wire: {
      envelope_sha256: `sha256:${"a".repeat(64)}`,
      route_name: "primary",
      route_sha256: `sha256:${"b".repeat(64)}`,
      context_mode: "semantic",
    },
    categories: [
      {
        id: "instructions",
        tokens: 500,
        source_count: 1,
        subtypes: [
          { id: "core_system", tokens: 500, source_count: 1 },
        ],
      },
    ],
    attributed_tokens: 500,
    residual_tokens: 500,
    coverage: {
      status: "complete",
      manifest_items: 1,
      matched_items: 1,
      wire_surfaces: 1,
      matched_surfaces: 1,
    },
  };
  return bundle;
};

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderWithConfig = (ui) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      {ui}
    </ConfigContext.Provider>,
  );

const messageWithTokenSummary = {
  id: "assistant-token-summary",
  role: "assistant",
  content: "Final answer",
  status: "done",
  meta: {
    bundle: {
      input_tokens: 4,
      output_tokens: 6,
      consumed_tokens: 10,
    },
  },
};

describe("assistant token summary", () => {
  test("ChatBubble renders token totals even without tool trace activity", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    try {
      renderWithConfig(
        <ChatBubble message={messageWithTokenSummary} traceFrames={[]} />,
      );

      expect(
        await screen.findByText(/4 in\s+·\s+6 out\s+·\s+10 total/),
      ).toBeInTheDocument();
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });

  test("CharacterChatBubble renders token totals even without tool trace activity", () => {
    renderWithConfig(
      <CharacterChatBubble
        message={messageWithTokenSummary}
        traceFrames={[]}
        characterName="Lena"
      />,
    );

    expect(
      screen.getByText(/4 in\s+·\s+6 out\s+·\s+10 total/),
    ).toBeInTheDocument();
  });

  test("does not add OpenAI cached input to input_tokens a second time", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    try {
      renderWithConfig(
        <ChatBubble
          message={{
            ...messageWithTokenSummary,
            id: "assistant-openai-cached-input",
            meta: {
              bundle: {
                input_tokens: 1000,
                output_tokens: 200,
                consumed_tokens: 1200,
                cache_read_input_tokens: 600,
              },
            },
          }}
          traceFrames={[]}
        />,
      );

      const summary = await screen.findByTestId("token-summary");
      expect(summary).toHaveTextContent("1,000 in (600 cached)");
      expect(summary).not.toHaveTextContent("1,600 in");
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });

  test("renders canonical RunBundle all_usage with cache and reasoning subsets", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    try {
      renderWithConfig(
        <ChatBubble
          message={{
            ...messageWithTokenSummary,
            id: "assistant-canonical-token-summary",
            meta: { bundle: buildRunBundleV1() },
          }}
          traceFrames={[]}
        />,
      );

      const summary = await screen.findByTestId("token-summary");
      expect(summary).toHaveTextContent("1,000 in (600 cached)");
      expect(summary).toHaveTextContent("200 out (50 reasoning)");
      expect(summary).toHaveTextContent("1,200 total");
      expect(summary).not.toHaveTextContent("1,600 in");
      expect(summary).not.toHaveAttribute("aria-haspopup");
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });

  test("opens Context Composition only when a receipt carries composition evidence", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    try {
      renderWithConfig(
        <ChatBubble
          message={{
            ...messageWithTokenSummary,
            id: "assistant-context-composition",
            meta: { bundle: attachContextComposition(buildRunBundleV1()) },
          }}
          traceFrames={[]}
        />,
      );

      const summary = await screen.findByRole("button", {
        name: "Open context composition",
      });
      expect(summary).toHaveTextContent("1,000 in");
      fireEvent.click(summary);
      expect(
        await screen.findByRole("dialog", { name: "Context Composition" }),
      ).toBeInTheDocument();
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });

  test("CharacterChatBubble mounts the canonical token summary without legacy totals", () => {
    renderWithConfig(
      <CharacterChatBubble
        message={{
          ...messageWithTokenSummary,
          id: "character-canonical-token-summary",
          meta: { bundle: buildRunBundleV1() },
        }}
        traceFrames={[]}
        characterName="Lena"
      />,
    );

    expect(screen.getByTestId("token-summary")).toHaveTextContent(
      "1,000 in (600 cached) · 200 out (50 reasoning) · 1,200 total",
    );
  });

  test("renders canonical cache-write tokens without adding them to input again", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();
    const bundle = buildRunBundleV1();
    const completeUsage = {
      ...bundle.aggregation.all_usage,
      input: {
        ...bundle.aggregation.all_usage.input,
        uncached_tokens: 300,
        cache_write_tokens: 100,
        cache_write_5m_tokens: 60,
        cache_write_1h_tokens: 40,
      },
      source: "provider_observed",
    };
    bundle.provider_calls[0].usage = completeUsage;
    bundle.aggregation.direct_usage = completeUsage;
    bundle.aggregation.all_usage = completeUsage;
    bundle.usage_slices[0].usage = completeUsage;

    try {
      renderWithConfig(
        <ChatBubble
          message={{
            ...messageWithTokenSummary,
            id: "assistant-canonical-cache-write",
            meta: { bundle },
          }}
          traceFrames={[]}
        />,
      );

      const summary = await screen.findByTestId("token-summary");
      expect(summary).toHaveTextContent(
        "1,000 in (600 cached + 100 cache write)",
      );
      expect(summary).not.toHaveTextContent("1,700 in");
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });

  test("renders unavailable canonical usage as dashes instead of zero", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    try {
      renderWithConfig(
        <ChatBubble
          message={{
            ...messageWithTokenSummary,
            id: "assistant-canonical-unavailable",
            meta: { bundle: buildRunBundleV1({ unavailable: true }) },
          }}
          traceFrames={[]}
        />,
      );

      expect(await screen.findByTestId("token-summary")).toHaveTextContent(
        "– in · – out · – total",
      );
      expect(screen.getByTestId("token-summary")).not.toHaveTextContent(
        "0 total",
      );
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });
});
