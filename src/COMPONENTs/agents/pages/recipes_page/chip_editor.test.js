import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import ChipEditor from "./chip_editor";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const scope = [
  { node_id: "start", field: "text", type: "string", source_type: "start" },
];

describe("ChipEditor", () => {
  test("renders chips from value string", () => {
    const { container } = render(
      wrap(
        <ChipEditor
          value="Hi {{#start.text#}}!"
          onChange={() => {}}
          scope={scope}
        />,
      ),
    );
    const chip = container.querySelector('[data-var-chip="start.text"]');
    expect(chip).toBeTruthy();
  });

  test("Insert-variable button opens picker", () => {
    render(wrap(<ChipEditor value="" onChange={() => {}} scope={scope} />));
    fireEvent.click(screen.getByText("+ Insert variable"));
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  test("picking a variable fires onChange with serialized chip string", () => {
    const onChange = jest.fn();
    render(wrap(<ChipEditor value="" onChange={onChange} scope={scope} />));
    fireEvent.click(screen.getByText("+ Insert variable"));
    fireEvent.click(screen.getByText("start.text"));
    expect(onChange).toHaveBeenCalledWith(
      expect.stringContaining("{{#start.text#}}"),
    );
  });
});
