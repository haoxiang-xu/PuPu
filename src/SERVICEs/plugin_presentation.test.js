import { toPluginPresentation, loadStoreCuration } from "./plugin_presentation";
import registry from "./mcp_toolkit_registry.json";

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
    /* Confirmation-required tools carry `confirm: true` — the structured
       successor to the old inline "label ⚠" string suffix, so the detail
       page's About tag cloud can style the ⚠ marker on its own (see
       plugin_detail_page.js). */
    expect(p.canDo).toEqual([
      { label: "Plan Start", confirm: false },
      { label: "Plan finalize", confirm: true },
    ]);
    expect(JSON.stringify(p.canDo)).not.toMatch(/plan_/);
  });

  test("marks canDo items for tools requiring confirmation with confirm:true, leaving others untouched", () => {
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
    expect(p.canDo).toEqual([
      { label: "Safe Op", confirm: false },
      { label: "Risky Op", confirm: true },
    ]);
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

  test("essentials + collections recommend only credential-free one-click MCP entries", () => {
    /* The one-click contract applies to surfaces that carry an INLINE install
       pill — the Essentials grid and Collection member rows. Those must be
       status:available, installable, and require zero credentials so a first
       install never dead-ends in a setup/OAuth flow. The Featured hero is
       exempt (see the next test): it has no inline pill — the whole card opens
       the detail page, where any credential setup lives. */
    const c = loadStoreCuration();
    const inlineInstallIds = new Set([
      ...c.essentials,
      ...c.collections.flatMap((collection) => collection.pluginIds),
    ].filter(Boolean));
    const entriesByToolkitId = new Map(
      registry.entries.map((entry) => [entry.toolkitId, entry]),
    );

    expect([...inlineInstallIds].sort()).toEqual([
      "mcp.browser.chrome-devtools",
      "mcp.browser.playwright",
      "mcp.memory.memory",
      "mcp.workspace.fetch",
      "mcp.workspace.filesystem",
      "mcp.workspace.markitdown",
      "mcp.workspace.sqlite",
    ]);
    for (const toolkitId of inlineInstallIds) {
      const entry = entriesByToolkitId.get(toolkitId);
      expect(entry).toMatchObject({ status: "available", installable: true });
      expect(entry.secrets || []).toHaveLength(0);
    }
  });

  test("featured hero is a real installable entry (credentials allowed — routes to detail)", () => {
    /* Featured may require credentials because the card opens the detail page
       rather than installing inline, but it must still be a genuine,
       installable, available plugin — never a coming_soon or non-installable
       stub on the most prominent slot. */
    const c = loadStoreCuration();
    const entriesByToolkitId = new Map(
      registry.entries.map((entry) => [entry.toolkitId, entry]),
    );
    const featured = entriesByToolkitId.get(c.featured?.pluginId);
    expect(featured).toMatchObject({ status: "available", installable: true });
  });
});
