import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import VariablePicker from "./variable_picker";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const scope = [
  { node_id: "start", field: "text", type: "string", source_type: "start" },
  { node_id: "start", field: "images", type: "image[]", source_type: "start" },
  { node_id: "a1", field: "output", type: "string", source_type: "agent" },
];

describe("VariablePicker", () => {
  test("renders variables grouped by node_id", () => {
    render(
      wrap(<VariablePicker scope={scope} onPick={() => {}} onClose={() => {}} />),
    );
    expect(screen.getByText("start.text")).toBeInTheDocument();
    expect(screen.getByText("a1.output")).toBeInTheDocument();
  });

  test("filters by search input", () => {
    render(
      wrap(<VariablePicker scope={scope} onPick={() => {}} onClose={() => {}} />),
    );
    const search = screen.getByPlaceholderText(/search/i);
    fireEvent.change(search, { target: { value: "imag" } });
    expect(screen.queryByText("start.text")).toBeNull();
    expect(screen.getByText("start.images")).toBeInTheDocument();
  });

  test("calls onPick when a row is clicked", () => {
    const onPick = jest.fn();
    render(
      wrap(<VariablePicker scope={scope} onPick={onPick} onClose={() => {}} />),
    );
    fireEvent.click(screen.getByText("start.text"));
    expect(onPick).toHaveBeenCalledWith(scope[0]);
  });

  test("calls onClose when Escape is pressed", () => {
    const onClose = jest.fn();
    render(
      wrap(<VariablePicker scope={scope} onPick={() => {}} onClose={onClose} />),
    );
    fireEvent.keyDown(screen.getByPlaceholderText(/search/i), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
