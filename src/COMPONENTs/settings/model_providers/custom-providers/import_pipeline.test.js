import {
  parseImportText,
  validateImport,
  deriveFreeSlug,
  classifyConflict,
  endpointChanged,
  commitImport,
} from "./import_pipeline";
import {
  readCustomProviders,
  findCustomProvider,
  addCustomProvider,
  updateCustomProvider,
  normalizeCustomProvider,
  removeCustomProviderSecret,
} from "../../../../SERVICEs/custom_provider_store";

jest.mock("../../../../SERVICEs/custom_provider_store", () => ({
  __esModule: true,
  readCustomProviders: jest.fn(() => []),
  findCustomProvider: jest.fn(() => null),
  addCustomProvider: jest.fn(),
  updateCustomProvider: jest.fn(),
  normalizeCustomProvider: jest.fn(),
  setCustomProviderEnabled: jest.fn(),
  removeCustomProviderSecret: jest.fn(),
}));

const providerDef = (overrides = {}) => ({
  id: "prov",
  display_name: "Prov",
  protocol: "anthropic",
  base_url: "http://localhost:6655/anthropic",
  auth: { mode: "x-api-key" },
  models: [{ id: "m1" }],
  ...overrides,
});

describe("parseImportText", () => {
  test("rejects empty input", () => {
    const r = parseImportText("   ");
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].code).toBe("empty_input");
  });
  test("rejects invalid JSON", () => {
    const r = parseImportText("{not json");
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].code).toBe("invalid_json");
  });
  test("parses valid JSON", () => {
    const r = parseImportText('{"a":1}');
    expect(r).toEqual({ ok: true, data: { a: 1 } });
  });
});

describe("validateImport delegates to the store normalizer", () => {
  test("passes raw through normalizeCustomProvider", () => {
    normalizeCustomProvider.mockReturnValue({ ok: true, provider: providerDef(), diagnostics: [] });
    const r = validateImport({ foo: "bar" });
    expect(normalizeCustomProvider).toHaveBeenCalledWith({ foo: "bar" });
    expect(r.ok).toBe(true);
  });
});

describe("endpointChanged", () => {
  test("false when base_url/auth/headers identical", () => {
    expect(endpointChanged(providerDef(), providerDef())).toBe(false);
  });
  test("true when base_url differs", () => {
    expect(
      endpointChanged(providerDef(), providerDef({ base_url: "https://evil.example" })),
    ).toBe(true);
  });
  test("true when auth differs", () => {
    expect(
      endpointChanged(providerDef(), providerDef({ auth: { mode: "bearer" } })),
    ).toBe(true);
  });
  test("true when extra_headers differ", () => {
    expect(
      endpointChanged(
        providerDef({ extra_headers: { "X-A": "1" } }),
        providerDef({ extra_headers: { "X-A": "2" } }),
      ),
    ).toBe(true);
  });
});

describe("deriveFreeSlug", () => {
  beforeEach(() => jest.clearAllMocks());
  test("appends -2 when the base is taken", () => {
    readCustomProviders.mockReturnValue([{ id: "prov" }]);
    expect(deriveFreeSlug("prov")).toBe("prov-2");
  });
  test("skips to -3 when -2 also taken", () => {
    readCustomProviders.mockReturnValue([{ id: "prov" }, { id: "prov-2" }]);
    expect(deriveFreeSlug("prov")).toBe("prov-3");
  });
  test("truncates a long base to keep within the 32-char cap", () => {
    readCustomProviders.mockReturnValue([]);
    const base = "a".repeat(32);
    const slug = deriveFreeSlug(base);
    expect(slug.length).toBeLessThanOrEqual(32);
    expect(slug.endsWith("-2")).toBe(true);
  });
});

describe("classifyConflict", () => {
  beforeEach(() => jest.clearAllMocks());
  test("new when id is free", () => {
    findCustomProvider.mockReturnValue(null);
    expect(classifyConflict(providerDef())).toEqual({ kind: "new" });
  });
  test("conflict with changed=true on endpoint change", () => {
    findCustomProvider.mockReturnValue(providerDef());
    const r = classifyConflict(providerDef({ base_url: "https://other" }));
    expect(r.kind).toBe("conflict");
    expect(r.changed).toBe(true);
  });
  test("conflict with changed=false when identical endpoint", () => {
    findCustomProvider.mockReturnValue(providerDef());
    const r = classifyConflict(providerDef({ display_name: "New name" }));
    expect(r.kind).toBe("conflict");
    expect(r.changed).toBe(false);
  });
});

describe("commitImport", () => {
  beforeEach(() => jest.clearAllMocks());

  test("new: adds disabled with the given source", () => {
    const r = commitImport(providerDef(), "new", { source: "preset" });
    expect(addCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prov", enabled: false, source: "preset" }),
    );
    expect(r).toEqual({
      ok: true,
      slug: "prov",
      requiresKey: true,
      endpointChanged: false,
    });
  });

  test("overwrite with changed endpoint: forces disabled + wipes secret (FM20)", () => {
    findCustomProvider.mockReturnValue(providerDef({ enabled: true }));
    const incoming = providerDef({ base_url: "https://new.example" });
    const r = commitImport(incoming, "overwrite");
    expect(removeCustomProviderSecret).toHaveBeenCalledWith("prov");
    expect(updateCustomProvider).toHaveBeenCalledWith(
      "prov",
      expect.objectContaining({ enabled: false }),
    );
    expect(r.endpointChanged).toBe(true);
  });

  test("overwrite with same endpoint: preserves enabled, no secret wipe", () => {
    findCustomProvider.mockReturnValue(providerDef({ enabled: true }));
    const incoming = providerDef({ display_name: "Renamed" });
    const r = commitImport(incoming, "overwrite");
    expect(removeCustomProviderSecret).not.toHaveBeenCalled();
    expect(updateCustomProvider).toHaveBeenCalledWith(
      "prov",
      expect.objectContaining({ enabled: true }),
    );
    expect(r.endpointChanged).toBe(false);
  });

  test("rename: re-normalizes with a free slug and adds disabled", () => {
    readCustomProviders.mockReturnValue([{ id: "prov" }]);
    normalizeCustomProvider.mockReturnValue({
      ok: true,
      provider: providerDef({ id: "prov-2" }),
      diagnostics: [],
    });
    const r = commitImport(providerDef(), "rename", { source: "import" });
    expect(normalizeCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prov-2" }),
    );
    expect(addCustomProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: "prov-2", enabled: false, source: "import" }),
    );
    expect(r.slug).toBe("prov-2");
  });

  test("new: surfaces store errors (e.g. provider_id_exists) as diagnostics", () => {
    addCustomProvider.mockImplementation(() => {
      const e = new Error("Provider id already exists: prov");
      e.code = "provider_id_exists";
      throw e;
    });
    const r = commitImport(providerDef(), "new");
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].code).toBe("provider_id_exists");
  });
});
