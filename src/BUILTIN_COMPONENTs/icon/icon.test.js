import { render, waitFor } from "@testing-library/react";
import Icon from "./icon";
import { ConfigContext } from "../../CONTAINERs/config/context";

describe("Icon", () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
});
