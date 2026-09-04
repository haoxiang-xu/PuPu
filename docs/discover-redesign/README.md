# Plugins · Discover — redesign exploration

Design artifacts for the Plugins **Discover** page redesign
([#207](https://github.com/haoxiang-xu/PuPu/issues/207), release v0.1.11).
These are exploration mockups, not shipping code — no PuPu source file imports
them.

## How to view

Open either HTML directly in a browser, or serve the repo root:

```bash
python3 -m http.server 4173
# → http://127.0.0.1:4173/docs/discover-redesign/index.html
```

Both pages have a Dark / Light toggle. Every mock is rendered at the real
**600 × 600** modal size that `toolkit_modal.js` locks, using the real palette
values from `semantic_tokens.js` and the real plugin icons read out of
`mcp_toolkit_registry.json`.

| File | What it is |
|---|---|
| `index.html` | Nine directions. Options 5–9 are the imaginative set, 1–4 the conservative set (appendix thumbnails). |
| `constellation.html` | Deep-dive on option 8 (Constellation): six interaction states, the deterministic layout rule, and the unresolved list. |
| `core.js` | Shared modal chrome + options 1–4. Exposes `window.PD_MOCK`. |
| `bold.js` | Options 5–9. |
| `sky.js` | Constellation states. |
| `pd_icons.js` | Generated snapshot of registry entries + icons, so mocks show real artwork. Regenerate if the registry changes. |
| `current.png` | Real screenshot of the shipping Discover page (dev instance, 2026-08-21) — the "before". |

## Constraints the mocks are built against

1. **Canvas is 460 × 523.** `toolkit_modal.js` locks the modal to 600 × 600
   (`minWidth === maxWidth`); the 140px sidebar and page header take the rest.
2. **7 of 18 registry entries intentionally render the same grey `mcp` glyph.**
   Per the icon brand-attribution rule landed in `ccac3ede`, an entry may only
   carry a genuine publisher logo; monogram and derived-tint schemes were
   explicitly rejected. **A layout that relies on icons for scannability will
   not work here.** Each option is annotated with how it handles this.
3. **Zero-credential invariant.** Every `essentials` and `collections` entry must
   be `available + installable + secrets.length === 0` (enforced by
   `plugin_presentation.test.js`); `featured` is exempt because the whole card
   routes to detail.

## Known gap the mocks surface

`plugins_discover_page.js` reads `featured`, `essentials` and `collections` from
`plugin_store_curation.json` but never reads `skillPacks` — the three curated
skill packs have no entry point on Discover today. Every option restores one.

## Note on the numbers

The "首屏可点单元" figures on the option pages are measured in-browser at render
time (elements fully inside the 600px fold), not typed in. They are **not**
comparable across options — a constellation node and a conversation vignette are
not the same unit. They exist only to confirm each layout actually fills the
canvas.

Background star dust in the constellation mocks uses a fixed-seed LCG, not
`Math.random()`, so screenshots are reproducible for visual diffing.
