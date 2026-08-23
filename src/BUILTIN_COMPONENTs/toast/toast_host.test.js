import { render, screen, act, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ToastHost from "./toast_host";
import { Z } from "../layer/z_layers";
import { toast } from "../../SERVICEs/toast";
import { _resetForTest } from "../../SERVICEs/toast_bus";

function renderHost() {
  return render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <ToastHost />
    </ConfigContext.Provider>
  );
}

const flushIconUpdates = () => act(async () => {
  await Promise.resolve();
});

describe("ToastHost", () => {
  beforeEach(() => _resetForTest());

  test("显示 success toast", async () => {
    renderHost();
    act(() => { toast.success("done"); });
    await flushIconUpdates();
    expect(screen.getByText("done")).toBeInTheDocument();
  });

  test("4s 后播放退场动画并移除", async () => {
    jest.useFakeTimers();
    renderHost();
    act(() => { toast.success("done"); });
    await flushIconUpdates();
    expect(screen.queryByText("done")).toBeInTheDocument();
    /* duration elapses → leaving (still mounted for the exit animation) */
    act(() => { jest.advanceTimersByTime(4100); });
    expect(screen.queryByText("done")).toBeInTheDocument();
    /* exit animation done → unmounted */
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  test("同 dedupeKey 2s 内只保留一条", async () => {
    renderHost();
    act(() => {
      toast.error("boom");
      toast.error("boom");
    });
    await flushIconUpdates();
    expect(screen.getAllByText("boom")).toHaveLength(1);
  });

  test("success toast 也默认进顶部同一个 stack", async () => {
    renderHost();
    act(() => {
      toast.success("saved");
      toast.error("boom");
    });
    await flushIconUpdates();
    const pile = screen.getByTestId("toast-pile-top");
    expect(pile).toHaveTextContent("saved");
    expect(pile).toHaveTextContent("boom");
    expect(screen.queryByTestId("toast-pile-bottom-right")).toBeNull();
  });

  test("pile 默认折叠成 sonner 式堆叠,最新的卡在最前", async () => {
    renderHost();
    act(() => {
      toast.info("first");
      toast.info("second");
      toast.info("third");
    });
    await flushIconUpdates();

    const wrapperOf = (text) =>
      screen.getByText(text).closest("[data-toast-slot]");
    /* newest = front: no offset, full scale */
    expect(wrapperOf("third").style.transform).toBe(
      "translateY(0px) scale(1)",
    );
    /* older cards peek out behind with PEEK offsets and scale steps */
    expect(wrapperOf("second").style.transform).toBe(
      "translateY(12px) scale(0.95)",
    );
    expect(wrapperOf("first").style.transform).toBe(
      "translateY(24px) scale(0.9)",
    );
    /* depth never dims cards — same opacity collapsed as expanded */
    expect(wrapperOf("third").style.opacity).toBe("1");
    expect(wrapperOf("second").style.opacity).toBe("1");
    expect(wrapperOf("first").style.opacity).toBe("1");
  });

  test("hover 展开堆叠,离开后重新折叠", async () => {
    renderHost();
    act(() => {
      toast.info("first");
      toast.info("second");
      toast.info("third");
    });
    await flushIconUpdates();

    const pile = screen.getByTestId("toast-pile-top");
    const wrapperOf = (text) =>
      screen.getByText(text).closest("[data-toast-slot]");

    act(() => { fireEvent.mouseEnter(pile); });
    /* expanded: cumulative measured heights (fallback 56) + 10 gap */
    expect(wrapperOf("third").style.transform).toBe(
      "translateY(0px) scale(1)",
    );
    expect(wrapperOf("second").style.transform).toBe(
      "translateY(66px) scale(1)",
    );
    expect(wrapperOf("first").style.transform).toBe(
      "translateY(132px) scale(1)",
    );

    act(() => { fireEvent.mouseLeave(pile); });
    expect(wrapperOf("first").style.transform).toBe(
      "translateY(24px) scale(0.9)",
    );
  });

  test("hover 期间暂停自动消失,离开后按剩余时间恢复", async () => {
    jest.useFakeTimers();
    renderHost();
    act(() => { toast.success("paused"); });
    await flushIconUpdates();

    const pile = screen.getByTestId("toast-pile-top");
    act(() => { fireEvent.mouseEnter(pile); });
    act(() => { jest.advanceTimersByTime(10000); });
    expect(screen.queryByText("paused")).toBeInTheDocument();

    act(() => { fireEvent.mouseLeave(pile); });
    act(() => { jest.advanceTimersByTime(4400); });
    expect(screen.queryByText("paused")).not.toBeInTheDocument();
    jest.useRealTimers();
  });

  test("error toast 默认显示在中央顶部并保持到用户关闭", async () => {
    jest.useFakeTimers();
    renderHost();
    act(() => { toast.error("boom"); });
    await flushIconUpdates();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("boom");
    expect(screen.getByTestId("toast-pile-top")).toContainElement(alert);
    act(() => { jest.advanceTimersByTime(4100); });
    expect(screen.getByText("boom")).toBeInTheDocument();
    jest.useRealTimers();
  });

  test("pile 必须画在 modal 之上 —— modal 内触发的提示不能看不见", async () => {
    renderHost();
    act(() => { toast.success("saved"); });
    await flushIconUpdates();
    const pile = screen.getByTestId("toast-pile-top");
    expect(Number(pile.style.zIndex)).toBe(Z.TOAST);
    expect(Number(pile.style.zIndex)).toBeGreaterThan(Z.MODAL);
  });
});
