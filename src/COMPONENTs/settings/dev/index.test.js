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

describe("DevSettings", () => {
  test("opens MCP Registries in a modal from a Developer row", () => {
    render(<DevSettings />);

    expect(screen.getByText("dev.mcp_registries")).toBeInTheDocument();
    expect(screen.getByText("dev.mcp_registry_desc")).toBeInTheDocument();
    expect(screen.queryByText("MCP Registries Modal")).toBeNull();

    fireEvent.click(screen.getAllByTestId("btn-dev.open")[1]);

    expect(screen.getByText("MCP Registries Modal")).toBeInTheDocument();
  });
});
