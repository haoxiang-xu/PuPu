import { act, render } from "@testing-library/react";

// Record what text the markdown layer is actually asked to parse.
const mockMarkdownRender = jest.fn();
jest.mock("../../../BUILTIN_COMPONENTs/markdown/markdown", () => ({
  __esModule: true,
  default: ({ markdown }) => {
    mockMarkdownRender(markdown);
    return <div data-testid="md">{markdown}</div>;
  },
}));

import SeamlessMarkdown from "./seamless_markdown";
import { STREAMING_MESSAGE_CHUNK_SIZE } from "../../../SERVICEs/streaming_message_chunks";

// The live tail now renders through the same Markdown component as the stable
// blocks (block-promotion no longer swaps a plain-text tail for a styled one),
// except on the >4KB performance-fallback path which keeps StreamingPlainText.
describe("SeamlessMarkdown streaming live-markdown tail", () => {
  beforeEach(() => {
    mockMarkdownRender.mockClear();
  });

  const markdownCalls = () => mockMarkdownRender.mock.calls.map((c) => c[0]);

  test("done: renders the full content through markdown with no plain-text tail", () => {
    const { getByTestId, container } = render(
      <SeamlessMarkdown content="# Title" status="done" />,
    );
    expect(getByTestId("md").textContent).toBe("# Title");
    expect(container.textContent).toBe("# Title");
  });

  test("streaming: renders a small live paragraph tail through markdown, not plain text", () => {
    const { container, rerender } = render(
      <SeamlessMarkdown content="" status="streaming" />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-streaming-markdown-root", "true");

    act(() =>
      rerender(<SeamlessMarkdown content="Hello" status="streaming" />),
    );
    expect(container.firstElementChild).toBe(root);
    // No plain-text tail for a short live paragraph any more.
    expect(container.querySelector("[data-streaming-plain-text]")).toBeNull();
    // The open paragraph is now parsed as markdown.
    expect(markdownCalls()).toContain("Hello");

    act(() =>
      rerender(<SeamlessMarkdown content="Hello, world" status="streaming" />),
    );
    expect(container.firstElementChild).toBe(root);
    expect(container.querySelector("[data-streaming-plain-text]")).toBeNull();
    expect(markdownCalls()).toContain("Hello, world");
  });

  test("streaming: parses stable blocks AND the live tail through markdown", () => {
    const { container, rerender } = render(
      <SeamlessMarkdown content={"Hello"} status="streaming" />,
    );
    expect(markdownCalls()).toEqual(["Hello"]);

    mockMarkdownRender.mockClear();
    act(() =>
      rerender(
        <SeamlessMarkdown content={"Hello\n\nWorld"} status="streaming" />,
      ),
    );
    // Stable block "Hello\n\n" AND live tail "World" both go through markdown.
    expect(markdownCalls()).toContain("Hello\n\n");
    expect(markdownCalls()).toContain("World");
    expect(container.querySelector("[data-streaming-plain-text]")).toBeNull();

    mockMarkdownRender.mockClear();
    act(() =>
      rerender(
        <SeamlessMarkdown
          content={"Hello\n\nWorld\n\nNext"}
          status="streaming"
        />,
      ),
    );
    expect(markdownCalls()).toContain("World\n\n");
    expect(markdownCalls()).toContain("Next");
  });

  test("streaming: renders an unclosed code fence as a virtually closed markdown code block", () => {
    render(
      <SeamlessMarkdown content={"```js\nconsole.log(1)"} status="streaming" />,
    );
    // Fence is virtually closed with a matching marker so the code-block
    // styling/highlighting shows up mid-stream.
    expect(markdownCalls()).toContain("```js\nconsole.log(1)\n```");
  });

  test("streaming: virtually closes a tilde fence with a matching tilde marker", () => {
    render(<SeamlessMarkdown content={"~~~\ncode"} status="streaming" />);
    expect(markdownCalls()).toContain("~~~\ncode\n~~~");
  });

  test("streaming: virtually closes an extended (4+ backtick) fence with the same marker", () => {
    render(
      <SeamlessMarkdown
        content={"````\ncode with ``` inside"}
        status="streaming"
      />,
    );
    expect(markdownCalls()).toContain("````\ncode with ``` inside\n````");
  });

  test("streaming: normalizes an HTML-document live tail the same way stable blocks are normalized", () => {
    render(
      <SeamlessMarkdown
        content={"<!doctype html>\n<html></html>"}
        status="streaming"
      />,
    );
    // Live tail passes through normalizeHtmlDocumentMarkdown, so a raw HTML
    // document is wrapped in an html fence before markdown — matching what the
    // stable block would emit once promoted (no visual jump at promotion).
    const fenced = markdownCalls().find((text) => text.includes("```html"));
    expect(fenced).toBeTruthy();
    expect(fenced).toContain("<!doctype html>");
  });

  test("streaming: promotion keeps the same render path (markdown before and after)", () => {
    const { container, rerender } = render(
      <SeamlessMarkdown content={"Hello world"} status="streaming" />,
    );
    // Live tail: rendered as markdown.
    expect(markdownCalls()).toContain("Hello world");
    expect(container.querySelector("[data-streaming-plain-text]")).toBeNull();

    mockMarkdownRender.mockClear();
    // Blank line promotes the paragraph into a stable block.
    act(() =>
      rerender(
        <SeamlessMarkdown content={"Hello world\n\n"} status="streaming" />,
      ),
    );
    // Still markdown, never a plain-text tail — no styling jump at promotion.
    expect(markdownCalls()).toContain("Hello world\n\n");
    expect(container.querySelector("[data-streaming-plain-text]")).toBeNull();
  });

  test("streaming: falls back to plain text when the live tail exceeds the size guard", () => {
    const big = "a".repeat(5000);
    const { container } = render(
      <SeamlessMarkdown content={big} status="streaming" />,
    );

    const live = container.querySelector("[data-streaming-plain-text]");
    expect(live).not.toBeNull();
    expect(live.textContent).toBe(big);
    // Over-threshold live tail is NOT re-parsed as markdown.
    expect(mockMarkdownRender).not.toHaveBeenCalled();
  });

  test("streaming: large unclosed code block falls back to plain <pre>", () => {
    const big = "```js\n" + "x".repeat(5000);
    const { container } = render(
      <SeamlessMarkdown content={big} status="streaming" />,
    );

    const live = container.querySelector("[data-streaming-plain-text]");
    expect(live).not.toBeNull();
    expect(live.tagName).toBe("PRE");
    expect(live).toHaveAttribute("data-streaming-live-kind", "code");
    expect(mockMarkdownRender).not.toHaveBeenCalled();
  });

  test("streaming: keeps old plain-text chunks stable on the fallback path", () => {
    // 5 full chunks (> 4KB guard) so we stay on the plain-text fallback path.
    const firstChunkText = "a".repeat(STREAMING_MESSAGE_CHUNK_SIZE * 5);
    const secondChunkText = "b".repeat(32);
    const { container, rerender } = render(
      <SeamlessMarkdown content={firstChunkText} status="streaming" />,
    );

    const firstChunk = container.querySelector(
      "[data-streaming-plain-text-chunk]",
    );
    expect(firstChunk).toBeInTheDocument();
    expect(firstChunk.textContent).toBe("a".repeat(STREAMING_MESSAGE_CHUNK_SIZE));

    act(() =>
      rerender(
        <SeamlessMarkdown
          content={`${firstChunkText}${secondChunkText}`}
          status="streaming"
        />,
      ),
    );

    const chunks = container.querySelectorAll(
      "[data-streaming-plain-text-chunk]",
    );
    // 5 full chunks + a new 32-char chunk.
    expect(chunks).toHaveLength(6);
    expect(chunks[0]).toBe(firstChunk);
    expect(chunks[5].textContent).toBe(secondChunkText);
    expect(container.textContent).toBe(`${firstChunkText}${secondChunkText}`);
    expect(mockMarkdownRender).not.toHaveBeenCalled();
  });
});
