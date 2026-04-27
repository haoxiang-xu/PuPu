import { render, screen, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ToastHost from "./toast_host";
import { toast } from "../../SERVICEs/toast";
import { _resetForTest } from "../../SERVICEs/toast_bus";

function renderHost() {
  return render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <ToastHost />
    </ConfigContext.Provider>
  );
}

describe("ToastHost", () => {
  beforeEach(() => _resetForTest());

  test("显示 success toast", () => {
    renderHost();
    act(() => { toast.success("done"); });
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  test("4s 后自动消失", () => {
    jest.useFakeTimers();
    renderHost();
    act(() => { toast.success("done"); });
    expect(screen.queryByText("done")).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(4100); });
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  test("同 dedupeKey 2s 内只保留一条", () => {
    renderHost();
    act(() => {
      toast.error("boom");
      toast.error("boom");
    });
    expect(screen.getAllByText("boom")).toHaveLength(1);
  });
});
