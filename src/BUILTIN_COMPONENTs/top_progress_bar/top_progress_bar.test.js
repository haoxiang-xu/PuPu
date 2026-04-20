import { render, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TopProgressBar from "./top_progress_bar";
import { start, stop, _resetForTest } from "../../SERVICEs/progress_bus";

function renderBar() {
  return render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <TopProgressBar />
    </ConfigContext.Provider>
  );
}

describe("TopProgressBar", () => {
  beforeEach(() => _resetForTest());

  test("空 active 时不渲染 bar", () => {
    const { container } = renderBar();
    expect(container.querySelector('[data-testid="top-progress-bar"]')).toBeNull();
  });

  test("start 后渲染 bar", () => {
    const { container } = renderBar();
    act(() => { start("a", "Sending"); });
    expect(container.querySelector('[data-testid="top-progress-bar"]')).not.toBeNull();
  });

  test("最后一个 stop 后 bar 进入 fade-out", () => {
    jest.useFakeTimers();
    const { container } = renderBar();
    act(() => { start("a", "X"); });
    act(() => { stop("a"); });
    act(() => { jest.advanceTimersByTime(250); });
    expect(container.querySelector('[data-testid="top-progress-bar"]')).toBeNull();
    jest.useRealTimers();
  });
});
