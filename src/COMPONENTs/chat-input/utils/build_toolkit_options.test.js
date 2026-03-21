import { isValidElement } from "react";
import { build_toolkit_options } from "./build_toolkit_options";

describe("build_toolkit_options", () => {
  test("uses toolkit.toml display fields and includes a rendered icon", () => {
    const options = build_toolkit_options([
      {
        toolkitId: "workspace_toolkit",
        toolkitName: "Workspace Files",
        toolkitDescription: "Read and write project files",
        toolkitIcon: {
          type: "builtin",
          name: "tool",
          color: "#ffffff",
          backgroundColor: "#111827",
        },
        tools: [
          { title: "Read File", name: "read_file" },
          { title: "Write File", name: "write_file" },
        ],
      },
    ]);

    expect(options).toHaveLength(1);
    expect(options[0].value).toBe("WorkspaceToolkit");
    expect(options[0].label).toBe("Workspace Files");
    expect(options[0].description).toBe("Read and write project files");
    expect(options[0].search).toContain("workspace_toolkit");
    expect(isValidElement(options[0].icon)).toBe(true);
  });
});
