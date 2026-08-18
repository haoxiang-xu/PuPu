import { fireEvent, render, screen, within } from "@testing-library/react";

import { ConfigContext } from "../../../CONTAINERs/config/context";
import defaultTheme from "../../../BUILTIN_COMPONENTs/theme/default_mini_theme.json";
import ContextCompositionProgress from "./context_composition_progress";
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

/* Composition evidence, so the panel renders its scope tabs — switching scope
   is what drives a re-measure. */
const compositionBundle = () => {
  const bundle = buildRunBundleV1();
  bundle.provider_calls[0].extensions[
    "unchain.context/context_composition_v1"
  ] = {
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
    attributed_tokens: 300,
    residual_tokens: 700,
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

describe("popover height", () => {
  test("measures the natural height, not the height its own cap produces", async () => {
    /* Regression: reading scrollHeight while max-height is applied returns the
       COMPRESSED height, because the inner list absorbs the overflow by
       scrolling. Feeding that back into the cap shrank the card on every pass
       until it collapsed to nothing. The measurement has to drop the cap first,
       which this fake reproduces exactly. */
    const NATURAL = 420;
    const COMPRESSED = 96;

    renderRing(null, { bundle: compositionBundle() });
    fireEvent.click(screen.getByTestId("context-composition-progress"));
    const popover = await screen.findByTestId("context-composition-popover");

    Object.defineProperty(popover, "scrollHeight", {
      configurable: true,
      get() {
        return this.style.maxHeight === "none" ? NATURAL : COMPRESSED;
      },
    });

    // Each scope switch re-measures. Several rounds, because one pass could
    // look right while still converging downward on every later change.
    for (let round = 0; round < 3; round += 1) {
      // Tooltip renders into a portal that stays visibility:hidden in jsdom,
      // so the a11y tree skips it — address the tabs by id instead.
      fireEvent.click(popover.querySelector("#context-composition-run_tree-tab"));
      fireEvent.click(popover.querySelector("#context-composition-model_call-tab"));
    }

    expect(popover.style.maxHeight).toBe(`min(${NATURAL}px, 64vh, 480px)`);
    expect(popover.style.maxHeight).not.toContain(String(COMPRESSED));
    // The cap is always restored after a measurement.
    expect(popover.style.maxHeight).not.toBe("none");
  });

  test("re-measures when the panel changes height", async () => {
    renderRing(null, { bundle: compositionBundle() });
    fireEvent.click(screen.getByTestId("context-composition-progress"));
    const popover = await screen.findByTestId("context-composition-popover");

    let natural = 300;
    Object.defineProperty(popover, "scrollHeight", {
      configurable: true,
      get() {
        return this.style.maxHeight === "none" ? natural : 10;
      },
    });

    fireEvent.click(popover.querySelector("#context-composition-run_tree-tab"));
    expect(popover.style.maxHeight).toBe("min(300px, 64vh, 480px)");

    natural = 180;
    fireEvent.click(popover.querySelector("#context-composition-model_call-tab"));
    expect(popover.style.maxHeight).toBe("min(180px, 64vh, 480px)");
  });

  test("caps by the plain limit until the content has been measured", async () => {
    // jsdom reports scrollHeight 0 and has no ResizeObserver, which is exactly
    // the "not measured yet" state a real first frame passes through. It must
    // not collapse the card down to its own padding.
    renderRing(usageViewAt(1000, 4000));
    fireEvent.click(screen.getByTestId("context-composition-progress"));

    const popover = await screen.findByTestId("context-composition-popover");
    expect(popover).toHaveStyle({ maxHeight: "min(64vh, 480px)" });
    expect(popover.style.transition).toContain("max-height");
  });
});
