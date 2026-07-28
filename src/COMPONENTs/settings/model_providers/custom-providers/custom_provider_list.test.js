import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import CustomProviderList, { isInsecureRemote } from "./custom_provider_list";
import {
  hasCustomProviderSecret,
  flushCustomProviderMutations,
  removeCustomProvider,
  setCustomProviderEnabled,
} from "../../../../SERVICEs/custom_provider_store";
import { toast } from "../../../../SERVICEs/toast";

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  hasCustomProviderSecret: jest.fn(() => false),
  removeCustomProvider: jest.fn(),
  flushCustomProviderMutations: jest.fn(() => Promise.resolve([])),
  setCustomProviderEnabled: jest.fn(),
}));

jest.mock("../../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src = "icon" }) => <span data-testid={`icon-${src}`} />,
}));

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, ariaLabel, onClick, disabled }) => (
    <button aria-label={ariaLabel} disabled={disabled} onClick={onClick}>
      {label || ariaLabel}
    </button>
  ),
}));

const provider = (overrides = {}) => ({
  id: "sap-hyperspace",
  display_name: "SAP Hyperspace",
  protocol: "anthropic",
  base_url: "http://localhost:6655/anthropic",
  auth: { mode: "x-api-key" },
  models: [{ id: "m1" }, { id: "m2" }],
  enabled: true,
  ...overrides,
});

const durableDefinition = (definition = {}, persistence = Promise.resolve()) => {
  const result = { ...definition };
  Object.defineProperty(result, "persistence", {
    value: persistence,
    enumerable: false,
  });
  return result;
};

const renderList = (providers, extra = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <CustomProviderList
          providers={providers}
          isDark={false}
          onEdit={extra.onEdit || jest.fn()}
          onChanged={extra.onChanged || jest.fn()}
        />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("isInsecureRemote", () => {
  test("flags http to a non-local host", () => {
    expect(isInsecureRemote("http://example.com/api")).toBe(true);
  });
  test("allows http to localhost", () => {
    expect(isInsecureRemote("http://localhost:6655/anthropic")).toBe(false);
    expect(isInsecureRemote("http://127.0.0.1:6655")).toBe(false);
  });
  test("allows https anywhere", () => {
    expect(isInsecureRemote("https://example.com")).toBe(false);
  });
  test("tolerates garbage input", () => {
    expect(isInsecureRemote("not a url")).toBe(false);
    expect(isInsecureRemote(undefined)).toBe(false);
  });
});

describe("CustomProviderList", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hasCustomProviderSecret.mockReturnValue(false);
    flushCustomProviderMutations.mockResolvedValue([]);
    setCustomProviderEnabled.mockImplementation((slug, enabled) =>
      durableDefinition({ id: slug, enabled }),
    );
  });

  test("renders the empty hint when there are no providers", () => {
    renderList([]);
    expect(
      screen.getByText("No custom providers yet.", { exact: false }),
    ).toBeTruthy();
  });

  test("renders a row per provider with display name and model count", () => {
    renderList([provider(), provider({ id: "p2", display_name: "Second" })]);
    expect(screen.getByText("SAP Hyperspace")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    // model_count interpolated -> "2 models"
    expect(screen.getAllByText("2 models").length).toBe(2);
  });

  test("shows the cleartext badge only for insecure remote http", () => {
    renderList([
      provider({ id: "local", base_url: "http://localhost:6655/x" }),
      provider({ id: "remote", base_url: "http://plain.example.com/x" }),
    ]);
    // one badge = the remote one
    expect(screen.getAllByText("Cleartext").length).toBe(1);
  });

  test("toggling the enabled switch waits for persistence before onChanged", async () => {
    const onChanged = jest.fn();
    renderList([provider({ enabled: true })], { onChanged });
    fireEvent.click(screen.getByRole("switch"));
    expect(setCustomProviderEnabled).toHaveBeenCalledWith("sap-hyperspace", false);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test("a rejected toggle persistence ack reports an error", async () => {
    setCustomProviderEnabled.mockImplementation((slug, enabled) =>
      durableDefinition(
        { id: slug, enabled },
        Promise.reject(new Error("definition IPC rejected")),
      ),
    );
    renderList([provider({ enabled: true })]);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });

  test("edit button invokes onEdit with the slug", () => {
    const onEdit = jest.fn();
    renderList([provider()], { onEdit });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith("sap-hyperspace");
  });

  test("delete confirmation calls removeCustomProvider and onChanged", async () => {
    const onChanged = jest.fn();
    renderList([provider()], { onChanged });
    // open the confirm modal
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    // confirm inside the modal (common.delete -> "Delete" label)
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    // last "Delete" is the modal confirm
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(removeCustomProvider).toHaveBeenCalledWith("sap-hyperspace");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  test("failed credential deletion keeps the confirmation open and reports failure", async () => {
    flushCustomProviderMutations.mockResolvedValue([
      {
        ok: false,
        status: "delete-failed-tombstoned",
        errorCode: "storage_io_error",
      },
    ]);
    renderList([provider()]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
  });

  test("key status dot reflects hasCustomProviderSecret", () => {
    hasCustomProviderSecret.mockReturnValue(true);
    renderList([provider()]);
    expect(screen.getAllByText("Key set").length).toBeGreaterThan(0);
  });
});
