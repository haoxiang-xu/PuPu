import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ConfirmInteract from "./confirm_interact";

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
}));

const renderConfirm = (props = {}) =>
  render(
    <ConfigContext.Provider
      value={{ theme: {}, onThemeMode: "light_mode" }}
    >
      <ConfirmInteract onSubmit={jest.fn()} {...props} />
    </ConfigContext.Provider>,
  );

describe("ConfirmInteract", () => {
  test("hides Always allow when session approval is disabled", () => {
    renderConfirm({ allowSessionApproval: false });

    expect(
      screen.getByRole("button", { name: "Allow once" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Always allow" }),
    ).not.toBeInTheDocument();
  });

  test("ordinary confirmations still support session approval", () => {
    const onSubmit = jest.fn();
    renderConfirm({ onSubmit });

    fireEvent.click(screen.getByRole("button", { name: "Always allow" }));
    expect(onSubmit).toHaveBeenCalledWith({
      approved: true,
      scope: "session",
    });
  });
});
