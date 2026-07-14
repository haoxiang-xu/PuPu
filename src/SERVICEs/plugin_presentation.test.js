import { toPluginPresentation, loadStoreCuration } from "./plugin_presentation";

const ENTRY = {
  toolkitId: "plan",
  toolkitName: "Plan",
  toolkitDescription: "Workspace-backed planning: draft, refine and finalize step-by-step plans. Second sentence ignored.",
  source: "builtin",
  tools: [
    { name: "plan_start", title: "Plan Start", requiresConfirmation: false },
    { name: "plan_finalize", title: "", requiresConfirmation: true },
  ],
  skills: [
    { name: "plan", title: "Plan First", description: "Draft a plan first.", body: "...", tools: [], phase: "composer" },
  ],
};

describe("toPluginPresentation", () => {
  test("maps skills to /commands and tools to canDo without function names", () => {
    const p = toPluginPresentation(ENTRY);
    expect(p.commands).toEqual([
      { name: "/plan", title: "Plan First", description: "Draft a plan first." },
    ]);
    expect(p.commandCount).toBe(1);
    expect(p.canDo).toEqual(["Plan Start", "Plan finalize"]);
    expect(JSON.stringify(p.canDo)).not.toMatch(/plan_/);
  });
  test("tagline is first sentence, capped", () => {
    expect(toPluginPresentation(ENTRY).tagline).toBe(
      "Workspace-backed planning: draft, refine and finalize step-by-step plans.",
    );
  });
  test("information includes provider and confirmation rows", () => {
    const rows = toPluginPresentation(ENTRY).information;
    expect(rows).toContainEqual({ k: "Provider", v: "PuPu built-in" });
    expect(rows.find((r) => r.k === "Requires confirmation").v).toBe("Plan finalize");
  });
  test("tolerates missing skills/tools", () => {
    const p = toPluginPresentation({ toolkitId: "x", toolkitName: "X", source: "mcp" });
    expect(p.commands).toEqual([]);
    expect(p.canDo).toEqual([]);
  });
});

describe("loadStoreCuration", () => {
  test("returns curated shape with featured/essentials/collections", () => {
    const c = loadStoreCuration();
    expect(c.featured.pluginId).toBeTruthy();
    expect(Array.isArray(c.essentials)).toBe(true);
    expect(c.collections.length).toBeGreaterThan(0);
    expect(c.collections[0].gradient).toHaveLength(2);
  });
});
