import { render } from "@testing-library/react";
import { BarChart } from "./bar_chart";

describe("BarChart", () => {
  test("scroll area uses the builtin custom scrollbar (scrollable class)", () => {
    const data = Array.from({ length: 8 }, (_, index) => ({
      label: `d${index}`,
      value: index + 1,
    }));

    const { getByTestId } = render(<BarChart data={data} minBarWidth={40} />);

    const scrollArea = getByTestId("bar-chart-scroll-area");
    expect(scrollArea).toHaveClass("scrollable");
    expect(scrollArea).toHaveStyle("overflow-x: auto");
  });
});
