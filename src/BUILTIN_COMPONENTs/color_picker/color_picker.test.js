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

  test("previews valid hex entry without committing until blur", () => {
    const onPreview = jest.fn();
    const onCommit = jest.fn();
    render(
      <ColorPicker
        label="Accent"
        value="#65c466"
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    const input = screen.getByDisplayValue("#65c466");

    fireEvent.change(input, { target: { value: "#abcdef" } });
    expect(onPreview).toHaveBeenCalledWith("#abcdef");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith("#abcdef");
  });

  test("commits valid hex entry on Enter", () => {
    const onCommit = jest.fn();
    render(
      <ColorPicker label="Accent" value="#65c466" onCommit={onCommit} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    const input = screen.getByDisplayValue("#65c466");

    fireEvent.change(input, { target: { value: "#abcdef" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith("#abcdef");
  });

  test("native picker previews on input and commits once on change", () => {
    const onPreview = jest.fn();
    const onCommit = jest.fn();
    render(
      <ColorPicker
        label="Accent"
        value="#65c466"
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    const textInput = screen.getByDisplayValue("#65c466");
    const swatch = textInput.previousElementSibling;

    fireEvent.click(swatch);
    const nativeInput = document.body.querySelector('input[type="color"]');
    expect(nativeInput).toBeInTheDocument();

    fireEvent.input(nativeInput, { target: { value: "#abcdef" } });
    expect(onPreview).toHaveBeenCalledWith("#abcdef");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(nativeInput, { target: { value: "#123456" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("#123456");
    expect(document.body.querySelector('input[type="color"]')).toBeNull();
  });

  test("does not call onChange on invalid hex", () => {
    const onChange = jest.fn();
    render(<ColorPicker label="Accent" value="#65c466" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    const input = screen.getByDisplayValue("#65c466");
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does not preview or commit invalid hex", () => {
    const onPreview = jest.fn();
    const onCommit = jest.fn();
    render(
      <ColorPicker
        label="Accent"
        value="#65c466"
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Accent/i }));
    const input = screen.getByDisplayValue("#65c466");

    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.blur(input);

    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
