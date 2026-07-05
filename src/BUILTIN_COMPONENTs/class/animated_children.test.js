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

  describe("unmountWhenClosed(opt-in 懒挂载)", () => {
    test("初始收起时 children 完全不挂载", () => {
      const { queryByText } = render(
        <AnimatedChildren open={false} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      expect(queryByText("lazy child")).toBeNull();
    });

    test("展开时先挂载 children 再做高度动画(同一提交内可测量)", () => {
      const { queryByText, rerender } = render(
        <AnimatedChildren open={false} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      rerender(
        <AnimatedChildren open={true} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      expect(queryByText("lazy child")).toBeInTheDocument();
    });

    test("收起后等动画播完才卸载", () => {
      jest.useFakeTimers();
      const { container, queryByText, rerender } = render(
        <AnimatedChildren open={true} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      rerender(
        <AnimatedChildren open={false} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      /* 动画进行中仍挂载(收起动画需要内容在场) */
      expect(queryByText("lazy child")).toBeInTheDocument();
      act(() => {
        jest.advanceTimersByTime(400);
      });
      expect(queryByText("lazy child")).toBeNull();
      expect(container.firstChild.style.height).toBe("0px");
      jest.useRealTimers();
    });

    test("skipAnimation 收起时立即卸载", () => {
      jest.useFakeTimers();
      const { queryByText, rerender } = render(
        <AnimatedChildren open={true} skipAnimation unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      rerender(
        <AnimatedChildren open={false} skipAnimation unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      act(() => {
        jest.advanceTimersByTime(1);
      });
      expect(queryByText("lazy child")).toBeNull();
      jest.useRealTimers();
    });

    test("默认(不传)保持既有行为:收起时 children 仍挂载", () => {
      const { getByText } = render(
        <AnimatedChildren open={false}>
          <div>always mounted</div>
        </AnimatedChildren>,
      );
      expect(getByText("always mounted")).toBeInTheDocument();
    });

    test("收起动画中途重新展开,取消卸载", () => {
      jest.useFakeTimers();
      const { queryByText, rerender } = render(
        <AnimatedChildren open={true} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      rerender(
        <AnimatedChildren open={false} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      act(() => {
        jest.advanceTimersByTime(100);
      });
      rerender(
        <AnimatedChildren open={true} unmountWhenClosed>
          <div>lazy child</div>
        </AnimatedChildren>,
      );
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(queryByText("lazy child")).toBeInTheDocument();
      jest.useRealTimers();
    });
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
