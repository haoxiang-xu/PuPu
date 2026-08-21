---
name: release-close-sprint
description: "Use when the founder closes a PuPu version/sprint — \"关 0.1.10\", \"close the sprint\", \"版本收尾\", pre-release wrap-up. Shallow acceptance + smoke tests + closing growth snapshot into the sprint doc. NOT the release certification gate (paid matrix, candidate freeze stay with task-owner-release-certification)."
---

# Release: Close Sprint (step 2)

Administrative wrap-up, not deep QA. **Each feature was already accepted when it was built — here you confirm status, smoke the whole, and record.** Red lights become tickets, not blockers; release-blocking power stays with the release certification process.

**Plumbing:** `.claude/skills/release-open-sprint/board-api.md`. All findings land in the sprint doc's 收尾 section.

## Acts

**Act 1 — status roll-call.** Walk the sprint doc 计划 table against the board. Per ticket: propose done/not-done from board state + issue trail, founder confirms each — their verdict is final in both directions (a founder's "not done" flips a board "done", and vice versa; sync the board to match). A new feature with no `release-feature-audit` record in the doc is not done yet — run the audit (or get the founder's explicit waiver) before counting it. Fill 收尾 Done / Not-done lists. **Do not re-review implementations** — if the founder says done, it's done; a ticket needing real re-inspection goes to the normal acceptance process, not here.

**Act 2 — smoke via real app.** Run the `test-api` skill against the running app with a real LLM (convention: `openai:gpt-4.1`, never local ollama; probe sessions deleted after). Cover: chat lifecycle, message send, model/toolkit switch, plus one probe through each area this sprint touched.

**Act 3 — playwright on new features.** Every 计划 row that is a new feature (not bugfix/refactor) gets its key user path driven once via playwright e2e. Assert reachable + core interaction works — not pixel QA.

**Act 4 — red lights.** Each failure: record in 收尾 测试 line, then `release-draft-ticket` a bug ticket (label `bug`, current-or-next sprint per founder's call). **Never block the close on a red light** — if something looks release-critical, write one escalation line in 收尾 (failing flow + repro + the bug ticket #) and tell the founder it belongs to release certification's GO/NO-GO; don't adjudicate here.

**Act 5 — closing growth snapshot.** Run the growth-analyst collection (full snapshot into `.claude/archive/growth/`), append the download-history lines, and fill the doc's 封版基线 (stars, last release downloads, 14d uniques, snapshot date). This is next open-sprint Act 0's before-picture — skipping it destroys the release's attribution.

**Leftovers: hands off.** Not-done tickets stay exactly where they are — sprint value untouched, no closing, no moving. Their disposition is next open-sprint Act 2, where the founder decides. Write `待下次 open-sprint 裁决` in 收尾去向.

## Common mistakes

- Deep-diving a feature during roll-call ("let me just verify this one") — out of scope, it had its acceptance.
- Blocking the close because tests are red — record, ticket, move on.
- Moving/closing unfinished tickets "to tidy up" — that steals open-sprint Act 2's decision from the founder.
- Skipping Act 5 because "growth ran recently" — the close-time snapshot is the version boundary marker; run it at close, always.
- Running smoke with local ollama (too slow) or leaving probe sessions behind.
