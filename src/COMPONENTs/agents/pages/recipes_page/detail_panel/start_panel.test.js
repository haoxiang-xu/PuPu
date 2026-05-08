import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartPanel from "./start_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

describe("StartPanel", () => {
  test("renders default outputs", () => {
    const node = {
      id: "start",
      type: "start",
      outputs: [
        { name: "text", type: "string" },
        { name: "images", type: "image[]" },
      ],
    };
    render(
      wrap(
        <StartPanel
          node={node}
          recipe={{ nodes: [node], edges: [] }}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.getByDisplayValue("text")).toBeInTheDocument();
    expect(screen.getByDisplayValue("images")).toBeInTheDocument();
  });

  test("+ Add output appends a new row", () => {
    const node = { id: "start", type: "start", outputs: [] };
    const onChange = jest.fn();
    render(
      wrap(
        <StartPanel
          node={node}
          recipe={{ nodes: [node], edges: [] }}
          onChange={onChange}
        />,
      ),
    );
    fireEvent.click(screen.getByText("+ Add output"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes: [
          expect.objectContaining({
            outputs: [expect.objectContaining({ name: "" })],
          }),
        ],
      }),
    );
  });
});
