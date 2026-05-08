import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import SpinnerButton from "./spinner_button";

function renderBtn(props) {
  return render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <SpinnerButton {...props}>Send</SpinnerButton>
    </ConfigContext.Provider>
  );
}

describe("SpinnerButton", () => {
  test("pending=false 显示 children 文字", () => {
    renderBtn({ pending: false, onClick: () => {} });
    expect(screen.getByText("Send")).toBeInTheDocument();
  });

  test("pending=true 不显示 children 文字", () => {
    renderBtn({ pending: true, onClick: () => {} });
    expect(screen.queryByText("Send")).not.toBeInTheDocument();
  });

  test("pending=true 时 onClick 被 swallow", () => {
    const onClick = jest.fn();
    renderBtn({ pending: true, onClick });
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("disabled=true 时 onClick 被 swallow", () => {
    const onClick = jest.fn();
    renderBtn({ disabled: true, onClick });
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  test("onClick 返回 Promise 时自动 pending", async () => {
    let resolveFn;
    const onClick = () => new Promise((r) => { resolveFn = r; });
    renderBtn({ onClick });
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByText("Send")).not.toBeInTheDocument();
    await act(async () => { resolveFn(); });
    expect(screen.getByText("Send")).toBeInTheDocument();
  });
});
