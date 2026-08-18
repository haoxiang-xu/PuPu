import { fireEvent, render, screen, within } from "@testing-library/react";

import { ConfigContext } from "../../../CONTAINERs/config/context";
import defaultTheme from "../../../BUILTIN_COMPONENTs/theme/default_mini_theme.json";
import { CONTEXT_COMPOSITION_EXTENSION_KEY } from "../../../SERVICEs/context_composition_v1";
import ContextCompositionPanel, {
  CONTENT_HEIGHT_BUFFER,
  MAX_PANE_VIEWPORT_HEIGHT,
  contextCompositionPalette,
} from "./context_composition_panel";

const {
  buildRunBundleV1,
} = require("../../../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

/**
 * A single-call bundle whose ONE receipt is a valid, reconciled extension with
 * a "tools" category that has subtypes. Both Context (model_call) and Summary
 * (run_tree) project this same call, so both scopes come back `available`
 * simultaneously — the scenario that actually exercises dual-mounting instead
 * of one being a trivial "no data" stand-in for the other.
 */
const dualAvailableBundle = () => {
  const bundle = buildRunBundleV1();
  bundle.provider_calls[0].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] = {
    schema: "unchain.context/context_composition_v1",
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
        tokens: 300,
        source_count: 1,
        subtypes: [{ id: "core_system", tokens: 300, source_count: 1 }],
      },
      {
        id: "tool_definitions",
        tokens: 200,
        source_count: 1,
        subtypes: [{ id: "provider_schema", tokens: 200, source_count: 1 }],
      },
    ],
    attributed_tokens: 500,
    residual_tokens: 500,
    coverage: {
      status: "complete",
      manifest_items: 2,
      matched_items: 2,
      wire_surfaces: 1,
      matched_surfaces: 1,
    },
  };
  return bundle;
};

const palette = contextCompositionPalette(defaultTheme.dark_mode, true);

const renderPanel = (props = {}) =>
  render(
    <ConfigContext.Provider
      value={{ theme: defaultTheme.dark_mode, onThemeMode: "dark_mode" }}
    >
      <ContextCompositionPanel
        bundle={null}
        open
        palette={palette}
        {...props}
      />
    </ConfigContext.Provider>,
  );

const track = () => screen.getByTestId("context-composition-track");

describe("Both scopes stay mounted for the slide", () => {
  test("Context and Summary panes are both in the DOM regardless of which is active", () => {
    renderPanel({ bundle: dualAvailableBundle() });

    expect(
      screen.getByTestId("context-composition-pane-model_call"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("context-composition-pane-run_tree"),
    ).toBeInTheDocument();
  });

  test("the inactive pane is hidden from assistive tech and inert, not merely styled away", () => {
    renderPanel({ bundle: dualAvailableBundle() });

    const contextPane = screen.getByTestId(
      "context-composition-pane-model_call",
    );
    const summaryPane = screen.getByTestId(
      "context-composition-pane-run_tree",
    );
    expect(contextPane).toHaveAttribute("aria-hidden", "false");
    expect(contextPane).not.toHaveAttribute("inert");
    expect(summaryPane).toHaveAttribute("aria-hidden", "true");
    // React sets this as a real attribute (jsdom does not reflect it back
    // through the .inert IDL property), so assert the attribute directly.
    expect(summaryPane).toHaveAttribute("inert", "");

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));

    expect(contextPane).toHaveAttribute("aria-hidden", "true");
    expect(contextPane).toHaveAttribute("inert", "");
    expect(summaryPane).toHaveAttribute("aria-hidden", "false");
    expect(summaryPane).not.toHaveAttribute("inert");
  });

  test("the track slides by exactly one viewport width per scope", () => {
    renderPanel({ bundle: dualAvailableBundle() });

    expect(track()).toHaveStyle({ transform: "translateX(0%)" });

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(track()).toHaveStyle({ transform: "translateX(-50%)" });

    fireEvent.click(screen.getByRole("tab", { name: "Context" }));
    expect(track()).toHaveStyle({ transform: "translateX(0%)" });
  });

  test("expanding a group in the active pane does not also expand it in the still-inactive one", () => {
    /* Regression: openGroup is one shared piece of state — necessarily, since
       it is what lets a switch-and-switch-back land where you left it, exactly
       matching how this worked before either scope could be inactive-but-
       mounted at all. The thing that must NOT happen is the OTHER pane, which
       the user has not touched and is not showing, expanding its own
       same-id group in parallel while both are simultaneously in the DOM —
       that would put two "Provider schema" rows in the document at once. */
    renderPanel({ bundle: dualAvailableBundle() });

    const contextPane = screen.getByTestId(
      "context-composition-pane-model_call",
    );
    const summaryPane = screen.getByTestId(
      "context-composition-pane-run_tree",
    );

    fireEvent.click(within(contextPane).getByRole("button", { name: /Tools/ }));
    expect(
      within(contextPane).getByText("Provider schema"),
    ).toBeInTheDocument();

    // Summary was never clicked and stays inactive throughout — it must not
    // mirror Context's expansion just because the state happens to be shared.
    expect(
      within(summaryPane).queryByText("Provider schema"),
    ).not.toBeInTheDocument();
  });
});

describe("Viewport height follows the active pane, not both stacked", () => {
  const setScrollHeight = (element, value) =>
    Object.defineProperty(element, "scrollHeight", {
      configurable: true,
      value,
    });

  test("falls back to the plain cap before anything has been measured", () => {
    // jsdom never lays out real content, so scrollHeight is always 0 — the
    // exact "not measured yet" state a real first frame also passes through.
    renderPanel({ bundle: dualAvailableBundle() });
    expect(screen.getByTestId("context-composition-viewport")).toHaveStyle({
      height: `${MAX_PANE_VIEWPORT_HEIGHT}px`,
    });
  });

  test("measures the currently active pane's own height, ignoring a taller inactive one", () => {
    renderPanel({ bundle: dualAvailableBundle() });
    const contextPane = screen.getByTestId(
      "context-composition-pane-model_call",
    );
    const summaryPane = screen.getByTestId(
      "context-composition-pane-run_tree",
    );
    setScrollHeight(contextPane, 200);
    setScrollHeight(summaryPane, 900); // taller — must NOT drive the viewport

    // The effect that reads scrollHeight only re-runs on an actual scope
    // change (clicking the ALREADY-active tab is a no-op, same as a real
    // click would be) — round-trip through Summary to force a fresh measure
    // that picks up the heights set above, landing back on Context.
    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    fireEvent.click(screen.getByRole("tab", { name: "Context" }));
    expect(screen.getByTestId("context-composition-viewport")).toHaveStyle({
      height: `${200 + CONTENT_HEIGHT_BUFFER}px`,
    });
  });

  test("re-measures on scope switch, taking the newly active pane's height", () => {
    renderPanel({ bundle: dualAvailableBundle() });
    const contextPane = screen.getByTestId(
      "context-composition-pane-model_call",
    );
    const summaryPane = screen.getByTestId(
      "context-composition-pane-run_tree",
    );
    setScrollHeight(contextPane, 200);
    setScrollHeight(summaryPane, 340);

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(screen.getByTestId("context-composition-viewport")).toHaveStyle({
      height: `${340 + CONTENT_HEIGHT_BUFFER}px`,
    });

    fireEvent.click(screen.getByRole("tab", { name: "Context" }));
    expect(screen.getByTestId("context-composition-viewport")).toHaveStyle({
      height: `${200 + CONTENT_HEIGHT_BUFFER}px`,
    });
  });

  test("clamps to its own internal ceiling for genuinely tall content", () => {
    renderPanel({ bundle: dualAvailableBundle() });
    const contextPane = screen.getByTestId(
      "context-composition-pane-model_call",
    );
    setScrollHeight(contextPane, MAX_PANE_VIEWPORT_HEIGHT + 400);

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    fireEvent.click(screen.getByRole("tab", { name: "Context" }));
    expect(screen.getByTestId("context-composition-viewport")).toHaveStyle({
      height: `${MAX_PANE_VIEWPORT_HEIGHT}px`,
    });
  });
});
