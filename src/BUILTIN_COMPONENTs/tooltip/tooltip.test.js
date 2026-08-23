import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import Tooltip from "./tooltip";

/**
 * Every tooltip bubble renders into one SHARED portal root as a DOM sibling of
 * every other one, regardless of how they are nested in the React tree — a
 * Select's own dropdown opened from inside an already-open popover, for
 * instance. A click landing inside the INNER bubble is therefore, in the DOM,
 * outside the OUTER one's own trigger/bubble nodes, which used to close the
 * outer popover out from under whatever the user was still doing inside it.
 */
const NestedTooltips = () => {
  const [outerOpen, setOuterOpen] = useState(true);
  const [innerOpen, setInnerOpen] = useState(true);
  return (
    <Tooltip
      trigger={["click"]}
      open={outerOpen}
      on_open_change={setOuterOpen}
      tooltip_component={
        <div data-testid="outer-bubble">
          <div data-testid="outer-other-content">other row</div>
          <Tooltip
            trigger={["click"]}
            open={innerOpen}
            on_open_change={setInnerOpen}
            tooltip_component={
              <div data-testid="inner-bubble">inner content</div>
            }
          >
            <button type="button" data-testid="inner-trigger">
              inner trigger
            </button>
          </Tooltip>
        </div>
      }
    >
      <button type="button" data-testid="outer-trigger">
        outer trigger
      </button>
    </Tooltip>
  );
};

describe("Tooltip outside-click detection across nested, portaled tooltips", () => {
  test("a click inside a NESTED tooltip's own bubble does not close the outer one", async () => {
    render(<NestedTooltips />);

    expect(await screen.findByTestId("outer-bubble")).toBeInTheDocument();
    expect(await screen.findByTestId("inner-bubble")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("inner-bubble"));

    expect(screen.getByTestId("outer-bubble")).toBeInTheDocument();
    expect(screen.getByTestId("inner-bubble")).toBeInTheDocument();
  });

  test("a click elsewhere in the outer popover (not the nested tooltip) still closes the nested one", async () => {
    render(<NestedTooltips />);

    expect(await screen.findByTestId("inner-bubble")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outer-other-content"));

    expect(screen.queryByTestId("inner-bubble")).not.toBeInTheDocument();
    expect(screen.getByTestId("outer-bubble")).toBeInTheDocument();
  });

  test("a click truly outside every tooltip still closes it", () => {
    render(
      <>
        <div data-testid="page-background" />
        <NestedTooltips />
      </>,
    );

    fireEvent.mouseDown(screen.getByTestId("page-background"));

    expect(screen.queryByTestId("outer-bubble")).not.toBeInTheDocument();
  });
});
