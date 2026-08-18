import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConfigContext } from "../../../CONTAINERs/config/context";
import defaultTheme from "../../../BUILTIN_COMPONENTs/theme/default_mini_theme.json";
import { CONTEXT_COMPOSITION_EXTENSION_KEY } from "../../../SERVICEs/context_composition_v1";
import ContextCompositionModal from "./context_composition_modal";

const {
  buildRunBundleV1,
} = require("../../../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

const reconciledExtension = ({
  categories = [
    {
      id: "instructions",
      tokens: 300,
      source_count: 1,
      subtypes: [{ id: "core_system", tokens: 300, source_count: 1 }],
    },
    {
      id: "skills",
      tokens: 200,
      source_count: 1,
      subtypes: [
        { id: "expanded_invocation", tokens: 200, source_count: 1 },
      ],
    },
  ],
  quality = "reconciled_estimate",
  attributedTokens = 500,
  residualTokens = 500,
  contextWindowTokens = 128000,
  manifestItems = categories.length,
} = {}) => ({
  schema: "unchain.context/context_composition_v1",
  method: "utf8_heuristic_v1",
  quality,
  context_window_tokens: contextWindowTokens,
  wire: {
    envelope_sha256: `sha256:${"a".repeat(64)}`,
    route_name: "primary",
    route_sha256: `sha256:${"b".repeat(64)}`,
    context_mode: "semantic",
  },
  categories,
  attributed_tokens: attributedTokens,
  residual_tokens: residualTokens,
  coverage: {
    status: "complete",
    manifest_items: manifestItems,
    matched_items: manifestItems,
    wire_surfaces: 1,
    matched_surfaces: 1,
  },
});

const allUiGroupCategories = [
  {
    id: "instructions",
    tokens: 80,
    source_count: 1,
    subtypes: [{ id: "core_system", tokens: 80, source_count: 1 }],
  },
  {
    id: "skills",
    tokens: 70,
    source_count: 1,
    subtypes: [{ id: "loaded_body", tokens: 70, source_count: 1 }],
  },
  {
    id: "tool_definitions",
    tokens: 40,
    source_count: 1,
    subtypes: [{ id: "provider_schema", tokens: 40, source_count: 1 }],
  },
  {
    id: "conversation",
    tokens: 60,
    source_count: 1,
    subtypes: [{ id: "current_input", tokens: 60, source_count: 1 }],
  },
  {
    id: "tool_activity",
    tokens: 30,
    source_count: 1,
    subtypes: [{ id: "results", tokens: 30, source_count: 1 }],
  },
  {
    id: "memory",
    tokens: 30,
    source_count: 1,
    subtypes: [{ id: "short_term_recall", tokens: 30, source_count: 1 }],
  },
  {
    id: "task_state",
    tokens: 20,
    source_count: 1,
    subtypes: [{ id: "pinned_state", tokens: 20, source_count: 1 }],
  },
  {
    id: "files_media",
    tokens: 40,
    source_count: 1,
    subtypes: [{ id: "file_excerpt", tokens: 40, source_count: 1 }],
  },
  {
    id: "agent_coordination",
    tokens: 30,
    source_count: 1,
    subtypes: [{ id: "handoff_summary", tokens: 30, source_count: 1 }],
  },
  {
    id: "output_contract",
    tokens: 20,
    source_count: 1,
    subtypes: [{ id: "response_schema", tokens: 20, source_count: 1 }],
  },
];

const attachExtension = (bundle, index, extension) => {
  bundle.provider_calls[index].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] =
    extension;
  return bundle;
};

const renderModal = ({
  bundle,
  mode = "light_mode",
  onClose = jest.fn(),
  returnFocusRef,
} = {}) =>
  render(
    <ConfigContext.Provider
      value={{ theme: defaultTheme[mode], onThemeMode: mode }}
    >
      <ContextCompositionModal
        open
        onClose={onClose}
        bundle={bundle}
        returnFocusRef={returnFocusRef}
      />
    </ConfigContext.Provider>,
  );

describe("ContextCompositionModal", () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    window.requestAnimationFrame = jest.fn((callback) => {
      callback(0);
      return 1;
    });
    window.cancelAnimationFrame = jest.fn();
  });

  afterAll(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("shows the stable eight UI groups and only one expanded group", async () => {
    const bundle = attachExtension(
      buildRunBundleV1(),
      0,
      reconciledExtension({
        categories: allUiGroupCategories,
        attributedTokens: 420,
        residualTokens: 580,
      }),
    );

    renderModal({ bundle });
    const dialog = await screen.findByRole("dialog", {
      name: "Context Usage",
    });
    expect(dialog).toHaveAttribute(
      "aria-describedby",
      "context-composition-description",
    );
    expect(
      screen.getByRole("button", { name: "Close Context Usage" }),
    ).toBeInTheDocument();
    // The title is deliberately quiet now — the headline number carries the
    // visual weight it used to take at 22px.
    expect(screen.getByRole("heading", { name: "Context Usage" })).toHaveStyle({
      fontSize: "13px",
    });

    // Fixed order: standing cost first, the one slice that grows last.
    expect(
      screen
        .getAllByTestId("context-composition-group-toggle")
        .map((row) => row.textContent.replace(/[\d.]+K?.*$/, "")),
    ).toEqual([
      "Instructions",
      "Tools",
      "Skills",
      "Agent Coordination",
      "Output Contract",
      "Memory & Task State",
      "Files & Media",
      "Conversation",
    ]);

    // Nothing is pre-expanded. The old default opened group one, so the list
    // was already displaced before the reader had asked for anything.
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);
    expect(screen.queryByText("Core system")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Tools/ }));
    expect(screen.getAllByRole("button", { expanded: true })).toHaveLength(1);
    expect(screen.getByText("Provider schema")).toBeInTheDocument();
    expect(screen.getByText("Results")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Tools/ }));
    expect(screen.queryAllByRole("button", { expanded: true })).toHaveLength(0);

    expect(screen.getByTestId("context-composition-quality")).toHaveTextContent(
      "Reconciled estimate · Complete coverage",
    );
    expect(screen.getByTestId("context-composition-residual-segment"))
      .toHaveAttribute("data-pattern", "hatched");

    // The residual is a real slice of the delivered input, so it is a row too —
    // otherwise the listed numbers silently fail to add up to the headline.
    expect(
      screen.getByTestId("context-composition-residual-row"),
    ).toHaveTextContent("Unattributed");
    expect(screen.queryByText(/sha256:/)).not.toBeInTheDocument();
    expect(dialog.innerHTML).not.toContain("pc_");
  });

  test("withholds percentages and paints unknown separately for an estimate", async () => {
    const bundle = attachExtension(
      buildRunBundleV1(),
      0,
      reconciledExtension({
        categories: [
          {
            id: "conversation",
            tokens: 1200,
            source_count: 1,
            subtypes: [
              { id: "user_history", tokens: 1200, source_count: 1 },
            ],
          },
        ],
        quality: "estimated",
        attributedTokens: 1200,
        residualTokens: null,
      }),
    );

    renderModal({ bundle });
    await screen.findByRole("dialog", { name: "Context Usage" });

    expect(screen.getByTestId("context-composition-headline")).toHaveTextContent(
      "1.2K attributed",
    );
    expect(screen.getByTestId("context-composition-groups").textContent).not.toMatch(
      /\d+(?:\.\d+)?%/,
    );
    expect(screen.getByTestId("context-composition-unknown-segment"))
      .toHaveAttribute("data-pattern", "hatched");
    expect(screen.getByTestId("context-composition-quality")).toHaveTextContent(
      "Estimated",
    );
    // No residual reported means no residual row — never a zero-filled one.
    expect(
      screen.queryByTestId("context-composition-residual-row"),
    ).not.toBeInTheDocument();
  });

  test("withholds category percentages when the provider context window is unavailable", async () => {
    const bundle = attachExtension(
      buildRunBundleV1(),
      0,
      reconciledExtension({ contextWindowTokens: null }),
    );

    renderModal({ bundle });
    await screen.findByRole("dialog", { name: "Context Usage" });

    expect(screen.getByTestId("context-composition-headline")).toHaveTextContent(
      "500 attributed",
    );
    expect(screen.getByTestId("context-composition-groups").textContent).not.toMatch(
      /\d+(?:\.\d+)?%/,
    );
  });

  test("Summary reports set-union totals without category share percentages", async () => {
    const bundle = buildRunBundleV1({ multiModel: true });
    attachExtension(
      bundle,
      0,
      reconciledExtension({
        categories: [
          {
            id: "conversation",
            tokens: 120,
            source_count: 1,
            subtypes: [
              { id: "current_input", tokens: 120, source_count: 1 },
            ],
          },
        ],
        attributedTokens: 120,
        residualTokens: 230,
      }),
    );
    attachExtension(
      bundle,
      1,
      reconciledExtension({
        categories: [
          {
            id: "skills",
            tokens: 80,
            source_count: 1,
            subtypes: [
              { id: "expanded_invocation", tokens: 80, source_count: 1 },
            ],
          },
        ],
        attributedTokens: 80,
        residualTokens: 920,
      }),
    );

    renderModal({ bundle });
    await screen.findByRole("dialog", { name: "Context Usage" });
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));

    expect(screen.getByTestId("run-tree-delivered-input")).toHaveTextContent("1.4K");
    expect(screen.getByTestId("run-tree-call-count")).toHaveTextContent("2");
    expect(screen.getByTestId("context-composition-quality")).toHaveTextContent(
      "1 agent · Peak",
    );
    expect(screen.getByTestId("context-composition-groups").textContent).not.toMatch(
      /\d+(?:\.\d+)?%/,
    );
  });

  test("degrades invalid optional evidence to a stable unavailable state", async () => {
    const invalid = reconciledExtension();
    invalid.raw_prompt = "private content";
    const bundle = attachExtension(buildRunBundleV1(), 0, invalid);

    renderModal({ bundle });
    await screen.findByRole("dialog", { name: "Context Usage" });

    expect(screen.getByText("No composition data yet")).toBeInTheDocument();
    expect(
      screen.getByText("Receipt composition data did not pass validation."),
    ).toBeInTheDocument();
    expect(screen.queryByText("private content")).not.toBeInTheDocument();
  });

  test("focuses its first scope control and returns focus after Escape", async () => {
    const bundle = attachExtension(
      buildRunBundleV1(),
      0,
      reconciledExtension(),
    );
    const onClose = jest.fn();
    const returnFocusRef = createRef();

    render(
      <ConfigContext.Provider
        value={{ theme: defaultTheme.light_mode, onThemeMode: "light_mode" }}
      >
        <button ref={returnFocusRef}>Context summary</button>
        <ContextCompositionModal
          open
          onClose={onClose}
          bundle={bundle}
          returnFocusRef={returnFocusRef}
        />
      </ConfigContext.Provider>,
    );

    const modelCallTab = await screen.findByRole("tab", { name: "Context" });
    await waitFor(() => expect(modelCallTab).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Context summary" })).toHaveFocus();
  });

  test("uses distinct theme inks in light and dark mode", async () => {
    // The shell now owns the surface and the panel owns its content, so the
    // theme signal to check on the panel is its ink, not a background it no
    // longer paints.
    const bundle = attachExtension(
      buildRunBundleV1(),
      0,
      reconciledExtension(),
    );
    const { unmount } = renderModal({ bundle, mode: "light_mode" });
    await screen.findByRole("dialog", { name: "Context Usage" });
    const lightInk = screen.getByTestId("context-composition-panel").style.color;
    unmount();

    renderModal({ bundle, mode: "dark_mode" });
    await screen.findByRole("dialog", { name: "Context Usage" });
    const darkInk = screen.getByTestId("context-composition-panel").style.color;

    expect(lightInk).toBeTruthy();
    expect(lightInk).not.toBe(darkInk);
  });
});
