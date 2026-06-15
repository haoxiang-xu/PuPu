// src/BUILTIN_COMPONENTs/color_picker/color_picker.test.js
import { fireEvent, render, screen } from "@testing-library/react";
import ColorPicker, { normalizeHex } from "./color_picker";

describe("normalizeHex", () => {
  test("accepts #rrggbb lowercased", () => {
    expect(normalizeHex("#65C466")).toBe("#65c466");
  });
  test("expands #rgb", () => {
    expect(normalizeHex("#fff")).toBe("#ffffff");
  });
  test("adds leading #", () => {
    expect(normalizeHex("222222")).toBe("#222222");
  });
  test("returns null for invalid", () => {
    expect(normalizeHex("xyz")).toBeNull();
  });
});

describe("ColorPicker", () => {
  test("shows the current value and opens on click", () => {
    render(<ColorPicker label="Accent" value="#65c466" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    expect(screen.getByDisplayValue("#65c466")).toBeInTheDocument();
  });

  test("calls onChange with normalized hex on valid hex entry", () => {
    const onChange = jest.fn();
    render(<ColorPicker label="Accent" value="#65c466" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    const input = screen.getByDisplayValue("#65c466");
    fireEvent.change(input, { target: { value: "#abcdef" } });
    expect(onChange).toHaveBeenCalledWith("#abcdef");
  });

  test("does not call onChange on invalid hex", () => {
    const onChange = jest.fn();
    render(<ColorPicker label="Accent" value="#65c466" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    const input = screen.getByDisplayValue("#65c466");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
