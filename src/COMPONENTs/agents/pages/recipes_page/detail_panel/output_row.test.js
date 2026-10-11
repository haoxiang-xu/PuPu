import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import OutputRow from "./output_row";

jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => {
  return function MockSelect({ options, value, set_value }) {
    return (
      <select
        data-testid="select"
        data-value={value == null ? "" : String(value)}
        value={value || ""}
        onChange={(event) => set_value(event.target.value)}
      >
        {(options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => {
  return function MockInput({ value, set_value, placeholder }) {
    return (
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => set_value(event.target.value)}
      />
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, ariaLabel, onClick }) {
    return (
      <button type="button" aria-label={ariaLabel} onClick={onClick}>
        {label || ariaLabel || "button"}
      </button>
    );
  };
});

function show(mapping, extra = {}) {
  const onChange = jest.fn();
  const onRemove = jest.fn();
  render(
    <OutputRow
      mapping={mapping}
      index={0}
      nodeType="agent"
      kinds={["input", "result"]}
      inputNames={["question", "context"]}
      isDark={false}
      onChange={onChange}
      onRemove={onRemove}
      {...extra}
    />,
  );
  return { onChange, onRemove };
}

const mapping = (kind, path = []) => ({ name: "a", source: { kind, path } });

describe("switching which side the value comes from", () => {
  test("the path is cleared, because it described the other side's shape", () => {
    /* Carrying `["question"]` over to the result side leaves a row that looks
       configured and reads nothing. */
    const { onChange } = show(mapping("input", ["question"]));
    /* Two pickers are on an input-side row: the side, then its first step. */
    fireEvent.change(screen.getAllByTestId("select")[0], { target: { value: "result" } });
    expect(onChange).toHaveBeenCalledWith({
      name: "a",
      source: { kind: "result", path: [] },
    });
  });

  test("choosing the side it is already on changes nothing", () => {
    const { onChange } = show(mapping("result", ["message"]));
    fireEvent.change(screen.getAllByTestId("select")[0], { target: { value: "result" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("the row keeps the closed source shape, adding no fields", () => {
    const { onChange } = show(mapping("result", []));
    fireEvent.change(screen.getByPlaceholderText("name"), { target: { value: "b" } });
    expect(Object.keys(onChange.mock.calls[0][0])).toEqual(["name", "source"]);
    expect(Object.keys(onChange.mock.calls[0][0].source)).toEqual(["kind", "path"]);
  });
});

describe("the input side picks its first step", () => {
  test("the picker offers this node's own declared inputs", () => {
    show(mapping("input", ["question"]));
    const options = [...screen.getAllByTestId("select")[1].options].map((o) => o.value);
    expect(options).toEqual(["question", "context"]);
  });

  test("picking a different input keeps the deeper steps", () => {
    const { onChange } = show(mapping("input", ["question", "body", 0]));
    fireEvent.change(screen.getAllByTestId("select")[1], {
      target: { value: "context" },
    });
    expect(onChange).toHaveBeenCalledWith({
      name: "a",
      source: { kind: "input", path: ["context", "body", 0] },
    });
  });

  test("a node with no inputs says so instead of offering an empty picker", () => {
    show(mapping("input", []), { inputNames: [] });
    expect(screen.getByTestId("output-row-0-no-inputs")).toBeInTheDocument();
  });

  test("an integer first step does not pre-select a name it is not", () => {
    /* A list position is not an input name. Read through `data-value`, because
       jsdom snaps an unmatched <select> to its first option and would report
       the row as naming "question" whatever the component passed. */
    show(mapping("input", [0]));
    expect(screen.getAllByTestId("select")[1].getAttribute("data-value")).toBe("");
  });
});

describe("a single-sided node states the side instead of offering it", () => {
  test("a Start has no side picker", () => {
    show(mapping("result", ["text"]), { nodeType: "start", kinds: ["result"] });
    expect(screen.queryByTestId("select")).not.toBeInTheDocument();
    expect(screen.getByTestId("output-row-0-fixed-kind")).toBeInTheDocument();
  });

  test("an End has no side picker", () => {
    show(mapping("input", ["answer"]), {
      nodeType: "end",
      kinds: ["input"],
      inputNames: ["answer"],
    });
    expect(screen.queryByTestId("select")).toBeInTheDocument(); /* the first-step picker */
    expect(screen.getByTestId("output-row-0-fixed-kind")).toBeInTheDocument();
  });
});

describe("a source the editor cannot take apart", () => {
  /* Same discipline as an unreadable expression: every control here would
   * rewrite what the author never typed. */
  test.each([
    ["a path that is not an array", { name: "a", source: { kind: "input", path: "question" } }],
    ["a source that is not an object", { name: "a", source: "question" }],
    ["a kind nobody knows", { name: "a", source: { kind: "elsewhere", path: [] } }],
    ["a path holding an object", { name: "a", source: { kind: "input", path: [{}] } }],
    ["a negative position", { name: "a", source: { kind: "result", path: [-1] } }],
  ])("%s is shown as it is", (_label, bad) => {
    show(bad);
    expect(screen.getByTestId("output-row-0-unreadable")).toBeInTheDocument();
    expect(screen.queryByTestId("output-row-0-step-0")).not.toBeInTheDocument();
  });

  test("none of them throws", () => {
    expect(() => show({ name: "a" })).not.toThrow();
    expect(() => show(null)).not.toThrow();
  });

  test("the name can still be fixed on an unreadable row", () => {
    /* The name is the author's own and is independent of the source shape. */
    const { onChange } = show({ name: "", source: "nope" });
    fireEvent.change(screen.getByPlaceholderText("name"), { target: { value: "answer" } });
    expect(onChange.mock.calls[0][0].name).toBe("answer");
  });

  test("a path holding a string digit is readable, since the wire allows it", () => {
    show({ name: "a", source: { kind: "result", path: ["0"] } });
    expect(screen.queryByTestId("output-row-0-unreadable")).not.toBeInTheDocument();
  });
});

describe("problems", () => {
  test("each one is shown on the row", () => {
    show(mapping("result", []), {
      problems: [{ message: "first" }, { message: "second" }],
    });
    expect(screen.getByTestId("output-row-0-problem-0").textContent).toBe("first");
    expect(screen.getByTestId("output-row-0-problem-1").textContent).toBe("second");
  });

  test("removing the row is offered by name", () => {
    const { onRemove } = show(mapping("result", []));
    fireEvent.click(screen.getByLabelText("Remove a"));
    expect(onRemove).toHaveBeenCalled();
  });
});
