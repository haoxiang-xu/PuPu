import React from "react";
import { act, render } from "@testing-library/react";
import AnimatedChildren from "./animated_children";

describe("AnimatedChildren", () => {
  let scrollHeightSpy;

  beforeEach(() => {
    scrollHeightSpy = jest
      .spyOn(Element.prototype, "scrollHeight", "get")
      .mockReturnValue(120);
  });

  afterEach(() => {
    scrollHeightSpy.mockRestore();
  });

  test("stays collapsed when skipAnimation flips off without open changing", () => {
    const { container, rerender } = render(
      <AnimatedChildren open={false} skipAnimation={true}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );
    const wrapper = container.firstChild;
    expect(wrapper.style.height).toBe("0px");

    /* drop moment in Explorer: isDragging true -> false, open unchanged */
    rerender(
      <AnimatedChildren open={false} skipAnimation={false}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );

    /* must NOT flash open to the content height */
    expect(wrapper.style.height).toBe("0px");
  });

  test("stays expanded at auto height when skipAnimation flips off", () => {
    const { container, rerender } = render(
      <AnimatedChildren open={true} skipAnimation={true}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );
    const wrapper = container.firstChild;
    expect(wrapper.style.height).toBe("auto");

    rerender(
      <AnimatedChildren open={true} skipAnimation={false}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );

    expect(wrapper.style.height).toBe("auto");
  });

  test("still animates a real open toggle", () => {
    jest.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedChildren open={false} skipAnimation={false}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );
    const wrapper = container.firstChild;

    rerender(
      <AnimatedChildren open={true} skipAnimation={false}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );

    /* expand: measured pixel height first, then settles to auto */
    expect(wrapper.style.height).toBe("120px");
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(wrapper.style.height).toBe("auto");
    jest.useRealTimers();
  });

  test("snaps to final height when a drag starts mid-expand-animation", () => {
    jest.useFakeTimers();
    const { container, rerender } = render(
      <AnimatedChildren open={false} skipAnimation={false}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );
    const wrapper = container.firstChild;

    /* expand starts: fixed pixel height, settle timer pending */
    rerender(
      <AnimatedChildren open={true} skipAnimation={false}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );
    expect(wrapper.style.height).toBe("120px");

    /* a new drag begins before the 280ms settle timer fires */
    rerender(
      <AnimatedChildren open={true} skipAnimation={true}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );

    expect(wrapper.style.height).toBe("auto");
    jest.useRealTimers();
  });

  test("still closes instantly when skipAnimation is on and open turns false", () => {
    const { container, rerender } = render(
      <AnimatedChildren open={true} skipAnimation={true}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );
    const wrapper = container.firstChild;

    rerender(
      <AnimatedChildren open={false} skipAnimation={true}>
        <div style={{ height: 120 }}>child</div>
      </AnimatedChildren>,
    );

    expect(wrapper.style.height).toBe("0px");
  });
});
