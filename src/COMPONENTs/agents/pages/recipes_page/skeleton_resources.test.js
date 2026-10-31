import {
  CATALOG_MALFORMED,
  diagnose,
  kernel_profiles,
  list_resources,
  edit_conflict_message,
  is_unavailable,
  preflight,
  save_draft,
} from "./skeleton_resources";
import { api } from "../../../../SERVICEs/api";
import { subscribeSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { CAPTURED_KERNEL_CATALOG } from "./kernel_profile_catalog_capture";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

describe("a build that cannot reach the store says so", () => {
  test("a missing bridge method is unavailable, not a refusal", () => {
    /* The two must stay apart: "we could not ask" and "it said no" call for
     * different things from the author. */
    return save_draft({ id: "w" }).then((result) => {
      expect(result).toMatchObject({ ok: false, reason: "unavailable" });
      expect(is_unavailable(result)).toBe(true);
      expect(result.error.message).toMatch(/nothing was saved/i);
    });
  });

  test("the bridge throwing bridge_unavailable is the same verdict", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockRejectedValue(
      Object.assign(new Error("unchainAPI.saveSkeletonResource is unavailable"), {
        code: "bridge_unavailable",
      }),
    );
    expect(is_unavailable(await save_draft({ id: "w" }))).toBe(true);
  });

  test("every call answers, so no caller has to guess", async () => {
    expect(is_unavailable(await diagnose({ id: "w" }))).toBe(true);
    expect(is_unavailable(await preflight("w"))).toBe(true);
  });
});

describe("a save says that the library changed", () => {
  /* Anything showing the saved listing — the chat's Agent row, elsewhere in
   * the same window — has no other way to learn that a resource now exists.
   * Only a store answer counts: a refusal and an unreachable store changed
   * nothing, and announcing them would make every failed save re-read the
   * store for no reason. */
  let announced;
  let unsubscribe;

  beforeEach(() => {
    announced = [];
    unsubscribe = subscribeSkeletonLibraryRefresh((payload) =>
      announced.push(payload),
    );
  });

  afterEach(() => {
    unsubscribe();
  });

  test("a stored save announces, with the id the store assigned", async () => {
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ id: "saved-agent", edit_token: "tok-2" });
    await save_draft({ id: "saved-agent" });
    expect(announced).toEqual([
      { reason: "resource_saved", resource_id: "saved-agent" },
    ]);
  });

  test("a refused save announces nothing", async () => {
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: { code: "edit_conflict" } });
    expect((await save_draft({ id: "w" }, "stale")).ok).toBe(false);
    expect(announced).toEqual([]);
  });

  test("a store this build cannot reach announces nothing", async () => {
    expect(is_unavailable(await save_draft({ id: "w" }))).toBe(true);
    expect(announced).toEqual([]);
  });

  test("an answer with no id still announces: the listing is what gets read", async () => {
    /* The announcement is not the record. A subscriber asks the store, so an
     * answer this call cannot name must not leave the row stale either. */
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ ok: true });
    await save_draft({ id: "w" });
    expect(announced).toEqual([{ reason: "resource_saved", resource_id: "" }]);
  });

  test("a subscriber that throws does not fail the save", async () => {
    const off = subscribeSkeletonLibraryRefresh(() => {
      throw new Error("the page blew up while reacting");
    });
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ id: "saved-agent" });
    await expect(save_draft({ id: "saved-agent" })).resolves.toMatchObject({
      ok: true,
    });
    off();
  });
});

describe("the payloads are the ones the route accepts", () => {
  test("a save without an edit token omits the field rather than sending null", async () => {
    /* The route's body is closed, and `expected_edit_token: null` on a resource
     * that does not exist yet is a 409 rather than a create. */
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ ok: true });
    await save_draft({ id: "w" });
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledWith({ document: { id: "w" } });
  });

  test("a save with an edit token sends it as the compare-and-set", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ ok: true });
    await save_draft({ id: "w" }, "tok-1");
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledWith({
      document: { id: "w" },
      expected_edit_token: "tok-1",
    });
  });

  test("diagnose sends the document and answers with the list", async () => {
    api.unchain.diagnoseSkeletonResource = jest.fn().mockResolvedValue({
      diagnostics: [{ code: "end_count", path: ["document", "nodes"], message: "needs one end" }],
    });
    const result = await diagnose({ id: "w" });
    expect(api.unchain.diagnoseSkeletonResource).toHaveBeenCalledWith({ id: "w" });
    expect(result.data).toEqual([
      { code: "end_count", path: ["document", "nodes"], message: "needs one end" },
    ]);
  });

  test("preflight sends null rather than undefined for no legacy kernel", async () => {
    api.unchain.preflightSkeletonResource = jest.fn().mockResolvedValue({ ok: true });
    await preflight("w");
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("w", null);
  });
});

describe("a refusal is reported as one", () => {
  test("an error body is a refusal, not a success with an error inside", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({
      error: { code: "edit_conflict", path: ["expected_edit_token"], message: "stale" },
    });
    const result = await save_draft({ id: "w" }, "old");
    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(result.error.code).toBe("edit_conflict");
  });

  test("a thrown store error is a refusal too", async () => {
    api.unchain.diagnoseSkeletonResource = jest.fn().mockRejectedValue(
      Object.assign(new Error("boom"), { code: "skeleton_store_failed" }),
    );
    const result = await diagnose({ id: "w" });
    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(result.error.code).toBe("skeleton_store_failed");
  });

  test("an edit conflict is explained in terms of the other edit", () => {
    expect(edit_conflict_message({ code: "edit_conflict" })).toMatch(/changed elsewhere/i);
    expect(edit_conflict_message({ code: "invalid_type" })).toBeNull();
    expect(edit_conflict_message(null)).toBeNull();
  });

  test("a plain answer is passed through", async () => {
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ ok: true, edit_token: "t2" });
    expect(await save_draft({ id: "w" })).toEqual({
      ok: true,
      data: { ok: true, edit_token: "t2" },
    });
  });
});

describe("listing the resources a Subagent Pool can reference", () => {
  test("a build with no bridge method says it could not ask", () => {
    /* Not an empty library. An account with no Agents and a build that cannot
       reach the store look identical to a caller that flattens them, and only
       one of the two is worth telling the author about. */
    return list_resources().then((result) => {
      expect(is_unavailable(result)).toBe(true);
    });
  });

  test("the store's own envelope is handed through as it is", async () => {
    /* `{resources: [...]}` is what the route returns and what the bridge
       guarantees; nothing here reshapes it into an array. */
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({
      resources: [{ id: "res-1", kind: "agent", name: "Summarizer" }],
    });
    const result = await list_resources();
    expect(result).toMatchObject({ ok: true });
    expect(result.data.resources[0].kind).toBe("agent");
  });

  test("archived resources are left out of the request, not filtered after", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
    await list_resources();
    expect(api.unchain.listSkeletonResources).toHaveBeenCalledWith(false);
    await list_resources(true);
    expect(api.unchain.listSkeletonResources).toHaveBeenLastCalledWith(true);
  });

  test("a refusal is a refusal, not an empty library", async () => {
    api.unchain.listSkeletonResources = jest.fn().mockRejectedValue(
      Object.assign(new Error("the store is locked"), { code: "skeleton_store_failed", path: [] }),
    );
    const result = await list_resources();
    expect(result).toMatchObject({ ok: false, reason: "refused" });
    expect(result.error.message).toMatch(/locked/);
  });
});


describe("the Kernel profiles this build can offer", () => {
  const profile = (over) => ({
    id: "openai:gpt-6-sol",
    provider: "openai",
    model: "gpt-6-sol",
    protocol: "openai-responses",
    endpoint: "https://api.openai.com/v1",
    credential_ref: "openai",
    context_window: 1050000,
    output_limit: 128000,
    capabilities: { json_schema: true, images: true, files: false },
    ...over,
  });

  test("a build with no bridge method says it could not ask", async () => {
    expect(is_unavailable(await kernel_profiles())).toBe(true);
  });

  test("a profile both sides admit is offered unchanged", async () => {
    const offered = profile();
    api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({
      profiles: [offered],
      unavailable: [],
    }));
    const result = await kernel_profiles();
    expect(result.data.profiles).toEqual([offered]);
    expect(result.data.unavailable).toEqual([]);
  });

  test("a profile the editor's own rules refuse becomes a row saying why", async () => {
    /* The producer checks every profile with the runtime's validator before
       offering it, so this cannot happen while the two agree. It is exactly
       the case where they do not — a wheel whose rules moved — and the
       author gets a reason instead of a picker that writes a kernel which
       cannot be saved. */
    api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({
      profiles: [profile({ endpoint: "https://api.openai.com/v1?key=secret" })],
      unavailable: [],
    }));
    const result = await kernel_profiles();
    expect(result.data.profiles).toEqual([]);
    expect(result.data.unavailable).toEqual([
      {
        id: "openai:gpt-6-sol",
        provider: "openai",
        model: "gpt-6-sol",
        reason: "profile_refused",
        code: "invalid_value",
        path: "kernel.profile.endpoint",
      },
    ]);
  });

  test("the producer's own reasons are carried through untouched", async () => {
    const reason = {
      id: "openai:gpt-5",
      provider: "openai",
      model: "gpt-5",
      reason: "output_limit_unknown",
    };
    api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({
      profiles: [],
      unavailable: [reason],
    }));
    const result = await kernel_profiles();
    expect(result.data.unavailable).toEqual([reason]);
  });

  test("a refusal is a refusal, not an empty catalog", async () => {
    api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({
      error: { code: "unauthorized", message: "no" },
    }));
    const result = await kernel_profiles();
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("unauthorized");
  });

  /* And neither is an answer that is not a catalog. Two empty lists is how
     "this build can configure no model" is said, so an unreadable answer must
     not be able to wear it — the panel would state the one about the other,
     which is what a negative test found it doing. Asked here as well as in
     the facade: a consumer that trusts its transport to have checked the
     shape is not a strict consumer. */
  [
    ["neither half", {}],
    ["only the profiles", { profiles: [] }],
    ["only the refusals", { unavailable: [] }],
    ["a profiles half that is not a list", { profiles: {}, unavailable: [] }],
    ["a refusals half that is not a list", { profiles: [], unavailable: 0 }],
    ["a profile that is not an object", { profiles: ["openai"], unavailable: [] }],
    ["a profile that is a list", { profiles: [[]], unavailable: [] }],
    ["a refusal that is not an object", { profiles: [], unavailable: ["gpt-5"] }],
    ["nothing at all", null],
    ["a list", []],
    ["a string", "profiles"],
    ["a number", 7],
  ].forEach(([what, answer]) => {
    test(`an answer with ${what} is refused, not emptied`, async () => {
      api.unchain.listSkeletonKernelProfiles = jest.fn(async () => answer);
      const result = await kernel_profiles();
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("refused");
      expect(result.error.code).toBe(CATALOG_MALFORMED);
      expect(result.error.message).toMatch(/not a list of Kernel profiles/i);
    });
  });

  /* The direction a stricter consumer can break: it must still accept the
     real producer's own bytes. `CAPTURED_KERNEL_CATALOG` is what the route
     answered on the pinned pair, after JSON. */
  test("the real catalog passes the strict consumer whole", async () => {
    api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({
      profiles: CAPTURED_KERNEL_CATALOG.profiles.map((item) => ({ ...item })),
      unavailable: CAPTURED_KERNEL_CATALOG.unavailable.map((item) => ({ ...item })),
    }));
    const result = await kernel_profiles();
    expect(result.ok).toBe(true);
    expect(result.data.profiles).toHaveLength(CAPTURED_KERNEL_CATALOG.profiles.length);
    expect(result.data.unavailable).toHaveLength(
      CAPTURED_KERNEL_CATALOG.unavailable.length,
    );
    expect(
      result.data.unavailable.some((row) => row.reason === "profile_refused"),
    ).toBe(false);
  });

  test("an empty catalog is an answer, because it says something true", async () => {
    api.unchain.listSkeletonKernelProfiles = jest.fn(async () => ({
      profiles: [],
      unavailable: [],
    }));
    const result = await kernel_profiles();
    expect(result).toEqual({ ok: true, data: { profiles: [], unavailable: [] } });
  });
});
