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

  test("renders steer_arrow from the builtin icon manifest", async () => {
    const { container } = render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Icon src="steer_arrow" color="#123456" />
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
