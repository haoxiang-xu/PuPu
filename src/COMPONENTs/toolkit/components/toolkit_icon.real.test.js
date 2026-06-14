import { render, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ToolkitIcon from "./toolkit_icon";

const renderToolkitIcon = (icon) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <ToolkitIcon icon={icon} size={24} />
    </ConfigContext.Provider>,
  );

const pathData = (container) =>
  Array.from(container.querySelectorAll("path"))
    .map((path) => path.getAttribute("d"))
    .join(" ");

describe("ToolkitIcon real builtin rendering", () => {
  test("renders the mcp builtin glyph instead of the generic tool glyph", async () => {
    const { container } = renderToolkitIcon({
      type: "builtin",
      name: "mcp",
      color: "#9aa0a6",
      backgroundColor: "transparent",
    });

    await waitFor(() => {
      expect(container.querySelector("svg")).toBeInTheDocument();
    });

    expect(pathData(container)).toContain("M9.795 1.694");
    expect(pathData(container)).not.toContain("M16.3303 13.497");
  });
});
