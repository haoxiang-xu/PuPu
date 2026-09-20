# Growth snapshot — 2026-09-19

Repository: `haoxiang-xu/PuPu`. GitHub API access verified. Traffic coverage is the 14 complete UTC days from 2026-09-05 through 2026-09-18; weekly comparison below is 2026-09-12–18 versus 2026-09-05–11.

## Exposure

| Metric | Sep 5–11 | Sep 12–18 | Interpretation |
| --- | ---: | ---: | --- |
| Views | 311 | 667 | +114.5%; raw page views are elevated but not a reliable user count. |
| Sum of daily unique-view values | 54 | 62 | +14.8%; this is not a weekly distinct-visitor count because GitHub does not expose per-week unique aggregates. |
| 14-day distinct visitors | — | 90 | Available only for the whole rolling window. |
| Stars | 0 | 0 | 36 total; no star has been added since 2026-07-15. |

Rolling 14-day search referrers: Google 16 views / 13 uniques, Yandex 14 / 13, Bing 14 / 9, with smaller DuckDuckGo, Brave and Yandex subdomain traffic. The overview page received 241 views / 69 uniques. The v0.1.10 release page received 24 / 5; the releases index's 63 / 2 ratio is automated traffic, not reader interest.

## Clone quality

Do not use clone counts as traction: 2026-09-11 had 1,108 clones from 23 unique cloners and 2026-09-18 had 1,030 from 36. Those spikes dominate 3,279 clone events / 268 unique cloners over 14 days and are inconsistent with visits, Stars, and installer demand.

## Installation intent

Only `.dmg`, Windows setup `.exe`, `.deb`, and `.AppImage` are counted.

| Release | Published | Raw installer downloads | Verified successful release-workflow deduction | Adjusted estimate | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| v0.1.10 | 2026-09-09 02:01 UTC | 42 | 5 | 37 | Asset split: AppImage 7, deb 16, macOS ARM 2, macOS Intel 3, Windows 14. The confirmed Stage Verified Release Candidate run `34298581702` re-downloaded all five installer assets. |
| v0.1.11 | 2026-09-19 16:55 UTC | 16 | 5 | 11 | Fresh release: AppImage/deb/macOS ARM/macOS Intel each 3; Windows 4. One successful Stage Verified Release Candidate run `35455547423` re-downloaded all five installer assets. The subsequent Publish Verified Draft Release run `35456385229` failed and is deliberately not deducted. This adjusted figure is an upper bound, not evidence of 11 users. |

`gh run download` and `actions/download-artifact` were not counted as release-asset downloads. v0.1.10 has increased by one adjusted package since the 2026-09-13 snapshot (36 to 37); this is real-but-small installation intent, not a growth inflection.

## Community and contributors

| Metric | Sep 5–11 | Sep 12–18 | Notes |
| --- | ---: | ---: | --- |
| Issues opened / closed so far | 11 / 11 | 12 / 4 | All 23 were authored by `haoxiang-xu`, so this is internal delivery activity rather than user feedback. Median close time for closed issues: 13.7h vs 12.3h (the latter has only four closed items). |
| PRs opened / merged so far | 5 / 4 | 25 / 24 | 4/5 then 24/25 PRs were owner-authored. One external PR in each period: `kingkrs10`'s #270 closed unmerged; `holistis`'s #276 merged. Median merge time for merged PRs: 0.55h vs 0.30h. |

Lifetime contributions remain concentrated: `haoxiang-xu` has 316 of 352 listed contributions (89.8%); Copilot has 16, and six other accounts share 20. This measures code provenance, not active users.

## Tag experiment status

The 2026-09-08 topic change remains `PENDING` until the scheduled 2026-09-22 checkpoint. Do not attribute the current view/download movement to Topics: v0.1.10 and the README positioning changed during the same period, and the new v0.1.11 release is too recent.

