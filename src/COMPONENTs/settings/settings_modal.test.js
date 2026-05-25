import { render, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import { SettingsModal } from "./settings_modal";

jest.mock("../../BUILTIN_COMPONENTs/modal/modal", () => ({
  __esModule: true,
  default: ({ open, children }) => (open ? <div>{children}</div> : null),
}));

jest.mock("../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick = () => {} }) => (
    <button onClick={onClick}>{label}</button>
  ),
}));

jest.mock("./appearance", () => ({
  __esModule: true,
  AppearanceSettings: () => <div>Appearance Content</div>,
}));

jest.mock("./model_providers", () => ({
  __esModule: true,
  ModelProvidersSettings: () => <div>Model Providers Content</div>,
}));

jest.mock("./local_storage", () => ({
  __esModule: true,
  LocalStorageSettings: () => <div>Local Storage Content</div>,
}));

jest.mock("./memory", () => ({
  __esModule: true,
  MemorySettings: () => <div>Memory Content</div>,
}));

jest.mock("./runtime", () => ({
  __esModule: true,
  RuntimeSettings: () => <div>Workspaces Content</div>,
}));

jest.mock("./app_update", () => ({
  __esModule: true,
  AppUpdateSettings: () => <div>Update Content</div>,
}));

jest.mock("./token_usage", () => ({
  __esModule: true,
  TokenUsageSettings: () => <div>Token Usage Content</div>,
}));

jest.mock("./dev", () => ({
  __esModule: true,
  DevSettings: () => <div>Dev Content</div>,
}));

jest.mock("./dev/storage", () => ({
  __esModule: true,
  isDevSettingsAvailable: () => false,
}));

const renderSettingsModal = () =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <SettingsModal open onClose={jest.fn()} />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("SettingsModal", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("shows the Update page by default", async () => {
    renderSettingsModal();

    expect(await screen.findByText("Update")).toBeInTheDocument();
  });

  test("hides the Update page when the app update feature flag is disabled", async () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_app_update_settings: false,
        },
      }),
    );

    renderSettingsModal();

    await screen.findByText("Appearance Content");
    expect(screen.queryByText("Update")).not.toBeInTheDocument();
  });
});
