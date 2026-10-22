import { fireEvent, render } from "@testing-library/react";
import Markdown from "./markdown";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { createMarkdownParser } from "./safe_markdown";

jest.mock("./code", () => ({ children }) => <pre>{children}</pre>);

const config = {
  theme: { color: "#222", font: { fontFamily: "sans-serif" } },
  onThemeMode: "light_mode",
};
const view = (markdown, props = {}) => (
  <ConfigContext.Provider value={config}>
    <Markdown markdown={markdown} {...props} />
  </ConfigContext.Provider>
);
const expectPassiveMarkup = (container) => {
  expect(
    container.querySelector(
      "iframe,object,embed,script,style,link,svg,math,form,meta,base",
    ),
  ).toBeNull();
  container.querySelectorAll("*").forEach((element) => {
    [...element.attributes].forEach(({ name, value }) => {
      expect(name).not.toMatch(/^on/i);
      expect(name).not.toBe("srcdoc");
      if (name === "href" || name === "src") {
        expect(value.replace(/[\u0000-\u0020]/g, "")).not.toMatch(
          /^(?:javascript|vbscript|data|file):/i,
        );
      }
    });
  });
};

describe("Markdown untrusted output boundary", () => {
  test("removes active documents and CSS even with the legacy sanitizer disabled", () => {
    const { container } = render(
      view(
        '<iframe srcdoc="<script>parent.alert(1)</script>"></iframe>\n' +
          '<style>body{display:none}</style>\n' +
          '<object data="https://example.invalid/payload"></object>\n' +
          '<img src="https://example.invalid/image.png" onerror="alert(1)" alt="safe image">',
        { sanitize_html: false },
      ),
    );
    expectPassiveMarkup(container);
    expect(container.querySelector("img")).toHaveAttribute("alt", "safe image");
  });

  test("sanitizes again after a custom sanitizer and before custom components", () => {
    const Link = jest.fn(({ children, ...props }) => <a {...props}>{children}</a>);
    const { container } = render(
      view("normal input", {
        sanitize_html: () =>
          '<a href="jav&#x61;script:alert(1)" onclick="alert(1)">link</a>' +
          '<iframe srcdoc="payload"></iframe>',
        components: { a: Link },
      }),
    );
    expectPassiveMarkup(container);
    expect(Link).toHaveBeenCalled();
    expect(Link.mock.calls[0][0]).not.toHaveProperty("href");
    expect(Link.mock.calls[0][0]).not.toHaveProperty("onclick");
  });

  test.each([
    '<a href="jav&#x61;script:alert(1)">encoded</a>',
    '<a href="java&#9;script:alert(1)">control</a>',
    '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
    '<a href="file:///private/example">local file</a>',
    '<svg><a xlink:href="javascript:alert(1)">svg</a></svg>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
  ])("rejects alternate active markup %s", (source) => {
    const { container } = render(view(source));
    expectPassiveMarkup(container);
  });

  test("table-header and document-title inputs cannot create active markup", () => {
    const source =
      '---\ntitle: </title><iframe srcdoc="payload"></iframe>\n---\n\n' +
      '| a"><svg onload="alert(1)"> | safe |\n| --- | --- |\n| text | more |';
    const { container } = render(
      view(source, {
        flavor: "github",
        options: { tables: true, tablesHeaderId: true, completeHTMLDocument: true, metadata: true },
      }),
    );
    expectPassiveMarkup(container);
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelectorAll("th")).toHaveLength(2);
  });

  test("keeps CommonMark and the used GFM features, code, links and passive task lists", () => {
    const source =
      '# Title\n\n**bold** *emphasis* ~~removed~~\n\n' +
      '> quote\n\n- [x] complete\n- [ ] pending\n\n' +
      '| A | B |\n| --- | --- |\n| 1 | 2 |\n\n' +
      'https://example.com [link](https://example.com/path "title")\n\n' +
      '```js\nconst html = "<iframe>";\n```';
    const { container } = render(view(source));
    expect(container.querySelector("h1")).toHaveTextContent("Title");
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("emphasis");
    expect(container.querySelector("s,del")).toHaveTextContent("removed");
    expect(container.querySelector("blockquote")).toHaveTextContent("quote");
    expect(container.querySelector("table tbody td")).toHaveTextContent("1");
    const boxes = container.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(boxes[1]).not.toBeChecked();
    boxes.forEach((box) => expect(box).toBeDisabled());
    expect(container.querySelectorAll("a")).toHaveLength(2);
    expect(container.querySelector("pre code")).toHaveClass("language-js");
    expect(container.querySelector("pre code")).toHaveTextContent('const html = "<iframe>";');
    expectPassiveMarkup(container);
  });

  test("preserves think component children and custom component overrides", () => {
    const { container, getByText } = render(
      view('<think>reason **bold** <iframe srcdoc="payload"></iframe></think>\n\nanswer', {
        components: { strong: ({ children }) => <mark>{children}</mark> },
      }),
    );
    expect(container.textContent).toContain("Thinking");
    expect(container.textContent).not.toContain("reason");
    fireEvent.click(getByText("Thinking"));
    expect(container.textContent).toContain("reason");
    expect(container.querySelector("mark")).toHaveTextContent("bold");
    expectPassiveMarkup(container);
  });

  test("honors the existing option switches without enabling unsafe parser options", () => {
    const { container } = render(
      view('~~text~~ https://example.com\n\n- [x] task\n\n| A |\n| --- |\n| B |', {
        options: { tables: false, tasklists: false, strikethrough: false, simplifiedAutoLink: false },
      }),
    );
    expect(container.querySelector("table,input,a,s,del")).toBeNull();
    expect(container.textContent).toContain("~~text~~");
    expect(container.textContent).toContain("[x] task");
  });

  test("rechecks every incremental render and complete replay without retaining unsafe nodes", () => {
    const { container, rerender } = render(view("hello <iframe"));
    expectPassiveMarkup(container);
    rerender(view('hello <iframe srcdoc="payload"></iframe>\n\n**finished**'));
    expectPassiveMarkup(container);
    expect(container.querySelector("strong")).toHaveTextContent("finished");
    rerender(view('hello <iframe srcdoc="payload"></iframe>\n\n**finished**'));
    expectPassiveMarkup(container);
    expect(container.querySelectorAll("strong")).toHaveLength(1);
  });

  test("parses the anchor ReDoS input as literal text using the replacement parser", () => {
    // TRA-2024-05's nested-opening-bracket trigger. Keep the exact input large
    // enough to expose the retired anchor regex without rendering 90KB of DOM.
    const source = "[[[[[[[[[".repeat(9999);
    const parser = createMarkdownParser();
    const started = performance.now();
    const html = parser.render(source);
    expect(html).toBe(`<p>${source}</p>\n`);
    expect(performance.now() - started).toBeLessThan(2000);
    expect(parser.render("[normal](https://example.com)")).toContain(
      '<a href="https://example.com">normal</a>',
    );
  });
});
