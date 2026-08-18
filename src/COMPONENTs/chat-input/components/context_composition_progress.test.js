import { act, fireEvent, render, screen, within } from "@testing-library/react";

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
