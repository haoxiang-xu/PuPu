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
    /* Confirmation-required tools carry a ⚠ suffix — restores the old
       store_toolkit_detail_panel.js per-tool 🔒 warning semantics that this
       page's canDo list otherwise drops (see plugin_detail_page.js). */
    expect(p.canDo).toEqual(["Plan Start", "Plan finalize ⚠"]);
    expect(JSON.stringify(p.canDo)).not.toMatch(/plan_/);
  });

  test("marks canDo items for tools requiring confirmation with a ⚠ suffix, leaving others untouched", () => {
    const entry = {
      toolkitId: "x",
      toolkitName: "X",
      source: "builtin",
      tools: [
        { name: "safe_op", title: "Safe Op", requiresConfirmation: false },
        { name: "risky_op", title: "Risky Op", requiresConfirmation: true },
      ],
    };
    const p = toPluginPresentation(entry);
    expect(p.canDo).toEqual(["Safe Op", "Risky Op ⚠"]);
  });
  test("tagline is first sentence, capped at 64 chars with an ellipsis", () => {
    /* ENTRY's first sentence is 73 chars — longer than the 64-char cap, so
       it gets truncated at the last word boundary and suffixed with "…". */
    expect(toPluginPresentation(ENTRY).tagline).toBe(
      "Workspace-backed planning: draft, refine and finalize…",
    );
  });
  test("a first sentence at or under 64 chars is left untouched", () => {
    const entry = {
      toolkitId: "x",
      toolkitName: "X",
      toolkitDescription: "Short and sweet plugin description.",
      source: "builtin",
    };
    expect(toPluginPresentation(entry).tagline).toBe(
      "Short and sweet plugin description.",
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
  test("icon reads the catalog's toolkitIcon field, not a nonexistent icon field", () => {
    const p = toPluginPresentation({ ...ENTRY, toolkitIcon: { type: "builtin", name: "plan" } });
    expect(p.icon).toEqual({ type: "builtin", name: "plan" });
  });
  test("tolerates a null source without throwing", () => {
    expect(() =>
      toPluginPresentation({ toolkitId: "x", toolkitName: "X", source: null }),
    ).not.toThrow();
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
