import { render, waitFor } from "@testing-library/react";
import Icon from "./icon";
import { ConfigContext } from "../../CONTAINERs/config/context";

describe("Icon", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("renders mcp and tool as different glyphs", async () => {
    const { container, rerender } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="mcp" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
    const mcpPaths = Array.from(container.querySelectorAll("path")).map((path) =>
      path.getAttribute("d"),
    );
    expect(mcpPaths.join(" ")).toContain("M9.795 1.694");
    expect(mcpPaths.join(" ")).not.toContain("M16.3303 13.497");

    rerender(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="tool" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      const toolPaths = Array.from(container.querySelectorAll("path")).map(
        (path) => path.getAttribute("d"),
      );
      expect(toolPaths.join(" ")).toContain("M16.3303 13.497");
      expect(toolPaths.join(" ")).not.toContain("M9.795 1.694");
    });
  });

  test("renders side_menu_close without SVG parse errors", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { container } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="side_menu_close" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path.getAttribute("d")).toContain("M6 7H11V17H6V7Z");

    const hasInvalidPathError = consoleErrorSpy.mock.calls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "string" &&
          arg.includes("Unexpected end of attribute"),
      ),
    );
    expect(hasInvalidPathError).toBe(false);
  });

  test("renders queue_arrow from the builtin icon manifest", async () => {
    const { container } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="queue_arrow" color="#123456" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    const path = container.querySelector("path");
    expect(path).not.toBeNull();
    expect(path.getAttribute("d")).toContain("M4.99989 13.9999");

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("mini-ui-svg-icon");
    expect(svg.getAttribute("fill")).toBe("#123456");
    expect(svg).toHaveStyle({ width: "100%", height: "100%" });
  });

  test("renders delete with builtin icon sizing props", async () => {
    const { container } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="delete" color="#654321" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("mini-ui-svg-icon");
    expect(svg.getAttribute("fill")).toBe("#654321");
    expect(svg).toHaveStyle({ width: "100%", height: "100%" });
  });

  test("renders btw and fyi command icons from the builtin icon manifest", async () => {
    const { container, rerender } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="btw" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
    expect(container.querySelector("path").getAttribute("d")).toContain(
      "M12 19C12.8284 19",
    );

    rerender(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="fyi" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("path").getAttribute("d")).toContain(
        "M12 6C12.8284 6",
      );
    });
  });
});

describe("link vs unlink glyphs", () => {
  const pathsOf = (container) =>
    Array.from(container.querySelectorAll("path"))
      .map((p) => p.getAttribute("d"))
      .join(" ");

  /* The two share the same chain body, so only the corner marks tell them
     apart — that is exactly the pair the theme editor's follow toggle swaps
     between, and a copy-paste slip there would be invisible without this. */
  const CORNER_MARKS = "M17 17H22V19H19V22H17V17ZM7 7H2V5H5V2H7V7Z";

  test("unlink carries the broken-apart corner marks", async () => {
    const { container } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="unlink" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
    expect(pathsOf(container)).toContain(CORNER_MARKS);
  });

  test("link is the same chain without them", async () => {
    const { container } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="link" />
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
    expect(pathsOf(container)).not.toContain(CORNER_MARKS);
    expect(pathsOf(container)).toContain("20.3164 10.7545 20.3164 7.58866");
  });
});
