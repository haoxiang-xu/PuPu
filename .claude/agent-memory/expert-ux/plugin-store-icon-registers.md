---
name: plugin-store-icon-registers
description: Plugin store icons have TWO visual registers (opaque brand tile vs inset glyph on neutral frame); the generated no-logo default is a THIRD, deliberately quieter register — monogram wash tile with validated 10-slot palette
metadata:
  type: feedback
---

The plugin store's icon language has two registers that already existed, plus a third I
defined for logo-less entries. Keep them separate — the separation IS the anti-impersonation
mechanism.

- **Register A — brand tile.** Full-bleed, opaque, saturated, edge-to-edge SVG at the caller's
  `borderRadius` (Figma, Filesystem, Memory, SQLite, Browser Use). The brand owns the surface.
- **Register B — brand glyph.** Monochrome mark inset at `displayScale: 0.82` on the neutral
  `rgba(var(--pupu-text-rgb),0.04/0.05)` frame (simple-icons sourced: Vercel, Sentry, Grafana,
  Discord, Telegram, Netdata, Chrome DevTools).
- **Register C — generated default.** Deterministic monogram on a *translucent* hue wash +
  1px inset hairline, monospace uppercase. Never opaque, never full-bleed.

**Why:** CEO unbound curation 2026-07-28 ("no official logo → just use the default"). The real
risk was the pre-existing `DEFAULT_MCP_ICON` (`{type:"builtin", name:"mcp", color:"#9aa0a6",
backgroundColor:"transparent"}`) — one identical grey glyph for every logo-less entry, so a
grid of them visually collapses. Register C solves that without letting a generated tile
masquerade as a real brand mark: translucency + hairline + monospace duo-letters is a register
no real brand icon in the registry occupies.

**Correction worth remembering:** the three `type:"builtin"` registry entries (GitHub, Notion,
Slack) are NOT a "no official logo" fallback form — they are *official brand marks* delivered
via `LogoSVGs` with real brand background colors (#1f2328 / #191919 / #4A154B). Anyone who
proposes "just reuse the existing builtin-glyph shape for logo-less entries" is reading that
wrong; copying it would impersonate.

**Approved parameters (measured, screenshot-verified, both themes):**
- Wash alpha 0.16 both themes; hairline alpha 0.26 light / 0.24 dark, as
  `boxShadow: inset 0 0 0 1px`. Light wash 0.12 was rejected — it disappears on the `#f5f5f5`
  sidebar ground. 0.20 was rejected — it starts competing with brand tiles.
- 10-slot ink palette, hues [355,20,42,95,152,188,215,248,282,322]:
  - light `["#a12b35","#894624","#6f561d","#38631a","#1b6542","#1d626d","#29599b","#5240cc","#842da9","#9b2971"]`
  - dark  `["#df9aa0","#dfb19a","#dfca9a","#b7df9a","#9adfbf","#9ad6df","#9ab7df","#a39adf","#ca9adf","#df9ac6"]`
  - Dark is constant HSL L=74 S=52 (uniform visual weight); light must vary L per hue — dark
    ink on a light ground physically cannot hold contrast at constant lightness for yellows/greens.
  - Worst-case contrast on the composited wash across all five semantic-theme grounds:
    4.81 light / 4.77 dark. Passes AA text even though a tile glyph only needs 3:1.
- Font `ui-monospace, SFMono-Regular, Menlo, monospace`, weight 600, size `round(size*0.40)`
  for 2 chars / `round(size*0.46)` for 1, `letterSpacing: size>=32 ? 0.5 : 0`, plus
  `textIndent: 0.05em` to cancel the trailing letter-space.
- 2 characters at frame `size >= 24`, 1 character below (20px tool-pool cells).

**How to apply:** any new "we have no artwork for this" surface (plugin store, custom MCP,
skill packs, characters) should reuse Register C rather than inventing another placeholder.
Rejected alternatives and why: geometric/abstract glyphs (a triangle *is* Vercel's real logo in
this very registry — abstract shapes impersonate harder than letters do); identicon pixel
patterns (illegible at 20px, alien to the icon language); dashed border (mush below 28px).
See [[command-chip-green-palette]] for the other place a deterministic per-item color exists.
