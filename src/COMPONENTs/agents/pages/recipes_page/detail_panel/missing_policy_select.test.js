import React from "react";
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
