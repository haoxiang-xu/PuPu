import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { ConfigContext } from "../../../CONTAINERs/config/context";
import defaultTheme from "../../../BUILTIN_COMPONENTs/theme/default_mini_theme.json";
import { CONTEXT_COMPOSITION_EXTENSION_KEY } from "../../../SERVICEs/context_composition_v1";
import ContextCompositionPanel, {
  CONTENT_HEIGHT_BUFFER,
  MAX_PANE_VIEWPORT_HEIGHT,
  contextCompositionPalette,
} from "./context_composition_panel";

/* BUILTIN Select's real dropdown rides the same Tooltip mechanism the ring's
   own popover does, which stays visibility:hidden in jsdom (it can never
   measure real dimensions to mark itself ready — see the ring's own tests for
   the same limitation). None of the other tests in this file render Select
   at all (they never reach two calls), so mocking it here is scoped to
   exactly the CallPicker coverage that needs it. */
jest.mock("../../../BUILTIN_COMPONENTs/select/select", () => ({
  __esModule: true,
  Select: ({ options = [], custom_trigger, set_value = () => {} }) => (
    <div>
      {custom_trigger}
      <div role="listbox">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected="false"
            onClick={() => set_value(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  ),
}));

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

/**
 * A two-call bundle, so Context has a real choice to pick between and
 * CallPicker actually renders (it returns null below two calls).
 *
 * buildRunBundleV1({ multiModel: true }) fixes provider_calls[0] as the
 * anthropic/claude-sonnet-4-6 receipt (iteration 2) and provider_calls[1] as
 * the openai/gpt-5.6 receipt (iteration 1) — display order is by ITERATION,
 * not array position, so this reads as "Call 1 · openai" / "Call 2 ·
 * anthropic", the reverse of the array. Each receipt's own usage defaults to
 * 1000 input tokens, so attributed + residual must sum to 1000 on each.
 */
const twoCallBundle = () => {
  const bundle = buildRunBundleV1({ multiModel: true });
  const extension = (attributedTokens, residualTokens) => ({
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
    ],
    attributed_tokens: attributedTokens,
    residual_tokens: residualTokens,
    coverage: {
      status: "complete",
      manifest_items: 1,
      matched_items: 1,
      wire_surfaces: 1,
      matched_surfaces: 1,
    },
  });
  // attributed_tokens must equal the categories' own token sum (300, the
  // single "instructions" category below) — the normalizer rejects anything
  // else outright. anthropicReceipt's own usage totals 350 (not the openai
  // default of 1000), so only the RESIDUAL differs between the two calls;
  // both were verified directly against the real fixture and validator
  // rather than assumed.
  bundle.provider_calls[0].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] =
    extension(300, 50); // Call 2 · anthropic / claude-sonnet-4-6
  bundle.provider_calls[1].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] =
    extension(300, 700); // Call 1 · openai / gpt-5.6
  return bundle;
};

const palette = contextCompositionPalette(defaultTheme.dark_mode, true);

const renderPanel = async (props = {}) => {
  const utils = render(
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
  // BUILTIN Icon (the expand chevron) loads its SVG via a dynamic import that
  // resolves after this synchronous render — flush it here, inside act(), so
  // it does not fire later, unwrapped, at some point the test does not control.
  // This is an intentional flush of a third-party async setState, not a
  // redundant wrap around a testing-library call.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  await act(async () => {});
  return utils;
};

const track = () => screen.getByTestId("context-composition-track");

describe("Both scopes stay mounted for the slide", () => {
  test("Context and Summary panes are both in the DOM regardless of which is active", async () => {
    await renderPanel({ bundle: dualAvailableBundle() });

    expect(
      screen.getByTestId("context-composition-pane-model_call"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("context-composition-pane-run_tree"),
    ).toBeInTheDocument();
  });

  test("the inactive pane is hidden from assistive tech and inert, not merely styled away", async () => {
    await renderPanel({ bundle: dualAvailableBundle() });

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

  test("the track slides by exactly one viewport width per scope", async () => {
    await renderPanel({ bundle: dualAvailableBundle() });

    expect(track()).toHaveStyle({ transform: "translateX(0%)" });

    fireEvent.click(screen.getByRole("tab", { name: "Summary" }));
    expect(track()).toHaveStyle({ transform: "translateX(-50%)" });

    fireEvent.click(screen.getByRole("tab", { name: "Context" }));
    expect(track()).toHaveStyle({ transform: "translateX(0%)" });
  });

  test("expanding a group in the active pane does not also expand it in the still-inactive one", async () => {
    /* Regression: openGroup is one shared piece of state — necessarily, since
       it is what lets a switch-and-switch-back land where you left it, exactly
       matching how this worked before either scope could be inactive-but-
       mounted at all. The thing that must NOT happen is the OTHER pane, which
       the user has not touched and is not showing, expanding its own
       same-id group in parallel while both are simultaneously in the DOM —
       that would put two "Provider schema" rows in the document at once. */
    await renderPanel({ bundle: dualAvailableBundle() });

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

  test("sizes to content immediately before anything has been measured, capped only by the ceiling", async () => {
    // jsdom never lays out real content, so scrollHeight is always 0 — the
    // exact "not measured yet" state a real first frame also passes through.
    // This must be "auto" (content-driven, matching how every other menu on
    // this row sizes itself) rather than a fixed px value — "auto" cannot be
    // CSS-transitioned, so the first paint is an immediate snap to whatever
    // the content actually is, never a visible grow/shrink a beat after the
    // popover has already faded in.
    await renderPanel({ bundle: dualAvailableBundle() });
    expect(screen.getByTestId("context-composition-viewport")).toHaveStyle({
      height: "auto",
      maxHeight: `${MAX_PANE_VIEWPORT_HEIGHT}px`,
    });
  });

  test("measures the currently active pane's own height, ignoring a taller inactive one", async () => {
    await renderPanel({ bundle: dualAvailableBundle() });
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

  test("re-measures on scope switch, taking the newly active pane's height", async () => {
    await renderPanel({ bundle: dualAvailableBundle() });
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

  test("clamps to its own internal ceiling for genuinely tall content", async () => {
    await renderPanel({ bundle: dualAvailableBundle() });
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

  test("scrolls through the BUILTIN overlay scrollbar, not the platform's own", async () => {
    // `.scrollable` is the whole opt-in: it is what hides the native bar and
    // hands the container to BUILTIN Scrollable. Drop it and this popover is
    // the one menu on the attach row painting a native track and a square
    // thumb onto a frosted card. The two data-sb values are the placement the
    // palette-family select dropdown uses, which this card copies elsewhere.
    await renderPanel({ bundle: dualAvailableBundle() });
    const viewport = screen.getByTestId("context-composition-viewport");
    expect(viewport).toHaveClass("scrollable");
    expect(viewport).toHaveAttribute("data-sb-wall", "2");
    expect(viewport).toHaveAttribute("data-sb-edge", "12");
  });
});

describe("CallPicker rides BUILTIN Select instead of a native <select>", () => {
  test("opens a real palette dropdown and switches the active call", async () => {
    await renderPanel({ bundle: twoCallBundle() });

    // Defaults to the latest iteration, matching how the old native <select>
    // defaulted — Call 2 (anthropic) is iteration 2, the newer of the two.
    const trigger = screen.getByRole("button", {
      name: /Call 2 · anthropic \/ claude-sonnet-4-6/i,
    });
    fireEvent.click(trigger);

    const otherOption = await screen.findByRole("option", {
      name: /Call 1 · openai \/ gpt-5\.6/i,
    });
    fireEvent.click(otherOption);

    // The trigger's own label is what proves the switch actually happened —
    // this is a real BUILTIN Select choosing a real option, not a decoration.
    await screen.findByRole("button", {
      name: /Call 1 · openai \/ gpt-5\.6/i,
    });
    expect(
      screen.queryByRole("button", {
        name: /Call 2 · anthropic \/ claude-sonnet-4-6/i,
      }),
    ).not.toBeInTheDocument();
  });
});
