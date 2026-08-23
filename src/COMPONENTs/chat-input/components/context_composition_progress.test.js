import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { ConfigContext } from "../../../CONTAINERs/config/context";
import defaultTheme from "../../../BUILTIN_COMPONENTs/theme/default_mini_theme.json";
import ContextCompositionProgress from "./context_composition_progress";
import { CONTEXT_COMPOSITION_EXTENSION_KEY } from "../../../SERVICEs/context_composition_v1";
import {
  buildContextUsageView,
  selectContextUsage,
} from "../../../SERVICEs/context_usage_v1";

const {
  buildRunBundleV1,
} = require("../../../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

/**
 * Renders against the REAL BUILTIN Button and Tooltip. attach_panel.test.js
 * mocks Button away, so this is the only place the ring's integration with it
 * is actually exercised.
 */
const renderRing = (usageView, { bundle = null, mode = "dark_mode" } = {}) =>
  render(
    <ConfigContext.Provider
      value={{ theme: defaultTheme[mode], onThemeMode: mode }}
    >
      <ContextCompositionProgress
        bundle={bundle}
        usageView={usageView}
        isDark={mode === "dark_mode"}
      />
    </ConfigContext.Provider>,
  );

const usageViewAt = (inputTokens, windowTokens) => {
  const bundle = buildRunBundleV1();
  bundle.provider_calls.forEach((call) => {
    call.usage.input.total_tokens = inputTokens;
  });
  return buildContextUsageView(selectContextUsage(bundle), windowTokens);
};

describe("ContextCompositionProgress", () => {
  test("renders as a real Button carrying the popup semantics", () => {
    renderRing(usageViewAt(1000, 4000));

    const trigger = screen.getByTestId("context-composition-progress");
    expect(trigger.tagName).toBe("BUTTON");
    // These belong on the control itself, not a wrapper — a screen reader has
    // to learn the expanded state from the thing it is focused on.
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("data-context-pressure", "25");
    expect(trigger).toHaveAccessibleName(/25% full/i);
  });

  test("toggles the popover open and closed from the same trigger", async () => {
    renderRing(usageViewAt(1000, 4000));
    const trigger = screen.getByTestId("context-composition-progress");

    fireEvent.click(trigger);
    const popover = await screen.findByTestId("context-composition-popover");
    expect(within(popover).getByText("Context Usage")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(trigger);
    expect(
      screen.queryByTestId("context-composition-popover"),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  test("marks pressure unavailable when no window is known", () => {
    renderRing(usageViewAt(1000, null));

    const trigger = screen.getByTestId("context-composition-progress");
    expect(trigger).toHaveAttribute("data-context-pressure", "unavailable");
    expect(trigger).toHaveAccessibleName(/unavailable/i);
  });

  test("renders nothing without usage or composition", () => {
    renderRing(null);
    expect(
      screen.queryByTestId("context-composition-progress"),
    ).not.toBeInTheDocument();
  });
});

describe("focus is not stolen from the composer", () => {
  test("prevents mousedown's default focus shift, same as every other selector on the row", async () => {
    /* Regression: attach_panel keeps its floated shape via
       `floating = active || focused`. Without preventDefault, mousedown moves
       focus to the button by the BROWSER's default action, blurring the
       composer's textarea. That drops `focused`, which drops `floating`,
       which can collapse the row BETWEEN mousedown and mouseup — so the click
       lands on collapsed layout instead of the ring, the popover never opens,
       and the panel is left looking inactive.
       jsdom does not simulate that default focus shift on fireEvent.mouseDown
       the way a real browser does, so asserting on focus here would pass
       whether or not the guard exists. `defaultPrevented` is the actual
       contract the browser acts on, and it is what selectWrap already relies
       on for the model/tools/workspace selectors beside this one — so it is
       asserted directly instead. */
    render(
      <ConfigContext.Provider
        value={{ theme: defaultTheme.dark_mode, onThemeMode: "dark_mode" }}
      >
        <ContextCompositionProgress
          bundle={null}
          usageView={usageViewAt(1000, 4000)}
          isDark
        />
      </ConfigContext.Provider>,
    );

    const trigger = screen.getByTestId("context-composition-progress");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    // Raw dispatchEvent (not fireEvent) so the DOM's real defaultPrevented
    // semantics apply — Button's own onMouseDown also runs synchronously off
    // it and touches state, so this still needs act().
    act(() => {
      trigger.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);

    // The click that follows the guarded mousedown must still open the popover
    // — the fix must not trade the collapse bug for a broken trigger.
    fireEvent.click(trigger);
    expect(
      await screen.findByTestId("context-composition-popover"),
    ).toBeInTheDocument();
  });
});

describe("CallPicker's own dropdown (nested inside the ring's popover)", () => {
  /* Two calls so CallPicker actually renders (it returns null below 2). Real
     BUILTIN Select, not the mock context_composition_panel.test.js uses for
     its own coverage — this is the one place the real, doubly-nested Tooltip
     (ring popover > Select dropdown, both riding the same shared portal) gets
     exercised end to end. */
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
    // attributed_tokens must equal the categories' own token sum (300); the
    // two calls' own usage totals differ (350 vs 1000), so only the residual
    // differs between them — see context_composition_panel.test.js.
    bundle.provider_calls[0].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] =
      extension(300, 50);
    bundle.provider_calls[1].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] =
      extension(300, 700);
    return bundle;
  };

  test("clicking elsewhere in the ring's popover closes CallPicker's own dropdown, not the popover", async () => {
    render(
      <ConfigContext.Provider
        value={{ theme: defaultTheme.dark_mode, onThemeMode: "dark_mode" }}
      >
        <ContextCompositionProgress
          bundle={twoCallBundle()}
          usageView={null}
          open
          onOpenChange={() => {}}
        />
      </ConfigContext.Provider>,
    );
    // Flush BUILTIN Icon's dynamic-import-based async load inside act().
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {});

    const popover = await screen.findByTestId("context-composition-popover");
    fireEvent.click(within(popover).getByText(/^Call \d/));

    // Select's dropdown rides Tooltip, which stays visibility:hidden in
    // jsdom (it can never measure real dimensions to mark itself ready —
    // see tooltip.test.js and context_composition_panel.test.js for the same
    // limitation). getByRole respects that computed visibility and would
    // never find it without { hidden: true }.
    expect(
      await screen.findByRole("listbox", { hidden: true }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(popover);

    expect(
      screen.queryByRole("listbox", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(popover).toBeInTheDocument();
  });

  test("still closes when a React ancestor stops mousedown propagation (attach_panel's selectWrap)", async () => {
    /* Regression: portal content bubbles through the REACT tree, not the DOM
       tree. In the real app the ring sits inside attach_panel's selectWrap,
       whose onMouseDown calls stopPropagation — which kills the NATIVE
       mousedown at React's delegation point for every click INSIDE the
       portaled popover too. A bubble-phase document listener therefore never
       fired for those clicks and the nested dropdown could not close on them;
       the outside-click listener must run in the CAPTURE phase to be immune.
       Verified against the live app via the test API before being fixed. */
    render(
      <ConfigContext.Provider
        value={{ theme: defaultTheme.dark_mode, onThemeMode: "dark_mode" }}
      >
        <div
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          <ContextCompositionProgress
            bundle={twoCallBundle()}
            usageView={null}
            open
            onOpenChange={() => {}}
          />
        </div>
      </ConfigContext.Provider>,
    );
    // eslint-disable-next-line testing-library/no-unnecessary-act
    await act(async () => {});

    const popover = await screen.findByTestId("context-composition-popover");
    fireEvent.click(within(popover).getByText(/^Call \d/));
    expect(
      await screen.findByRole("listbox", { hidden: true }),
    ).toBeInTheDocument();

    fireEvent.mouseDown(
      within(popover).getByTestId("context-composition-headline"),
    );

    expect(
      screen.queryByRole("listbox", { hidden: true }),
    ).not.toBeInTheDocument();
    expect(popover).toBeInTheDocument();
  });
});
