import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Timeline from "./timeline";

const items = ["input", "model", "output"].map((name) => ({
  title: name,
  point: <span data-testid={`point-${name}`} />,
}));

test("configuration timelines can retain a point for every expandable section", () => {
  render(<ConfigContext.Provider value={{ theme: {} }}><Timeline items={items} show_all_points /></ConfigContext.Provider>);
  expect(screen.getByTestId("point-input")).toBeInTheDocument();
  expect(screen.getByTestId("point-model")).toBeInTheDocument();
  expect(screen.getByTestId("point-output")).toBeInTheDocument();
});

test("the default trace presentation still passes through inactive intermediate points", () => {
  render(<ConfigContext.Provider value={{ theme: {} }}><Timeline items={items} /></ConfigContext.Provider>);
  expect(screen.getByTestId("point-input")).toBeInTheDocument();
  expect(screen.queryByTestId("point-model")).not.toBeInTheDocument();
  expect(screen.getByTestId("point-output")).toBeInTheDocument();
});
