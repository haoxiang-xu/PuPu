import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { CustomProviderPane } from "./custom_provider_pane";
import { AddProviderPane } from "./add_provider_pane";

jest.mock("../../settings/model_providers/custom-providers/custom_provider_list", () => ({
  __esModule: true,
  CustomProviderRow: ({ provider, onEdit, onChanged }) => (
    <div data-testid={`row-${provider.id}`}>
      <button onClick={onEdit}>edit</button>
      <button onClick={onChanged}>changed</button>
    </div>
  ),
}));
jest.mock("../../settings/model_providers/custom-providers/custom_provider_editor", () => ({
  __esModule: true,
  default: ({ open, slug, onSaved, autoFocusKey }) =>
    open ? (
      <div data-testid="editor" data-slug={slug || ""} data-autofocus={String(autoFocusKey)}>
        <button onClick={() => onSaved("fresh")}>save</button>
      </div>
    ) : null,
}));
jest.mock("../../settings/model_providers/custom-providers/custom_provider_import_modal", () => ({
  __esModule: true,
  default: ({ open, onImported }) =>
    open ? (
      <div data-testid="import-modal">
        <button onClick={() => onImported({ slug: "imp", requiresKey: true })}>import-needs-key</button>
        <button onClick={() => onImported({ slug: "imp2", requiresKey: false })}>import-ready</button>
      </div>
    ) : null,
}));
jest.mock("../../settings/model_providers/custom-providers/preset_picker", () => ({
  __esModule: true,
  default: ({ open }) => (open ? <div data-testid="preset-picker" /> : null),
}));
jest.mock("../../settings/model_providers/custom-providers/export_provider", () => ({
  __esModule: true,
  exportCustomProvider: jest.fn(() => Promise.resolve({ ok: true })),
}));
jest.mock("../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  findCustomProvider: jest.fn(),
}));
jest.mock("../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (k) => k }),
}));
jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const { findCustomProvider } = require("../../../SERVICEs/custom_provider_store");

const wrap = (ui) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>{ui}</ConfigContext.Provider>,
  );

const HYPER = { id: "hyperspace", display_name: "Hyperspace", enabled: true, auth: { mode: "x-api-key" } };

describe("CustomProviderPane", () => {
  beforeEach(() => {
    findCustomProvider.mockReset();
  });

  test("the existing row (heading is the modal's fixed header); edit opens the editor for this slug", () => {
    findCustomProvider.mockReturnValue(HYPER);
    wrap(<CustomProviderPane entry={{ provider: HYPER }} onDeleted={jest.fn()} />);
    expect(screen.getByTestId("row-hyperspace")).toBeInTheDocument();
    expect(screen.queryByTestId("editor")).toBeNull();
    fireEvent.click(screen.getByText("edit"));
    expect(screen.getByTestId("editor").dataset.slug).toBe("hyperspace");
  });

  test("a change that removed the provider hands the selection back (onDeleted)", () => {
    findCustomProvider.mockReturnValueOnce(HYPER).mockReturnValue(null);
    const onDeleted = jest.fn();
    wrap(<CustomProviderPane entry={{ provider: HYPER }} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByText("changed"));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  test("a change that kept the provider does not", () => {
    findCustomProvider.mockReturnValue(HYPER);
    const onDeleted = jest.fn();
    wrap(<CustomProviderPane entry={{ provider: HYPER }} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByText("changed"));
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("AddProviderPane", () => {
  test("Add opens a blank editor; saving lands on the new rail id", () => {
    const onCreated = jest.fn();
    wrap(<AddProviderPane onCreated={onCreated} />);
    fireEvent.click(screen.getByText("model_providers.custom.add"));
    expect(screen.getByTestId("editor").dataset.slug).toBe("");
    fireEvent.click(screen.getByText("save"));
    expect(onCreated).toHaveBeenCalledWith("custom:fresh");
  });

  test("From preset opens the picker; Import opens the import modal", () => {
    wrap(<AddProviderPane onCreated={jest.fn()} />);
    fireEvent.click(screen.getByText("model_providers.custom.add_from_preset"));
    expect(screen.getByTestId("preset-picker")).toBeInTheDocument();
    fireEvent.click(screen.getByText("model_providers.custom.import"));
    expect(screen.getByTestId("import-modal")).toBeInTheDocument();
  });

  test("an import that still needs a key opens the editor focused on the key (C12) before landing", () => {
    const onCreated = jest.fn();
    wrap(<AddProviderPane onCreated={onCreated} />);
    fireEvent.click(screen.getByText("model_providers.custom.import"));
    fireEvent.click(screen.getByText("import-needs-key"));
    const editor = screen.getByTestId("editor");
    expect(editor.dataset.slug).toBe("imp");
    expect(editor.dataset.autofocus).toBe("true");
    expect(onCreated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("save"));
    expect(onCreated).toHaveBeenCalledWith("custom:fresh");
  });

  test("an import that is ready lands immediately", () => {
    const onCreated = jest.fn();
    wrap(<AddProviderPane onCreated={onCreated} />);
    fireEvent.click(screen.getByText("model_providers.custom.import"));
    fireEvent.click(screen.getByText("import-ready"));
    expect(onCreated).toHaveBeenCalledWith("custom:imp2");
    expect(screen.queryByTestId("editor")).toBeNull();
  });
});
