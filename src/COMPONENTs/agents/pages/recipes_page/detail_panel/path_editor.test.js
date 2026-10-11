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

  /* These two asserted the defect: they were written when the box stripped
     non-digits, and they pinned "1x2" becoming position 12 and an emptied box
     becoming position 0 as if those were the contract. Both are addresses the
     author never asked for. */
  test("a position box refuses text that is not a position", () => {
    const { onChange } = show({ path: [0] });
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "1x2" },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an emptied position box is not position zero", () => {
    const { onChange } = show({ path: [4] });
    fireEvent.change(screen.getByPlaceholderText("0"), {
      target: { value: "" },
    });
    expect(onChange).not.toHaveBeenCalled();
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

describe("a position the wire would refuse is not quietly turned into another one", () => {
  /* Stripping non-digits turned -1 into [1] and 1.5 into [15]: both are valid
   * addresses, neither is the one the author typed, and nothing said so. A
   * wrong address that reads an existing element is worse than a refused one. */
  test.each([
    ["a negative position", "-1"],
    ["a fractional position", "1.5"],
    ["an expression", "1+1"],
    ["a word", "first"],
    ["an exponent", "1e3"],
  ])("%s is not written to the document", (_label, typed) => {
    const { onChange } = show({ path: [7] });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: typed } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("what was typed stays on screen to be corrected", () => {
    show({ path: [7] });
    const box = screen.getByPlaceholderText("0");
    fireEvent.change(box, { target: { value: "-1" } });
    expect(box.value).toBe("-1");
  });

  test("it says why nothing was stored", () => {
    show({ path: [7] });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "-1" } });
    expect(screen.getByTestId("p-step-0-refused").textContent).toMatch(
      /whole number|0 or more/i,
    );
  });

  test("correcting it afterwards does store it", () => {
    const { onChange } = show({ path: [7] });
    const box = screen.getByPlaceholderText("0");
    fireEvent.change(box, { target: { value: "-1" } });
    fireEvent.change(box, { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith([2]);
  });

  test("a valid position is still stored as a number", () => {
    const { onChange } = show({ path: [7] });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith([12]);
    expect(typeof onChange.mock.calls[0][0][0]).toBe("number");
  });

  test("an emptied box stores nothing and waits", () => {
    /* Zero is a real address, not what an empty box means. */
    const { onChange } = show({ path: [7] });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("p-step-0-refused")).toBeInTheDocument();
  });

  test("switching the step to a field name clears the refusal", () => {
    show({ path: [7] });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "-1" } });
    fireEvent.click(screen.getByLabelText(/switch to a field name/i));
    expect(screen.queryByTestId("p-step-0-refused")).not.toBeInTheDocument();
  });

  test("a field name takes any text, including one that looks numeric", () => {
    const { onChange } = show({ path: ["a"] });
    fireEvent.change(screen.getByPlaceholderText("field"), { target: { value: "-1" } });
    expect(onChange).toHaveBeenCalledWith(["-1"]);
  });
});

describe("refused text describes the step it was typed into, and no other", () => {
  /* The draft lives in local state and local state in a list is keyed by
     position. Remove an earlier step and the successor slides into the same
     key: the box went on showing `-1` while the stored segment was `2`. The
     document was never wrong; the field's account of it was. */
  function Live({ initial, identity }) {
    const [path, setPath] = React.useState(initial);
    return (
      <PathEditor
        path={path}
        testid="p"
        identity={identity}
        onChange={setPath}
      />
    );
  }

  test("removing the step above shows the survivor's own position", () => {
    render(<Live initial={[0, 2]} />);
    const boxes = screen.getAllByPlaceholderText("0");
    fireEvent.change(boxes[0], { target: { value: "-1" } });
    expect(screen.getAllByPlaceholderText("0")[0].value).toBe("-1");

    fireEvent.click(screen.getByLabelText("Remove step 1"));
    expect(screen.getAllByPlaceholderText("0")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("0")[0].value).toBe("2");
    expect(screen.queryByTestId("p-step-0-refused")).not.toBeInTheDocument();
  });

  test("removing a step whose successor holds the same position", () => {
    /* The hard one. `[0, 0]`: the successor slides into the removed step's
       position *and* holds the removed step's value, so neither the position
       nor the value distinguishes them. Nothing about a segment in the
       document distinguishes them either — a path's steps are addressed by
       where they are. So the identity has to be made here and carried. */
    render(<Live initial={[0, 0]} />);
    fireEvent.change(screen.getAllByPlaceholderText("0")[0], {
      target: { value: "-1" },
    });
    expect(screen.getAllByPlaceholderText("0")[0].value).toBe("-1");

    fireEvent.click(screen.getByLabelText("Remove step 1"));
    expect(screen.getAllByPlaceholderText("0")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("0")[0].value).toBe("0");
    expect(screen.queryByTestId("p-step-0-refused")).not.toBeInTheDocument();
  });

  test("removing a later step leaves an earlier correction alone", () => {
    /* The other direction of the same edit: the step being corrected is not
       the one that moved, so it keeps what was typed into it. */
    render(<Live initial={[0, 0]} />);
    fireEvent.change(screen.getAllByPlaceholderText("0")[0], {
      target: { value: "-1" },
    });
    fireEvent.click(screen.getByLabelText("Remove step 2"));
    expect(screen.getAllByPlaceholderText("0")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("0")[0].value).toBe("-1");
    expect(screen.getByTestId("p-step-0-refused")).toBeInTheDocument();
  });

  test("the stored value changing under the step drops the correction", () => {
    /* Not a structural edit: the same step, in the same place, now holds a
       different number because the document was replaced beneath the panel —
       a conflict resolved the other way, or a reload landing. The text was
       typed against a value that is no longer there. */
    const view = render(
      <PathEditor path={[0]} testid="p" identity="row" onChange={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "-1" } });
    view.rerender(
      <PathEditor path={[5]} testid="p" identity="row" onChange={() => {}} />,
    );
    expect(screen.getByPlaceholderText("0").value).toBe("5");
    expect(screen.queryByTestId("p-step-0-refused")).not.toBeInTheDocument();
  });

  test("a value that changes away and back does not bring the correction back", () => {
    /* Hiding the text is not discarding it. While the stored value differed
       the box read correctly, but the text was still there — and when the
       value came back the text came back with it, over a value it had never
       described. A correction is void once the thing it was correcting is
       gone, and it does not become valid again by coincidence. */
    const step = (path) => (
      <PathEditor path={path} testid="p" identity="row" onChange={() => {}} />
    );
    const view = render(step([0]));
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "-1" } });
    expect(screen.getByPlaceholderText("0").value).toBe("-1");

    view.rerender(step([5]));
    expect(screen.getByPlaceholderText("0").value).toBe("5");

    view.rerender(step([0]));
    expect(screen.getByPlaceholderText("0").value).toBe("0");
    expect(screen.queryByTestId("p-step-0-refused")).not.toBeInTheDocument();
  });

  test("a step that belongs to something else does not inherit the text", () => {
    const view = render(
      <PathEditor path={[0]} testid="p" identity="rowA" onChange={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "-1" } });
    expect(screen.getByPlaceholderText("0").value).toBe("-1");

    view.rerender(
      <PathEditor path={[2]} testid="p" identity="rowB" onChange={() => {}} />,
    );
    expect(screen.getByPlaceholderText("0").value).toBe("2");
    expect(screen.queryByTestId("p-step-0-refused")).not.toBeInTheDocument();
  });

  test("the same identity and the same stored position keeps the text", () => {
    const view = render(
      <PathEditor path={[0]} testid="p" identity="rowA" onChange={() => {}} />,
    );
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "-1" } });
    view.rerender(
      <PathEditor path={[0]} testid="p" identity="rowA" onChange={() => {}} />,
    );
    expect(screen.getByPlaceholderText("0").value).toBe("-1");
    expect(screen.getByTestId("p-step-0-refused")).toBeInTheDocument();
  });

  test("adding a step below does not disturb the one being corrected", () => {
    render(<Live initial={[0]} />);
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "-1" } });
    fireEvent.click(screen.getByText("+ Add a step"));
    expect(screen.getByPlaceholderText("0").value).toBe("-1");
    expect(screen.getByTestId("p-step-0-refused")).toBeInTheDocument();
  });

  test("correcting it to a real position stores exactly that one", () => {
    render(<Live initial={[0, 2]} />);
    const box = screen.getAllByPlaceholderText("0")[0];
    fireEvent.change(box, { target: { value: "-1" } });
    fireEvent.change(screen.getAllByPlaceholderText("0")[0], {
      target: { value: "3" },
    });
    const boxes = screen.getAllByPlaceholderText("0");
    expect(boxes.map((b) => b.value)).toEqual(["3", "2"]);
    expect(screen.queryByTestId("p-step-0-refused")).not.toBeInTheDocument();
  });
});
