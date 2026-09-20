import { fireEvent, render, screen } from "@testing-library/react";
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
  ModelProvidersSettings: ({ onOpenModelProviders }) => (
    <div>
      Model Providers Content
      <button onClick={() => onOpenModelProviders?.("ollama")}>
        Open in Models (from page)
      </button>
    </div>
  ),
  OllamaLibraryBrowser: () => <div>Ollama Library Browser</div>,
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

const renderSettingsModal = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <SettingsModal open onClose={jest.fn()} {...props} />
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

  test("does not render a Computer Use entry in the main settings nav", async () => {
    renderSettingsModal();

    await screen.findByText("Appearance Content");
    // Computer Use configuration moved into the plugins panel; the settings
    // modal must no longer mount or navigate to it.
    expect(screen.queryByText("Computer Use")).not.toBeInTheDocument();
  });

  test("opens the Update page without feature flag configuration", async () => {
    renderSettingsModal();

    fireEvent.click(await screen.findByRole("button", { name: "Update" }));
    expect(await screen.findByText("Update Content")).toBeInTheDocument();
  });

  /* #204 R5: Settings keeps a narrow Model Providers page (the N1 accordion)
     again — the item navigates in place like every other settings page. The
     page itself gets onOpenModelProviders so its Ollama row can hand off to
     the wide layer (AC-12). */
  test("clicking Model Providers renders the page and passes onOpenModelProviders", async () => {
    const onOpenModelProviders = jest.fn();
    renderSettingsModal({ onOpenModelProviders });

    await screen.findByText("Appearance Content");

    fireEvent.click(
      screen.getByRole("button", { name: "Model Providers" }),
    );

    expect(
      await screen.findByText("Model Providers Content"),
    ).toBeInTheDocument();
    expect(onOpenModelProviders).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Open in Models (from page)" }),
    );
    expect(onOpenModelProviders).toHaveBeenCalledWith("ollama");
  });
});
