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

describe("SeamlessMarkdown streaming plain-text mode", () => {
  beforeEach(() => {
    mockMarkdownRender.mockClear();
  });

  test("done: renders the full content through markdown with no plain-text tail", () => {
    const { getByTestId, container } = render(
      <SeamlessMarkdown content="# Title" status="done" />,
    );
    expect(getByTestId("md").textContent).toBe("# Title");
    expect(container.textContent).toBe("# Title");
  });

  test("streaming: keeps a stable root and does not parse an open paragraph", () => {
    const { container, rerender } = render(
      <SeamlessMarkdown content="" status="streaming" />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveAttribute("data-streaming-markdown-root", "true");

    act(() =>
      rerender(<SeamlessMarkdown content="Hello" status="streaming" />),
    );
    expect(container.firstElementChild).toBe(root);
    expect(mockMarkdownRender).not.toHaveBeenCalled();
    expect(container.querySelector("[data-streaming-plain-text]")).toHaveTextContent(
      "Hello",
    );

    act(() =>
      rerender(<SeamlessMarkdown content="Hello, world" status="streaming" />),
    );
    expect(container.firstElementChild).toBe(root);
    expect(mockMarkdownRender).not.toHaveBeenCalled();
    expect(container.querySelector("[data-streaming-plain-text]").tagName).toBe("DIV");
    expect(container.textContent).toBe("Hello, world");
    expect(mockMarkdownRender).not.toHaveBeenCalled();
  });

  test("streaming: parses only stable blocks and keeps appended text in the live tail", () => {
    const { container, rerender } = render(
      <SeamlessMarkdown content={"Hello"} status="streaming" />,
    );

    expect(mockMarkdownRender).not.toHaveBeenCalled();

    act(() =>
      rerender(<SeamlessMarkdown content={"Hello\n\nWorld"} status="streaming" />),
    );
    expect(mockMarkdownRender).toHaveBeenCalledTimes(1);
    expect(mockMarkdownRender).toHaveBeenLastCalledWith("Hello\n\n");
    expect(container.querySelector("[data-streaming-plain-text]").textContent).toBe(
      "World",
    );

    act(() =>
      rerender(
        <SeamlessMarkdown
          content={"Hello\n\nWorld\n\nNext"}
          status="streaming"
        />,
      ),
    );
    expect(mockMarkdownRender).toHaveBeenCalledTimes(2);
    expect(mockMarkdownRender).toHaveBeenLastCalledWith("World\n\n");
    expect(
      container.querySelector("[data-streaming-plain-text]").textContent,
    ).toBe("Next");
  });

  test("streaming: renders an unclosed code fence as plain text", () => {
    const { container } = render(
      <SeamlessMarkdown content={"```js\nconsole.log(1)"} status="streaming" />,
    );

    const live = container.querySelector("[data-streaming-plain-text]");
    expect(live.tagName).toBe("PRE");
    expect(live).toHaveAttribute("data-streaming-live-kind", "code");
    expect(live.textContent).toBe("```js\nconsole.log(1)");
    expect(mockMarkdownRender).not.toHaveBeenCalled();
  });

  test("streaming: keeps old text chunks stable when very long content appends", () => {
    const firstChunkText = "a".repeat(STREAMING_MESSAGE_CHUNK_SIZE);
    const secondChunkText = "b".repeat(32);
    const { container, rerender } = render(
      <SeamlessMarkdown content={firstChunkText} status="streaming" />,
    );

    const firstChunk = container.querySelector(
      "[data-streaming-plain-text-chunk]",
    );
    expect(firstChunk).toBeInTheDocument();
    expect(firstChunk.textContent).toBe(firstChunkText);

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
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(firstChunk);
    expect(chunks[0].textContent).toBe(firstChunkText);
    expect(chunks[1].textContent).toBe(secondChunkText);
    expect(container.textContent).toBe(`${firstChunkText}${secondChunkText}`);
    expect(mockMarkdownRender).not.toHaveBeenCalled();
  });

  test("streaming: renders provided chunks without receiving full content text", () => {
    const { container } = render(
      <SeamlessMarkdown
        content=""
        streamingChunks={["Hello", ", world"]}
        status="streaming"
      />,
    );

    expect(container.textContent).toBe("Hello, world");
    expect(
      container.querySelectorAll("[data-streaming-plain-text-chunk]"),
    ).toHaveLength(1);
    expect(mockMarkdownRender).not.toHaveBeenCalled();
  });
});
