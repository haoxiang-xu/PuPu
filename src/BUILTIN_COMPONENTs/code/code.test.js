import { act, render } from "@testing-library/react";
import hljs from "highlight.js/lib/common";
import Code from "./code";
import { ConfigContext } from "../../CONTAINERs/config/context";

jest.mock("highlight.js/lib/common", () => ({
  getLanguage: jest.fn(),
  highlight: jest.fn(),
  highlightAuto: jest.fn(),
}));

const configContextValue = {
  theme: { color: "#222", font: { fontFamily: "sans-serif" }, code: {} },
  onThemeMode: "light_mode",
};

const renderCodeTree = (props, parentStyle) => (
  <div style={parentStyle}>
    <ConfigContext.Provider
      value={configContextValue}
    >
      <Code {...props} />
    </ConfigContext.Provider>,
  </div>
);

const renderCode = (props, { parentStyle } = {}) =>
  render(renderCodeTree(props, parentStyle));

describe("Code deferred highlight", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hljs.getLanguage.mockReturnValue(true);
    hljs.highlight.mockReturnValue({ value: "<mark>const</mark> value = 1;" });
    hljs.highlightAuto.mockReturnValue({ value: "<mark>auto</mark>" });
    window.requestIdleCallback = (callback) =>
      setTimeout(
        () =>
          callback({
            didTimeout: false,
            timeRemaining: () => 16,
          }),
        1,
      );
    window.cancelIdleCallback = (id) => clearTimeout(id);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
    jest.clearAllMocks();
  });

  test("renders plain text first and highlights asynchronously", () => {
    const { container } = renderCode({
      code: "const value = 1;",
      language: "js",
    });

    const codeElement = container.querySelector("code.hljs");
    expect(codeElement).toBeInTheDocument();
    expect(codeElement.textContent).toContain("const value = 1;");
    expect(hljs.highlight).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(10);
    });

    expect(hljs.highlight).toHaveBeenCalledWith("const value = 1;", {
      language: "js",
    });
    expect(codeElement.innerHTML).toContain("<mark>const</mark>");
  });

  test("skips highlightAuto for very long code without explicit language", () => {
    const veryLongCode = "x".repeat(7001);
    const { container } = renderCode({
      code: veryLongCode,
      language: "",
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(hljs.highlightAuto).not.toHaveBeenCalled();
    const codeElement = container.querySelector("code.hljs");
    expect(codeElement.textContent.length).toBe(veryLongCode.length);
  });

  test("keeps fenced code blocks opt out of inherited prose wrapping", () => {
    const { container } = renderCode(
      {
        code: "const value = 1;",
        language: "js",
      },
      {
        parentStyle: {
          wordBreak: "break-word",
          width: "120px",
        },
      },
    );

    act(() => {
      jest.advanceTimersByTime(10);
    });

    const scrollContainer = container.querySelector(".scrollable");
    const codeElement = container.querySelector("code.hljs");

    expect(codeElement.innerHTML).toContain("<mark>const</mark>");
    expect(scrollContainer).toHaveStyle(`
      word-break: normal;
      overflow-wrap: normal;
      hyphens: none;
    `);
    expect(codeElement).toHaveStyle(`
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
      hyphens: none;
    `);
  });

  test("preserves highlight output and non-wrapping styles across parent rerenders", () => {
    const props = {
      code: "const value = 1;",
      language: "js",
    };
    const { container, rerender } = renderCode(props, {
      parentStyle: {
        wordBreak: "break-word",
        width: "320px",
      },
    });

    act(() => {
      jest.advanceTimersByTime(10);
    });

    rerender(
      renderCodeTree(props, {
        wordBreak: "break-word",
        width: "140px",
      }),
    );

    act(() => {
      jest.advanceTimersByTime(10);
    });

    const scrollContainer = container.querySelector(".scrollable");
    const codeElement = container.querySelector("code.hljs");

    expect(hljs.highlight).toHaveBeenCalledTimes(1);
    expect(codeElement.innerHTML).toContain("<mark>const</mark>");
    expect(scrollContainer).toHaveStyle(`
      word-break: normal;
      overflow-wrap: normal;
      hyphens: none;
    `);
    expect(codeElement).toHaveStyle(`
      white-space: pre;
      word-break: normal;
      overflow-wrap: normal;
      hyphens: none;
    `);
  });
});
