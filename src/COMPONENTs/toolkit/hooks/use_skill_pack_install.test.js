import { act, renderHook } from "@testing-library/react";
import useSkillPackInstall from "./use_skill_pack_install";
import { installStoreSkillPack } from "../utils/skill_pack_store_install";
import { emitToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { toast } from "../../../SERVICEs/toast";

jest.mock("../utils/skill_pack_store_install", () => ({
  __esModule: true,
  installStoreSkillPack: jest.fn(),
}));
jest.mock("../../../SERVICEs/toolkit_catalog_refresh", () => ({
  __esModule: true,
  emitToolkitCatalogRefresh: jest.fn(),
}));
jest.mock("../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

const PACK = { id: "skillpack.test", title: "Test" };
const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const coded = (code) => Object.assign(new Error(code), { code });

test("installs a pack, announces it and refreshes the catalog", async () => {
  installStoreSkillPack.mockResolvedValue({ toolkitName: "Test", skills: [{}, {}] });
  const { result } = renderHook(() => useSkillPackInstall({ t }));

  await act(async () => {
    await result.current.installPack(PACK);
  });

  expect(installStoreSkillPack).toHaveBeenCalledWith(PACK);
  expect(emitToolkitCatalogRefresh).toHaveBeenCalledWith({ source: "skill_pack_store_install" });
  expect(toast.success).toHaveBeenCalledWith('toolkit.import_skills_success:{"count":2,"name":"Test"}');
  expect(result.current.packError).toBeNull();
  expect(result.current.installingPackIds.has(PACK.id)).toBe(false);
});

test("marks the pack as installing while the install is in flight", async () => {
  let finish;
  installStoreSkillPack.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = renderHook(() => useSkillPackInstall({ t }));

  let pending;
  act(() => {
    pending = result.current.installPack(PACK);
  });
  expect(result.current.installingPackIds.has(PACK.id)).toBe(true);

  await act(async () => {
    finish({ toolkitName: "Test", skills: [] });
    await pending;
  });
  expect(result.current.installingPackIds.has(PACK.id)).toBe(false);
});

test("a coded failure surfaces its own code", async () => {
  installStoreSkillPack.mockRejectedValue(coded("integrity"));
  const { result } = renderHook(() => useSkillPackInstall({ t }));

  await act(async () => {
    await result.current.installPack(PACK);
  });

  expect(result.current.packError).toBe("integrity");
  expect(emitToolkitCatalogRefresh).not.toHaveBeenCalled();
});

test("an unknown failure code surfaces as generic", async () => {
  installStoreSkillPack.mockRejectedValue(coded("boom"));
  const { result } = renderHook(() => useSkillPackInstall({ t }));

  await act(async () => {
    await result.current.installPack(PACK);
  });

  expect(result.current.packError).toBe("generic");
});
