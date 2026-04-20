import { render, fireEvent } from "@testing-library/react";
import APIKeyInput from "./api_key_input";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { toast } from "../../../../SERVICEs/toast";

jest.mock("../storage", () => ({
  __esModule: true,
  readModelProviders: () => ({}),
  writeModelProviders: jest.fn(),
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
  });

  it("fires toast.success on Save click with non-empty value", () => {
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

    expect(successSpy).toHaveBeenCalledWith(
      "OpenAI saved",
      expect.objectContaining({
        dedupeKey: "api_key_save_openai_api_key",
      }),
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
