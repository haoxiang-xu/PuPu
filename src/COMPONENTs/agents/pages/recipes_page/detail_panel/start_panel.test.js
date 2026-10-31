import React from "react";
import { render, fireEvent, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartPanel from "./start_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const show = (outputs, onChange = () => {}) => {
  const node = { id: "start", type: "start", outputs };
  return render(
    wrap(
      <StartPanel
        node={node}
        recipe={{ nodes: [node], edges: [] }}
        onChange={onChange}
      />,
    ),
  );
};

const outputsFrom = (onChange) => onChange.mock.calls[0][0].nodes[0].outputs;

describe("StartPanel inputs are fixed by the entry", () => {
  test("the three chat fields are shown and cannot be edited or added to", () => {
    const { container } = show([]);
    ["text", "images", "files"].forEach((name) => {
      expect(
        container.querySelector(`[data-testid="start-input-${name}"]`),
      ).toBeTruthy();
    });
    /* The only Add button on the panel belongs to the outputs section — the
     * inputs section offers no way to add or rename anything. */
    const buttons = container.querySelectorAll("button");
    expect([...buttons].filter((b) => /add/i.test(b.textContent))).toHaveLength(
      1,
    );
    expect(screen.getByText("+ Add output")).toBeInTheDocument();
    expect(
      screen.getByText(/cannot be added to or renamed/i),
    ).toBeInTheDocument();
    /* Nothing in the inputs section is an editable control. */
    ["text", "images", "files"].forEach((name) => {
      const row = container.querySelector(
        `[data-testid="start-input-${name}"]`,
      );
      expect(row.querySelector("input, select, button")).toBeNull();
    });
  });
});

describe("StartPanel outputs are picked, never typed", () => {
  test("an output row is a picker, not a free text box", () => {
    const { container } = show([{ name: "text", type: "string" }]);
    /* The old row was a type dropdown beside a text input, which let an author
     * name an output something the runtime never fills. */
    expect(container.querySelectorAll("input[type='text']")).toHaveLength(0);
    expect(screen.queryByDisplayValue("text")).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="start-output-row-0"]'),
    ).toBeTruthy();
  });

  test("the type comes with the source instead of being chosen", () => {
    const { container } = show([{ name: "images", type: "image[]" }]);
    const row = container.querySelector('[data-testid="start-output-row-0"]');
    expect(within(row).getByText("image[]")).toBeInTheDocument();
  });

  test("Add exports the next unused source, with that source's type", () => {
    const onChange = jest.fn();
    show([{ name: "text", type: "string" }], onChange);
    fireEvent.click(screen.getByText("+ Add output"));
    expect(outputsFrom(onChange)).toEqual([
      { name: "text", type: "string" },
      { name: "images", type: "image[]" },
    ]);
  });

  test("Add is disabled once every source is exported", () => {
    show([
      { name: "text", type: "string" },
      { name: "images", type: "image[]" },
      { name: "files", type: "file[]" },
    ]);
    expect(screen.getByText("+ Add output").closest("button")).toBeDisabled();
  });

  test("removing a row frees its source again", () => {
    const onChange = jest.fn();
    show(
      [
        { name: "text", type: "string" },
        { name: "images", type: "image[]" },
        { name: "files", type: "file[]" },
      ],
      onChange,
    );
    expect(screen.getByText("+ Add output").closest("button")).toBeDisabled();
  });

  test("empty state says so rather than showing a blank row", () => {
    show([]);
    expect(screen.getByText(/nothing exported yet/i)).toBeInTheDocument();
  });
});

describe("StartPanel does not silently drop what it cannot produce", () => {
  test("a row naming something Start never produces is kept and marked", () => {
    const { container } = show([
      { name: "answer", type: "string" },
      { name: "text", type: "string" },
    ]);
    const bad = container.querySelector(
      '[data-testid="start-output-invalid-0"]',
    );
    expect(bad).toBeTruthy();
    expect(bad.textContent).toMatch(/answer/);
    expect(bad.textContent).toMatch(/not produced here/i);
    /* The valid row beside it still renders as a picker. */
    expect(
      container.querySelector('[data-testid="start-output-row-1"]'),
    ).toBeTruthy();
  });

  test("an invalid row can still be removed", () => {
    const onChange = jest.fn();
    const { container } = show([{ name: "answer", type: "string" }], onChange);
    const row = container.querySelector('[data-testid="start-output-row-0"]');
    fireEvent.click(within(row).getByRole("button"));
    expect(outputsFrom(onChange)).toEqual([]);
  });
});
