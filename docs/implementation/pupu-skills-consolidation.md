# PuPu shared skills consolidation — 2026-09-13

The project owner requested one in-repository skill source shared by Claude Code and Codex, categorized skill names, merged growth analysis, and deletion of three independent skills. Canonical content now lives in `.agents/skills`; `.claude/skills` contains relative directory symlinks. Personal PuPu copies were removed after a local recovery snapshot. No product source changes, commits or release dispatches belong to this task.

| Family | Canonical names |
|---|---|
| Release | release-open-sprint, release-close-sprint, release-run-pipeline |
| Issue | issue-draft-ticket, issue-refine-ticket, issue-start-ticket, issue-feature-audit |
| Dev UI | dev-ui-modal-standard |
| Community | community-growth-analyst, community-repo-tags-optimization, community-repo-issue-polling, community-store-verify-plugin |
| GitNexus | gitnexus-cli, gitnexus-debugging, gitnexus-exploring, gitnexus-guide, gitnexus-impact-analysis, gitnexus-refactoring |

Deleted independent entrypoints: create-issue, test-api, ai-investigation. Issue brief methodology and the existing Test API reference remain supporting documents for the issue workflow, without their old skill frontmatter. The release operator CLI filename and its public schemas are unchanged; only its skill is renamed. The five divergent release copies were consolidated using the personal working versions, retaining the project's additional UI layering check. Identical audit scripts were moved without code changes.

Growth analysis merges snapshot history, light/full modes, issue/PR separation, contributor caveats, normalized release performance and founder reporting. The weighted 25/35/20/20 score is the retained rubric; historical equal-weight scores must not be compared without recalculation. Existing growth archives remain in place.

## Boundaries and acceptance

**BC-001 — skill files → agent discovery.** Producer: this checkout's `.agents/skills/<name>` directories. Canonical representation: Agent Skills `SKILL.md` with matching name and description plus relative references/scripts. Consumers: Codex repository skill discovery and Claude Code project directory symlinks. Admission: OPEN standard frontmatter with optional host metadata; no consumer-specific frontmatter is required to interpret the body. Both paths must resolve to the same current bytes. Missing targets, duplicate personal bodies or invalid frontmatter fail this migration check. AC-001: all 18 canonical skills validate and both entrypoints resolve to one real file. AC-002: all Markdown resource links resolve; retired entrypoints and personal PuPu duplicates are absent. Product runtime/wheel pairing is NOT_APPLICABLE: no PuPu/Unchain protocol or release artifact changed.

**BC-002 — saved automation prompts → skills and durable records.** Four existing heartbeat prompts reference the renamed skills. Admission: preserve the automation's schedule, destination, status, notification policy and authorized action scope; rewrite names and skill paths only. Existing `release-start-ticket:v1`, `release-feature-audit:v2` and waiver markers, growth history and inbox/scout state paths remain unchanged. AC-003: read back all four saved automations and verify new skill references resolve; no retired skill paths remain. Renaming a skill does not create a new inbox or invalidate historical audit records.

**SEQ-001 — rename and later resume (BC-001/002).** Begin with old personal/project copies and existing task records; snapshot originals; create canonical directories; merge instructions; replace Claude entrypoints with relative symlinks; remove old personal copies; update saved prompts; reload discovery. Repeated reads resolve to identical content. Later task resumes retain record identity and cursors. Recovery can restore originals from the local snapshot. No historical GitHub comments, growth snapshots or inbox state are rewritten.

**AC-004 — relocated helpers.** Run the existing 19 i18n helper tests and 16 release operator tests, including the updated assertion that Claude and Codex read the same release workflow file. Do not dispatch a release to test a filesystem migration.

## Verification evidence

- Real Codex `skills/list` with `forceReload=true` discovered all 18 project skills with zero discovery errors. Claude directory entrypoints were verified against the same real files; no Claude model invocation was needed.
- 18/18 skill format validations passed; 18/18 Claude paths resolve to the matching canonical file; no broken Markdown resource links.
- Existing helper and release operator tests: 35 passed, zero failed.
- `git diff --check` passed. Product changes already present in the checkout were excluded from this task.
- GitNexus could not resolve the hidden skill files or the test callback: risk UNKNOWN, not an all-clear. Text-reference inspection identified instruction routers, the release operator test and four scheduled prompts. The named `flattenKeys` graph lookup resolved a historical evidence copy, so its LOW result is not claimed as the moved scripts' impact analysis. Helper byte comparisons and relocated tests supply the filesystem-migration evidence.
- No skill verification/security badge is implied by validating skill metadata.

Official discovery references: [Codex local skills](https://learn.chatgpt.com/docs/build-skills#where-codex-loads-local-skills), [Claude Code skills and symlinked folders](https://code.claude.com/docs/en/skills#choose-where-skills-load).
