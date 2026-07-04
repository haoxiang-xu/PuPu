import { act, render } from "@testing-library/react";
import hljs from "highlight.js/lib/common";
import Markdown from "./markdown";
import { ConfigContext } from "../../CONTAINERs/config/context";

jest.mock("highlight.js/lib/common", () => ({
  getLanguage: jest.fn(),
  highlight: jest.fn(),
  highlightAuto: jest.fn(),
}));

const MARKDOWN_WITH_CODE_BLOCK = `\`\`\`js
const hello = "world";
console.log(hello);
\`\`\``;

const noop = () => {};
const sharedTheme = {
  color: "#222",
  font: { fontFamily: "sans-serif" },
  code: {},
  markdown: {},
};

const createConfigValue = ({ width = 1280 } = {}) => ({
  syncWithSystemTheme: false,
  setSyncWithSystemTheme: noop,
  availableThemes: [],
  theme: sharedTheme,
  setTheme: noop,
  onThemeMode: "light_mode",
  setOnThemeMode: noop,
  window_size: { width, height: 900 },
  env_browser: "Chrome",
  device_type: "desktop",
  onFragment: "main",
  setOnFragment: noop,
});

const renderMarkdown = (configValue) =>
  render(
    <ConfigContext.Provider value={configValue}>
      <Markdown markdown={MARKDOWN_WITH_CODE_BLOCK} />
    </ConfigContext.Provider>,
  );

describe("Markdown fenced code blocks", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hljs.getLanguage.mockReturnValue(true);
    hljs.highlight.mockReturnValue({
      value:
        '<span class="hljs-keyword">const</span> hello = <span class="hljs-string">"world"</span>;',
    });
    hljs.highlightAuto.mockReturnValue({ value: "<span>auto</span>" });
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

  test("keeps code block DOM stable across resize-driven context rerenders", () => {
    const { container, rerender } = renderMarkdown(createConfigValue());

    act(() => {
      jest.advanceTimersByTime(10);
    });

    const codeBefore = container.querySelector("code.hljs");
    expect(codeBefore).toBeInTheDocument();
    expect(codeBefore.innerHTML).toContain("hljs-keyword");
    expect(hljs.highlight).toHaveBeenCalledTimes(1);

    rerender(
      <ConfigContext.Provider value={createConfigValue({ width: 760 })}>
        <Markdown markdown={MARKDOWN_WITH_CODE_BLOCK} />
      </ConfigContext.Provider>,
    );

    act(() => {
      jest.advanceTimersByTime(10);
    });

    const codeAfter = container.querySelector("code.hljs");
    expect(codeAfter).toBe(codeBefore);
    expect(codeAfter.innerHTML).toContain("hljs-keyword");
    expect(hljs.highlight).toHaveBeenCalledTimes(1);
  });
});

describe("Markdown shared <style> registry", () => {
  afterEach(() => {
    document.head
      .querySelectorAll("style[data-markdown-shared]")
      .forEach((el) => el.remove());
  });

  test("三个相同主题的 Markdown 实例只产生一张共享 <style>", () => {
    render(
      <ConfigContext.Provider value={createConfigValue()}>
        <div>
          <Markdown markdown="# hello" />
          <Markdown markdown={"world **bold**"} />
          <Markdown markdown={"a paragraph of text"} />
        </div>
      </ConfigContext.Provider>,
    );

    expect(
      document.head.querySelectorAll("style[data-markdown-shared]").length,
    ).toBe(1);
    // 每个实例仍带 data-markdown-id(别处测试依赖),并共享同一 sid
    const roots = document.querySelectorAll("[data-markdown-id]");
    expect(roots.length).toBe(3);
    const sids = new Set(
      [...roots].map((el) => el.getAttribute("data-markdown-sid")),
    );
    expect(sids.size).toBe(1);
  });
});
