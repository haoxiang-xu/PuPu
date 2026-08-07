---
name: store-icon-honesty-policy
description: CEO rule (2026-07-28) — registry entries may only carry a GENUINE official logo; no logo means omit `icon` and show the default grey mcp glyph. No monogram/generated placeholders.
metadata:
  type: project
---

A store registry entry may carry an `icon` **only if a genuine official brand logo exists**. If there is none, the entry omits `icon` and renders the generic grey mcp glyph. Self-made marks, borrowed third-party brand marks, monograms, and generated/derived placeholders are all rejected.

**Why:** CEO call on 2026-07-28, looking at the plugin store screenshot: "除了 Slack 是官方 icon，其他大部分都不是，这些就要用默认的 mcp icon。也就是不设置 icon，让他显示默认的 mcp icon。" Honesty about provenance beats shelf distinguishability. He was shown UX evidence that ~8 identical grey tiles are unscannable and chose it anyway. Two richer alternatives were explicitly **overruled**: a deterministic-tint identity chip (`mcp_identity_icon.js`, built then deleted) and pupu-ux-designer's "Register C" monogram scheme (half-tint wash + hairline + two-letter monogram — archived in that agent's memory, **do not implement**).

Two refinements from the 2026-07-29 execution pass:

- **Officialness applies to the COMBINATION, not just the shape.** Browser Use kept its verified-official mark but was recoloured, because the shipped tile paired the official mark with `#FE750E` — an accent that appears nowhere on browser-use.com (it is only their Mintlify *docs* theme colour). An official shape in a colourway the vendor never uses still reads as fabricated. Their real renderings are monochrome, so the mark became `#ffffff` on their own `#18181B`, which also matches the other dark bricks (github/notion/slack are all `#ffffff` on a dark brand ground).
- **Using a real brand's logo for a third-party community implementation is itself a misattribution.** Discord and Telegram were cleared for this reason: the servers are `IQAIcom/mcp-*`, and the official Discord/Telegram logos made them look first-party. This criterion is *broader* than "is the logo genuine" — a genuine logo can still be the wrong logo.

Final state: 11 of 18 entries declare an icon; 7 show the grey glyph (Filesystem, Memory, Fetch, SQLite, MarkItDown, Discord, Telegram).

**How to apply:** Do not re-propose derived/generated/monogram placeholders for missing logos — it is a settled call, not an open design question. When recolouring any brick, check the mark's fill against the brick's fill — the two colliding renders a fully invisible tile and only a dedicated contrast assertion catches it. Omitting `icon` needs zero code: `normalizeEntry` leaves `toolkitIcon` undefined, `isExplicitMcpIcon` rejects undefined, and `resolveMcpIcon` falls to `DEFAULT_MCP_ICON`. The schema never required `icon` and `validate-mcp-registry.cjs` does not check it. See [[store-icon-test-sample-trap]] for the test-coupling hazard this creates, and [[registry-entry-cannot-get-user-icon]] for the recourse gap worth re-raising if the grey wall becomes a real complaint.
