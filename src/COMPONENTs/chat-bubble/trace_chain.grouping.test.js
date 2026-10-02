import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const observedSequentialFrames = require("../../../docs/implementation/ticket-383-evidence/observed-sequential.legacy-frames.json");

describe("TraceChain consecutive tool grouping", () => {
  test("groups the real sequential legacy calls without hiding either observation", () => {
    render(
      <ConfigContext.Provider
        value={{
          theme: { color: "#222", font: { fontFamily: "sans-serif" } },
          onThemeMode: "light_mode",
        }}
      >
        <TraceChain frames={observedSequentialFrames} status="done" />
      </ConfigContext.Provider>,
    );

    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getAllByText("Observation")).toHaveLength(2);

    screen.getAllByRole("button").forEach((button) => {
      if (button.textContent.trim() === "detail") {
        fireEvent.click(button);
      }
    });

    expect(screen.getAllByText("Fixture output reviewed safely")).toHaveLength(2);
    expect(screen.getByText("fixture-1.txt")).toBeInTheDocument();
    expect(screen.getByText("fixture-2.txt")).toBeInTheDocument();
  });
});
