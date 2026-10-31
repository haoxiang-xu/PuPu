import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import MissingPolicySelect from "./missing_policy_select";
import { binding_problems, ref_expression } from "../skeleton_io";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const ref = ref_expression("start", ["text"]);

const show = (binding, onChange = () => {}) =>
  render(
    <ConfigContext.Provider value={cfg}>
      <MissingPolicySelect binding={binding} onChange={onChange} />
    </ConfigContext.Provider>,
  );

describe("the control names a behaviour, not a type", () => {
  test("no label claims anything about what the value may be", () => {
    const { container } = show({ name: "t", value: ref, missing: "error" });
    /* "Required" and "Nullable" would say the value cannot be absent or can be
     * null. Neither is what the policy means. */
    expect(container.textContent).not.toMatch(/required|nullable|optional/i);
    expect(container.textContent).toMatch(/if missing/i);
  });

  test("each policy explains when it applies", () => {
    show({ name: "t", value: ref, missing: "default", default: "x" });
    expect(screen.getByTestId("missing-policy-description").textContent).toMatch(
      /only when nothing arrives/i,
    );
  });

  test("the null policy promises null rather than an empty string", () => {
    show({ name: "t", value: ref, missing: "null" });
    expect(screen.getByTestId("missing-policy-description").textContent).toMatch(
      /never an empty string/i,
    );
  });
});

describe("the default field belongs to the default policy alone", () => {
  test("it is offered only for that policy", () => {
    const { container, rerender } = show({ name: "t", value: ref, missing: "error" });
    expect(screen.queryByPlaceholderText(/substituted only when/i)).toBeNull();
    rerender(
      <ConfigContext.Provider value={cfg}>
        <MissingPolicySelect
          binding={{ name: "t", value: ref, missing: "default", default: "x" }}
          onChange={() => {}}
        />
      </ConfigContext.Provider>,
    );
    expect(screen.getByPlaceholderText(/substituted only when/i)).toBeInTheDocument();
    expect(container).toBeTruthy();
  });

  test("editing the default emits a binding the runtime would accept", () => {
    const onChange = jest.fn();
    show({ name: "t", value: ref, missing: "default", default: "old" }, onChange);
    fireEvent.change(screen.getByPlaceholderText(/substituted only when/i), {
      target: { value: "new" },
    });
    const emitted = onChange.mock.calls[0][0];
    expect(emitted.default).toBe("new");
    expect(binding_problems([emitted])).toEqual([]);
  });
});

describe("stored JSON defaults stay values until the author replaces them", () => {
  test.each([
    ["object with an unreadable primitive conversion", { toString: null }, '{"toString":null}'],
    ["nested object", { nested: { valueOf: null }, enabled: false }, '{"nested":{"valueOf":null},"enabled":false}'],
    ["array", ["first", { toString: null }], '["first",{"toString":null}]'],
    ["null", null, "null"],
    ["false", false, "false"],
    ["zero", 0, "0"],
  ])("opening a %s default shows its JSON and writes nothing", (_name, stored, text) => {
    const onChange = jest.fn();
    const binding = { name: "t", value: ref, missing: "default", default: stored };
    const before = JSON.stringify(binding);

    expect(() => show(binding, onChange)).not.toThrow();

    expect(screen.getByTestId("stored-json-default")).toHaveTextContent(text);
    expect(screen.getByPlaceholderText(/enter text to replace the stored JSON/i)).toHaveValue("");
    expect(onChange).not.toHaveBeenCalled();
    expect(JSON.stringify(binding)).toBe(before);
    expect(binding.default).toBe(stored);
  });

  test("typing replaces the default explicitly without rebuilding the input or changing its source", () => {
    const stored = { toString: null, count: 2 };
    const initial = { name: "t", value: ref, missing: "default", default: stored };
    const changes = jest.fn();
    function ControlledDefault() {
      const [binding, setBinding] = useState(initial);
      return (
        <ConfigContext.Provider value={cfg}>
          <MissingPolicySelect binding={binding} onChange={(next) => { changes(next); setBinding(next); }} />
        </ConfigContext.Provider>
      );
    }
    render(<ControlledDefault />);
    const input = screen.getByPlaceholderText(/enter text to replace the stored JSON/i);
    input.focus();
    expect(changes).not.toHaveBeenCalled();

    for (const text of ["n", "ne", "new"]) {
      fireEvent.change(input, { target: { value: text } });
      expect(screen.getByPlaceholderText(/substituted only when/i)).toBe(input);
      expect(input).toHaveFocus();
      expect(input).toHaveValue(text);
      expect(input.selectionStart).toBe(text.length);
    }

    expect(changes).toHaveBeenCalledTimes(3);
    const emitted = changes.mock.calls[2][0];
    expect(emitted).toEqual({ name: "t", value: ref, missing: "default", default: "new" });
    expect(emitted.value).toBe(ref);
    expect(initial.default).toBe(stored);
    expect(screen.queryByTestId("stored-json-default")).toBeNull();
  });

  test("non-default policies never inspect or display a retained JSON default", () => {
    const onChange = jest.fn();
    show({ name: "t", value: ref, missing: "error", default: { toString: null } }, onChange);
    expect(screen.queryByTestId("stored-json-default")).toBeNull();
    expect(screen.queryByPlaceholderText(/replace the stored JSON|substituted only when/i)).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
