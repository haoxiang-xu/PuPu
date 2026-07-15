import { exportCustomProvider } from "./export_provider";
import { runtimeBridge } from "../../../../SERVICEs/bridges/unchain_bridge";
import { buildProviderExportPayload } from "../../../../SERVICEs/custom_provider_store";

jest.mock("../../../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isExportImportAvailable: jest.fn(() => true),
    showSaveDialog: jest.fn(),
    writeFile: jest.fn(),
  },
}));

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  buildProviderExportPayload: jest.fn(),
}));

describe("exportCustomProvider", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns not_found when the slug has no payload", async () => {
    buildProviderExportPayload.mockReturnValue(null);
    const r = await exportCustomProvider("missing");
    expect(r).toEqual({ ok: false, error: "not_found" });
  });

  test("Electron path writes to the chosen file with the pupu-provider-<slug>.json name", async () => {
    buildProviderExportPayload.mockReturnValue({ format: "pupu-model-provider", provider: { id: "prov" } });
    runtimeBridge.isExportImportAvailable.mockReturnValue(true);
    runtimeBridge.showSaveDialog.mockResolvedValue({ canceled: false, filePath: "/tmp/out.json" });
    runtimeBridge.writeFile.mockResolvedValue({ ok: true });

    const r = await exportCustomProvider("prov");

    expect(runtimeBridge.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "pupu-provider-prov.json" }),
    );
    expect(runtimeBridge.writeFile).toHaveBeenCalledWith(
      "/tmp/out.json",
      expect.stringContaining('"format": "pupu-model-provider"'),
    );
    expect(r).toEqual({ ok: true, via: "dialog" });
  });

  test("canceled dialog returns canceled", async () => {
    buildProviderExportPayload.mockReturnValue({ provider: { id: "prov" } });
    runtimeBridge.isExportImportAvailable.mockReturnValue(true);
    runtimeBridge.showSaveDialog.mockResolvedValue({ canceled: true });
    const r = await exportCustomProvider("prov");
    expect(r).toEqual({ ok: false, error: "canceled" });
    expect(runtimeBridge.writeFile).not.toHaveBeenCalled();
  });

  test("falls back to a Blob download when the bridge is unavailable", async () => {
    buildProviderExportPayload.mockReturnValue({ provider: { id: "prov" } });
    runtimeBridge.isExportImportAvailable.mockReturnValue(false);

    const clickSpy = jest.fn();
    const origCreate = document.createElement.bind(document);
    jest.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = origCreate(tag);
      if (tag === "a") {
        el.click = clickSpy;
      }
      return el;
    });
    global.URL.createObjectURL = jest.fn(() => "blob:x");
    global.URL.revokeObjectURL = jest.fn();

    const r = await exportCustomProvider("prov");

    expect(clickSpy).toHaveBeenCalled();
    expect(r).toEqual({ ok: true, via: "download" });

    document.createElement.mockRestore();
  });
});
