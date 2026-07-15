import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import CustomProvidersSection from "./index";
import { readCustomProviders } from "../../../../SERVICEs/custom_provider_store";

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  readCustomProviders: jest.fn(() => []),
}));

jest.mock("../../../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  subscribeModelCatalogRefresh: jest.fn(() => () => {}),
}));

// Keep the list + editor as light stubs so this test focuses on the shell.
jest.mock("./custom_provider_list", () => ({
  __esModule: true,
  default: ({ providers }) => (
    <div data-testid="list">{`rows:${providers.length}`}</div>
  ),
}));

jest.mock("./custom_provider_editor", () => ({
  __esModule: true,
  default: ({ open, slug }) =>
    open ? <div data-testid="editor">{`editor:${slug || "new"}`}</div> : null,
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

const renderSection = () =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <CustomProvidersSection />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("CustomProvidersSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readCustomProviders.mockReturnValue([]);
  });

  test("renders the section title and reads providers from the store", () => {
    readCustomProviders.mockReturnValue([{ id: "a" }, { id: "b" }]);
    renderSection();
    expect(screen.getByText("Custom Providers")).toBeTruthy();
    expect(screen.getByTestId("list").textContent).toBe("rows:2");
  });

  test("import and preset entry points are present but disabled (S5)", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Import" }).disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: "From preset" }).disabled,
    ).toBe(true);
  });

  test("clicking Add opens the editor in create mode", () => {
    renderSection();
    expect(screen.queryByTestId("editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByTestId("editor").textContent).toBe("editor:new");
  });
});
