import { fireEvent, render, screen } from "@testing-library/react";
import { DevSettings } from "./index";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isBuildFeatureFlagsSyncAvailable: () => false,
    setChromeTerminalOpen: jest.fn(() => Promise.resolve({ ok: true })),
  },
}));

jest.mock("../../../SERVICEs/feature_flags", () => ({
  __esModule: true,
  FEATURE_FLAG_DEFINITIONS: {},
  readFeatureFlags: () => ({}),
  subscribeFeatureFlags: () => () => {},
  writeFeatureFlags: jest.fn(),
}));

jest.mock("../appearance", () => ({
  __esModule: true,
  SettingsSection: ({ title, children }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
  SettingsRow: ({ label, description, children }) => (
    <div>
      <span>{label}</span>
      <span>{description}</span>
      {children}
    </div>
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick }) => (
    <button data-testid={`btn-${label}`} onClick={onClick}>
      {label}
    </button>
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

jest.mock("../../ui-testing/ui_testing_modal", () => ({
  __esModule: true,
  default: ({ open }) => (open ? <div>UI Testing Modal</div> : null),
}));

jest.mock("./components/mcp_registries_modal", () => ({
  __esModule: true,
  default: ({ open }) => (open ? <div>MCP Registries Modal</div> : null),
}));

jest.mock("../../../BUILTIN_COMPONENTs/select/select", () => ({
  __esModule: true,
  default: ({ options, value, set_value }) => (
    <select
      data-testid="platform-select"
      value={value}
      onChange={(e) => set_value(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

describe("DevSettings", () => {
  const {
    readPlatformOverride,
    writePlatformOverride,
  } = require("../../../SERVICEs/platform_presentation");
  const {
    resetSettingsRepositoryForTests,
  } = require("../../../SERVICEs/settings_repository");
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    window.runtime = { isElectron: true, platform: "darwin" };
  });
  afterEach(() => {
    delete window.runtime;
  });

  test("AC-256-6: the Platform presentation row offers System / macOS / Windows / Linux and writes the override", () => {
    render(<DevSettings />);
    expect(screen.getByText("dev.platform_presentation")).toBeInTheDocument();
    expect(screen.getByText("dev.platform_presentation_desc")).toBeInTheDocument();
    const select = screen.getByTestId("platform-select");
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
      ["system", "dev.platform_system"],
      ["darwin", "dev.platform_macos"],
      ["win32", "dev.platform_windows"],
      ["linux", "dev.platform_linux"],
    ]);
    expect(select.value).toBe("system");
    fireEvent.change(select, { target: { value: "win32" } });
    expect(readPlatformOverride()).toBe("win32");
    expect(select.value).toBe("win32");
    fireEvent.change(select, { target: { value: "system" } });
    expect(readPlatformOverride()).toBeNull();
    expect(select.value).toBe("system");
  });

  test("the row reflects an override written elsewhere", () => {
    writePlatformOverride("linux");
    render(<DevSettings />);
    expect(screen.getByTestId("platform-select").value).toBe("linux");
  });

  test("opens MCP Registries in a modal from a Developer row", () => {
    render(<DevSettings />);

    expect(screen.getByText("dev.mcp_registries")).toBeInTheDocument();
    expect(screen.getByText("dev.mcp_registry_desc")).toBeInTheDocument();
    expect(screen.queryByText("MCP Registries Modal")).toBeNull();

    fireEvent.click(screen.getAllByTestId("btn-dev.open")[1]);

    expect(screen.getByText("MCP Registries Modal")).toBeInTheDocument();
  });
});
