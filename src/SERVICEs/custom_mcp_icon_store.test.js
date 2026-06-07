import {
  getCustomMcpIcon,
  setCustomMcpIcon,
  removeCustomMcpIcon,
} from "./custom_mcp_icon_store";

const pngIcon = { type: "file", content: "aGVsbG8=", mimeType: "image/png" };
const svgIcon = {
  type: "file",
  content: "<svg></svg>",
  mimeType: "image/svg+xml",
};

describe("custom_mcp_icon_store", () => {
  beforeEach(() => window.localStorage.clear());

  test("stores and reads a png icon by custom toolkitId", () => {
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    expect(getCustomMcpIcon("mcp.custom.local-test")).toEqual(pngIcon);
  });

  test("stores an svg icon", () => {
    setCustomMcpIcon("mcp.custom.svg-test", svgIcon);
    expect(getCustomMcpIcon("mcp.custom.svg-test")).toEqual(svgIcon);
  });

  test("ignores non-custom toolkitIds", () => {
    setCustomMcpIcon("mcp.memory.memory", pngIcon);
    expect(getCustomMcpIcon("mcp.memory.memory")).toBeNull();
  });

  test("ignores invalid icon shapes", () => {
    setCustomMcpIcon("mcp.custom.bad", { type: "builtin", name: "server" });
    setCustomMcpIcon("mcp.custom.bad2", {
      type: "file",
      content: "x",
      mimeType: "image/gif",
    });
    expect(getCustomMcpIcon("mcp.custom.bad")).toBeNull();
    expect(getCustomMcpIcon("mcp.custom.bad2")).toBeNull();
  });

  test("returns null for unknown id", () => {
    expect(getCustomMcpIcon("mcp.custom.missing")).toBeNull();
  });

  test("removes a stored icon", () => {
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    removeCustomMcpIcon("mcp.custom.local-test");
    expect(getCustomMcpIcon("mcp.custom.local-test")).toBeNull();
  });

  test("passing null removes the entry", () => {
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    setCustomMcpIcon("mcp.custom.local-test", null);
    expect(getCustomMcpIcon("mcp.custom.local-test")).toBeNull();
  });

  test("survives corrupted storage", () => {
    window.localStorage.setItem("custom_mcp_icons", "not json{");
    expect(getCustomMcpIcon("mcp.custom.local-test")).toBeNull();
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    expect(getCustomMcpIcon("mcp.custom.local-test")).toEqual(pngIcon);
  });
});
