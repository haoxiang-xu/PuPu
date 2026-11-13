import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import BindingRow from "./binding_row";
import OutputRow from "./output_row";

jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => function TestIcon() { return null; });

const sources = [
  { node_id: "start", node_label: "Start", name: "message" },
  { node_id: "start", node_label: "Start", name: "files" },
];
const binding = { name: "question", value: { kind: "ref", node_id: "start", path: ["message"] }, missing: "default", default: { count: 2 } };
const mapping = { name: "answer", source: { kind: "result", path: ["context", "items", 0] } };

function show(children, dark = false) {
  return render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: dark ? "dark_mode" : "light_mode" }}>{children}</ConfigContext.Provider>);
}
function input(extra = {}) {
  return <BindingRow binding={binding} index={0} sources={sources} onChange={jest.fn()} onRemove={jest.fn()} {...extra} />;
}
function output(extra = {}) {
  return <OutputRow mapping={mapping} index={0} identity="output-a" nodeType="agent" kinds={["input", "result"]}
    inputNames={["question"]} resultRoots={{ known: true, closed: true, roots: ["message", "context"] }}
    onChange={jest.fn()} onRemove={jest.fn()} {...extra} />;
}

test.each([false, true])("input starts as name, source and more, without a card or settings (dark=%s)", (dark) => {
  const write = jest.fn();
  show(input({ onChange: write, isDark: dark, problems: [{ message: "A binding problem" }] }), dark);
  expect(screen.getByDisplayValue("question")).toBeVisible();
  expect(screen.getByText("Start · message")).toBeVisible();
  expect(screen.getByRole("button", { name: "question · More" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByTestId("binding-row-0-settings")).not.toBeVisible();
  expect(screen.getByText("A binding problem")).toBeVisible();
  expect(screen.getByTestId("binding-row-0").style.background).toBe("");
  expect(write).not.toHaveBeenCalled();
});

test("input settings open and close without writes; default and removal remain explicit", () => {
  const write = jest.fn(); const remove = jest.fn();
  show(input({ onChange: write, onRemove: remove }));
  const more = screen.getByRole("button", { name: "question · More" });
  fireEvent.click(more);
  expect(screen.getByTestId("stored-json-default")).toBeVisible();
  expect(screen.getByText("If missing")).toBeVisible();
  expect(write).not.toHaveBeenCalled();
  fireEvent.click(more);
  expect(screen.getByTestId("stored-json-default")).not.toBeVisible();
  fireEvent.click(more);
  fireEvent.click(screen.getByRole("button", { name: "Remove question" }));
  expect(remove).toHaveBeenCalledTimes(1);
  expect(write).not.toHaveBeenCalled();
});

test("an input source can be changed directly and keeps its missing policy and JSON default", async () => {
  const write = jest.fn();
  show(input({ onChange: write }));
  const trigger = within(screen.getByTestId("binding-row-0-source")).getByRole("combobox");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(await screen.findByText("Start · files"));
  expect(write).toHaveBeenCalledWith({ ...binding, value: { kind: "ref", node_id: "start", path: ["files"] } });
});

test.each([false, true])("output displays the full source on one line; deeper settings are tucked away (dark=%s)", (dark) => {
  const write = jest.fn();
  show(output({ onChange: write, isDark: dark, problems: [{ message: "An output problem" }] }), dark);
  expect(screen.getByDisplayValue("answer")).toBeVisible();
  expect(screen.getByText("Result.context.items[0]")).toBeVisible();
  expect(screen.getByTestId("output-row-0-settings")).not.toBeVisible();
  expect(screen.getByText("An output problem")).toBeVisible();
  expect(write).not.toHaveBeenCalled();
});

test("closing output settings preserves a partially typed invalid index", () => {
  function Controlled() {
    const [value, setValue] = useState(mapping);
    return output({ mapping: value, onChange: setValue });
  }
  show(<Controlled />);
  const more = screen.getByRole("button", { name: "answer · More" });
  fireEvent.click(more);
  const index = screen.getByDisplayValue("0");
  fireEvent.change(index, { target: { value: "1.5" } });
  fireEvent.click(more);
  fireEvent.click(more);
  expect(screen.getByDisplayValue("1.5")).toBe(index);
  expect(screen.getByTestId("output-row-0-step-1-refused")).toBeVisible();
});

test("choosing another output root directly retains the rest of the path", async () => {
  const write = jest.fn();
  show(output({ onChange: write }));
  const trigger = within(screen.getByTestId("output-row-0-source")).getByRole("combobox");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(await screen.findByText("message"));
  expect(write).toHaveBeenCalledWith({ ...mapping, source: { kind: "result", path: ["message", "items", 0] } });
});


test.each([false, true])("expanded input settings form an aligned group (dark=%s)", (dark) => {
  show(input({ isDark: dark }), dark);
  fireEvent.click(screen.getByRole("button", { name: "question · More" }));
  const surface = screen.getByTestId("binding-row-0-settings-surface");
  /* The settings sit on the panel itself: no card, no outline. */
  expect(surface.style.borderWidth).not.toBe("1px");
  expect(within(surface).getByText("Source")).toBeVisible();
  expect(within(surface).getByText("Source").style.width).toBe(within(surface).getByText("If missing").style.width);
  expect(within(surface).getAllByRole("combobox").every(control => control.style.justifyContent === "flex-end")).toBe(true);
  const footer = screen.getByTestId("binding-row-0-settings-footer");
  expect(within(footer).getByRole("button", { name: "Remove question" })).toBeVisible();
});

test.each([input, output])("settings animate height and fade, and become inert when closed (%#)", (row) => {
  show(row());
  const prefix = row === input ? "binding" : "output";
  const owner = row === input ? "question" : "answer";
  const settings = screen.getByTestId(`${prefix}-row-0-settings`);
  const more = screen.getByRole("button", { name: `${owner} · More` });
  expect(settings).toHaveAttribute("inert");
  expect(settings.style.gridTemplateRows).toBe("0fr");
  fireEvent.click(more);
  expect(settings.style.gridTemplateRows).toBe("1fr");
  expect(settings.style.transition).toContain("grid-template-rows");
  expect(settings.style.transition).toContain("opacity");
  expect(settings).not.toHaveAttribute("inert");
  expect(settings).not.toHaveAttribute("hidden");
  fireEvent.click(more);
  expect(settings.style.gridTemplateRows).toBe("0fr");
  expect(settings).toHaveAttribute("inert");
  expect(settings).toHaveAttribute("aria-hidden", "true");
});

test("output path controls and deletion are separate groups inside its background", () => {
  show(output());
  fireEvent.click(screen.getByRole("button", { name: "answer · More" }));
  const surface = screen.getByTestId("output-row-0-settings-surface");
  expect(within(surface).getByText("Source")).toBeVisible();
  expect(within(surface).getByText("Path")).toBeVisible();
  expect(within(surface).getByDisplayValue("items")).toBeVisible();
  expect(within(screen.getByTestId("output-row-0-settings-footer")).getByRole("button", { name: "Remove answer" })).toBeVisible();
});

test("reduced-motion preference disables the disclosure animation", () => {
  const previous = window.matchMedia;
  window.matchMedia = jest.fn(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  try {
    show(input());
    fireEvent.click(screen.getByRole("button", { name: "question · More" }));
    expect(screen.getByTestId("binding-row-0-settings").style.transition).toBe("none");
  } finally {
    window.matchMedia = previous;
  }
});
