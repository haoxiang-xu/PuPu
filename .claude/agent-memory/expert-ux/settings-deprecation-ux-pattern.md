---
name: settings-deprecation-ux-pattern
description: How to deprecate/retire Settings controls behind a feature flag in PuPu — legacy note section, "(Legacy)" title suffix, untranslated flag-gated copy, and the secondary-text contrast ladder
metadata:
  type: project
---

When a feature flag supersedes existing Settings controls (first case: `enable_memory_v2`
retiring the Memory "Context Strategy" short-term controls), the established shape is:

1. **Replace, don't disable.** Swap the whole `SettingsSection` for a same-shaped section
   whose only child is an explanatory note. Greying out controls that provably do nothing
   is a worse affordance than removing them and saying why.
2. **The note names the controls it removed** ("last-N turns, vector top K, vector
   threshold") and **points at the new home** ("configured in Agent Builder"), so a user
   hunting for a setting they remember can complete the journey.
3. **Suffix, don't re-key.** To mark a still-present section legacy, append a literal
   `" (Legacy)"` to the existing translated title:
   `` `${t("memory.long_term_memory")} (Legacy)` ``. Adding a new locale key means editing
   all **12** files in `src/locales/` — avoid that churn for flag-gated transitional copy.
4. **Flag-gated copy stays untranslated on purpose**, with a code comment saying so. It
   only renders behind the flag, and the wording is not frozen yet.
5. **Flag-off must be DOM-identical.** Wrap the old JSX in a ternary branch without
   reindenting it, so a reviewer can see the branch is character-identical to HEAD.

**Why:** these transitions ship while the replacement system is still behind a flag, so the
legacy surface must degrade gracefully for flag-off users (byte-identical) without paying
localization cost for copy that may change.

**How to apply:** reuse this shape for any future flag-gated retirement of Settings
controls. Verify parity mechanically — render HEAD's component and the edited one side by
side and diff `container.innerHTML` across light/dark × each provider state. `Select` mints
a random `mini-ui-select-<id>` per mount; normalize it or you get false diffs.

## Secondary-text contrast ladder (settings surfaces)

Reverse-engineered from `settings/appearance.js` + `settings/memory/index.js`:

| Role | Light | Dark | Size |
|---|---|---|---|
| Section title | `#222` @ opacity .35, uppercase, 1.5px tracking | `#fff` @ .35 | 11 |
| Row label | `#222` | `#fff` | 14 |
| Row description | `#222` @ .45 | `#fff` @ .45 | 12 |
| Inline footnote (e.g. auto-fallback) | `rgba(0,0,0,0.35)` | `rgba(255,255,255,0.35)` | 11 |

House footnote muted (.35 ≈ 2.3:1 on white) **fails AA** and .45 (≈3.1:1) is still short.
Deviation taken for the Memory V2 legacy note: `rgba(0,0,0,0.55)` / `rgba(255,255,255,0.55)`
at 12px (≈4.6:1, AA pass). Justification: that note is the *only* thing explaining why
controls disappeared — it is load-bearing, not decorative. Keep this stronger value for any
explanatory copy that carries meaning the user can't get elsewhere; keep .35 for genuine
asides. See [[feedback_design_principles]].
