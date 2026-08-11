import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import APIKeyInput from "./api_key_input";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { toast } from "../../../../SERVICEs/toast";
import { writeModelProviders } from "../storage";
import { providerSecretConfigured } from "../../../../SERVICEs/provider_secret_status";

jest.mock("../storage", () => ({
  __esModule: true,
  readModelProviders: () => ({}),
  writeModelProviders: jest.fn(() => Promise.resolve([{ ok: true }])),
}));

jest.mock("../../../../SERVICEs/provider_secret_status", () => ({
  __esModule: true,
  providerSecretConfigured: jest.fn(() => false),
}));

jest.mock("../../../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  emitModelCatalogRefresh: jest.fn(),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (k) => k }),
}));

describe("APIKeyInput save feedback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    writeModelProviders.mockResolvedValue([{ ok: true }]);
    providerSecretConfigured.mockReturnValue(false);
  });

  it("shows a SQL-only credential as securely saved without reading plaintext", () => {
    providerSecretConfigured.mockImplementation((id) => id === "openai");

    render(
      <ConfigContext.Provider
        value={{ theme: {}, onThemeMode: "light_mode" }}
      >
        <APIKeyInput
          storage_key="openai_api_key"
          label="OpenAI"
          placeholder="sk-..."
        />
      </ConfigContext.Provider>,
    );

    const input = screen.getByPlaceholderText("••••••••");
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("••••••••");
    expect(screen.getByText("✓ model_providers.saved")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "model_providers.clear" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "model_providers.save" }),
    ).toBeDisabled();
  });

  it("fires toast.success on Save click with non-empty value", async () => {
    const successSpy = jest
      .spyOn(toast, "success")
      .mockImplementation(() => "id-1");

    const { container } = render(
      <ConfigContext.Provider
        value={{ theme: {}, onThemeMode: "light_mode" }}
      >
        <APIKeyInput
          storage_key="openai_api_key"
          label="OpenAI"
          placeholder="sk-..."
        />
      </ConfigContext.Provider>,
    );

    const input = container.querySelector('input[type="password"]');
    fireEvent.change(input, { target: { value: "sk-test-123" } });

    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent || "").includes("model_providers.save"),
    );
    expect(saveBtn).toBeTruthy();
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(successSpy).toHaveBeenCalledWith(
        "OpenAI saved",
        expect.objectContaining({
          dedupeKey: "api_key_save_openai_api_key",
        }),
      ),
    );

    successSpy.mockRestore();
  });

  it("does not fire toast.success when saving an empty value", () => {
    const successSpy = jest
      .spyOn(toast, "success")
      .mockImplementation(() => "id-2");

    const { container } = render(
      <ConfigContext.Provider
        value={{ theme: {}, onThemeMode: "light_mode" }}
      >
        <APIKeyInput
          storage_key="openai_api_key"
          label="OpenAI"
          placeholder="sk-..."
        />
      </ConfigContext.Provider>,
    );

    const saveBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent || "").includes("model_providers.save"),
    );
    fireEvent.click(saveBtn);

    expect(successSpy).not.toHaveBeenCalled();

    successSpy.mockRestore();
  });
});
