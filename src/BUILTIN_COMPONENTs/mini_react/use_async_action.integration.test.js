import { render, screen, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ToastHost from "../toast/toast_host";
import useAsyncAction from "./use_async_action";
import { _resetForTest as resetToast } from "../../SERVICEs/toast_bus";
import { _resetForTest as resetProgress } from "../../SERVICEs/progress_bus";

function Harness({ fn }) {
  const { run, pending } = useAsyncAction(fn, { label: "任务", pendingDelayMs: 0 });
  return (
    <div>
      <button onClick={() => run()}>go</button>
      <span>pending:{pending ? "yes" : "no"}</span>
    </div>
  );
}

describe("useAsyncAction + ToastHost integration", () => {
  beforeEach(() => { resetToast(); resetProgress(); });

  test("失败时 toast 出现、pending 恢复 false", async () => {
    const fn = async () => { throw new Error("boom"); };
    render(
      <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
        <ToastHost />
        <Harness fn={fn} />
      </ConfigContext.Provider>
    );
    await act(async () => { screen.getByText("go").click(); });
    expect(screen.getByText(/任务.*boom/)).toBeInTheDocument();
    expect(screen.getByText("pending:no")).toBeInTheDocument();
  });
});
