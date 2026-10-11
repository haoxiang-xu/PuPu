import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import PathEditor, { path_segment_kind } from "./path_editor";

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

function show(props) {
  const onChange = jest.fn();
  const view = render(
    <PathEditor path={[]} testid="p" onChange={onChange} {...props} />,
  );
  return { onChange, view };
}

/* `_read_path` follows a string only into an object and an integer only into
 * an array, so the two kinds of step are not interchangeable and the editor
 * cannot decide between them by looking at the text. */
describe("a step says whether it is a field name or a list position", () => {
  test("a field name is stored as a string", () => {
    const { onChange } = show({ path: ["items"] });
    fireEvent.change(screen.getByPlaceholderText("field"), {
      target: { value: "rows" },
    });
    expect(onChange).toHaveBeenCalledWith(["rows"]);
  });

  test("a list position is stored as a number, never the text of one", () => {
    const { onChange } = show({ path: [0] });
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "2" },
    });
    expect(onChange).toHaveBeenCalledWith([2]);
    expect(typeof onChange.mock.calls[0][0][0]).toBe("number");
  });

  test("switching a field name to a position changes the stored type", () => {
    const { onChange } = show({ path: ["items"] });
    fireEvent.click(screen.getByLabelText(/switch to a list position/i));
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  test("switching a position to a field name changes it back", () => {
    const { onChange } = show({ path: [3] });
    fireEvent.click(screen.getByLabelText(/switch to a field name/i));
    expect(onChange).toHaveBeenCalledWith([""]);
  });

  test("a field name that looks numeric stays a field name", () => {
    /* The implicit rule would make a key named "0" unreachable, and silently. */
    const { onChange } = show({ path: ["a"] });
    fireEvent.change(screen.getByPlaceholderText("field"), {
      target: { value: "0" },
    });
    expect(onChange).toHaveBeenCalledWith(["0"]);
  });

  test("a position box takes digits only", () => {
    const { onChange } = show({ path: [0] });
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "1x2" },
    });
    expect(onChange).toHaveBeenCalledWith([12]);
  });

  test("an emptied position box is zero, not NaN", () => {
    const { onChange } = show({ path: [4] });
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenCalledWith([0]);
  });

  test("path_segment_kind reads the stored type, not the text", () => {
    expect(path_segment_kind(0)).toBe("index");
    expect(path_segment_kind("0")).toBe("key");
  });
});

describe("adding and removing steps", () => {
  test("a new step starts as a field name", () => {
    const { onChange } = show({ path: ["a"] });
    fireEvent.click(screen.getByText("+ Add a step"));
    expect(onChange).toHaveBeenCalledWith(["a", ""]);
  });

  test("removing a step takes out that one", () => {
    const { onChange } = show({ path: ["a", 1, "c"] });
    fireEvent.click(screen.getByLabelText("Remove step 2"));
    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  test("an empty path says it exports the whole value", () => {
    show({ path: [] });
    expect(screen.getByTestId("p-whole")).toBeInTheDocument();
  });

  test("a path that is not an array does not throw", () => {
    /* A draft can hold anything; the row above decides whether to render this
       at all, but it must not be the thing that crashes. */
    expect(() => show({ path: "nope" })).not.toThrow();
  });
});

describe("a leading step the caller renders itself", () => {
  test("the picked first step is not also offered as an editable step", () => {
    show({
      path: ["answer", "text"],
      leading: <span data-testid="picked">answer</span>,
    });
    expect(screen.getByTestId("picked")).toBeInTheDocument();
    const steps = screen.getAllByTestId(/^p-step-\d+$/);
    expect(steps).toHaveLength(1);
    expect(within(steps[0]).getByPlaceholderText("field").value).toBe("text");
  });

  test("editing a step below the leading one keeps the leading one", () => {
    const onChange = jest.fn();
    render(
      <PathEditor
        path={["answer", "text"]}
        testid="p"
        onChange={onChange}
        leading={<span>answer</span>}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("field"), {
      target: { value: "body" },
    });
    expect(onChange).toHaveBeenCalledWith(["answer", "body"]);
  });

  test("removing a step below the leading one keeps the leading one", () => {
    const onChange = jest.fn();
    render(
      <PathEditor
        path={["answer", "text", 0]}
        testid="p"
        onChange={onChange}
        leading={<span>answer</span>}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove step 1"));
    expect(onChange).toHaveBeenCalledWith(["answer", 0]);
  });
});
