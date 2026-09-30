# Code owner path — design

Date: 2026-09-29
Status: design approved, not implemented

## Why

The project owner is the only reviewer. `dev` and `main` both require a pull
request but set `required_approving_review_count: 0` and
`require_code_owner_review: false`, so no review is structurally required
anywhere, and every meaningful review happens because the owner personally does
it. The goal of this design is to make it possible to hand a defined slice of
that review away and have the handover mean something.

This is a delegation mechanism, not a recognition programme. Recognition,
retention, and recruiting are real problems for this project but are not what
this design solves.

## Facts this design is built on

Measured 2026-09-28/29 against `origin/dev`.

**Access today.** 14 collaborators hold `write`, plus the owner as `admin`. Of
the 14, nine have never opened a pull request, never opened an issue, and have
no commit on `dev`: harryche, TenTen-Teng, animaroy911, realzjc, William-316,
litaozheng, Ieleniayu, ZefengPei, jeremywong197-arch. Five have produced work:
ehz2 (4 PRs, 9 commits), Max-jzyan (4 PRs, 4 commits), zzmjeremy (4 PRs, via
fork), skywalker007-cpu (1 PR, 4 commits), tianyi-xia1 (2 commits).

**What write currently permits.** Both rulesets bypass only `RepositoryRole 5`
(admin), so no collaborator can push directly. But because both rulesets require
a pull request with zero required approvals, any of the 14 can open a pull
request and merge it themselves — into `dev`, and into `main` as well. `main`'s
only additional constraint is the `check-source-branch` status check, which
requires the source to be `dev`. A write collaborator can therefore promote
`dev` to `main` unilaterally, which is to say ship a release. Nothing but habit
currently prevents this.

**Contribution depth.** Counted as merged pull requests per area, deduplicated
per pull request, the deepest concentrations are: ehz2, three in `electron/`;
Max-jzyan, three in `miso_runtime/server/` (the directory now called
`unchain_runtime/`); zzmjeremy, two in `electron/`. Everyone else reaches at
most one per area. Three people would therefore clear a two-pull-request area
threshold today, which is what makes that threshold real rather than
decorative. External pull requests currently arrive at roughly one per month.

**Retention.** No external contributor has stayed. The longest active span is 22
days; nobody has returned after a gap. A threshold calibrated to a larger
project would qualify nobody, ever.

## Decisions

1. **Purpose is offload.** The design optimises for removing the owner from the
   critical path of ordinary changes, not for motivating contributors.
2. **One standard, evidence only.** The same bar applies to existing
   collaborators and to people who arrive later; nobody is a code owner by
   virtue of already holding access. This governs code owner selection and any
   new `write` grant. It does not revoke `write` that has already been given.
3. **Authority granted.** A code owner may merge into `dev` within their area.
   `main` remains the owner's alone. The release pipeline is never delegated.
4. **CODEOWNERS starts empty.** Nobody is a code owner at the start. Every code
   owner is selected from later contributors on evidence.
5. **Entry is application, decision is the owner's.** The bar is public; anyone
   who meets it may apply; the owner approves or declines.
6. **Bar is two merged pull requests in the area applied for.** Calibrated to
   the measured ceiling above: at a higher number nobody would ever qualify, and
   the threshold would be decorative.
7. **Areas are not predefined.** No published map of ownable areas. Each
   approved application adds one line to CODEOWNERS for the path that applicant
   actually demonstrated work in.

## Tiers and authority

"Resident contributor" means holding `write`. "Code owner" means being named in
CODEOWNERS for a path, and additionally holding `write`.

| Capability | Outside contributor | Resident contributor | Code owner | Owner |
| --- | --- | --- | --- | --- |
| Fork and open a pull request | yes | yes | yes | yes |
| Claim an issue | yes | yes | yes | yes |
| Push a branch to this repository | no, use a fork | yes | yes | yes |
| Approve a pull request | no | may click, does not satisfy the requirement | yes, and their approval is the release condition inside their area | yes |
| Merge into `dev` | no | yes, after the area's code owner approves | yes, unaided, inside their area | yes |
| Merge into `main` | no | no | no | yes |
| Change rulesets, access, secrets | no | no | no | yes |
| Run the release pipeline | no | no | no | yes |
| Implement a release sub-issue | no | yes | yes | yes |

Resident contributor is a statement of trust rather than a capability: once code
owner review is required, `write` alone no longer permits merging. Its practical
content is branching inside the repository instead of a fork, and public
visibility in the collaborator list. Its bar is two merged pull requests
anywhere in the repository, not bound to an area.

A code owner may open, approve, and merge their own pull request inside their
own area. This is deliberate. Requiring a second approver would return every
such change to the owner, which is the bottleneck this design exists to remove.
The safeguard is revocability, not procedure.

## Applying

No new issue form. An applicant opens an ordinary issue titled
`[Code owner] <path>` containing:

1. the path they want, which must be a coherent functional cluster — not a
   single file, and not `src/` as a whole;
2. the numbers of their merged pull requests touching that path;
3. how they intend to handle review there: what they would approve directly and
   what they would refer to the owner;
4. a self-assessment of how responsive they expect to be. This is an estimate,
   not a commitment.

A dedicated `.yml` form is not justified at an expected volume in the single
digits per year, and the project has just decided against maintaining a second
inbox.

## Verifying and deciding

The threshold is mechanically checkable:

```bash
gh pr list --repo haoxiang-xu/PuPu --state merged --author <user> \
  --json number,files --limit 100 \
  | jq '[.[] | select(any(.files[]; .path | startswith("<path>")))] | length'
```

`any(.files[]; ...)` is load-bearing: `select(.files[].path | startswith(...))`
emits one result per matching file, so a single pull request touching four files
in the area counts as four and the threshold silently inflates.

The command sees only today's paths. `miso_runtime/` was renamed to
`unchain_runtime/`, so a contributor with real history there reads as zero
against the current path. Check the area's rename history before treating a zero
as evidence of nothing.

Two or more qualifies the applicant to apply. It does not oblige approval: the
owner reads the actual code before deciding and records the reason in the issue
either way.

On approval:

1. add `/<path>/  @<user>` to `.github/CODEOWNERS`;
2. grant `write` if the applicant does not already hold it;
3. confirm and close the application issue.

On decline, state which condition failed — pull request count, path too broad,
or code quality — and that reapplying is welcome. No cooling-off period: at one
external pull request per month, a waiting period is ceremony.

## Losing the role

- **Six months with no review activity in the area removes the CODEOWNERS
  line.** `write` is retained. This rule is load-bearing rather than punitive: a
  code owner who stops responding blocks every pull request in their area,
  because the ruleset requires their approval. Without this rule the design can
  deadlock itself.
- **The owner may remove a code owner at any time, without cause**, recording it
  on the original application issue. Stating this plainly is more honest than
  implying a due process that does not exist.

## Changes required

**1. `.github/CODEOWNERS` (new file)**

```
# Fallback: paths with no assigned owner belong to the project owner.
*   @haoxiang-xu

# One line is added per approved code owner, scoped to the path they
# demonstrated work in. Later lines win over earlier ones.
```

**2. Both rulesets**

| Ruleset | Field | From | To |
| --- | --- | --- | --- |
| `dev protection rule` (23705751) | `require_code_owner_review` | `false` | `true` |
| `main protection rule` (11921569) | `require_code_owner_review` | `false` | `true` |

`required_approving_review_count` stays at `0`. With a fallback line present,
`require_code_owner_review` already forces the matched owner's approval; raising
the count to 1 would demand an additional approver beyond the area's owner, to
no purpose.

`main` becoming the owner's alone is a consequence of the fallback line plus
this switch, not a separate mechanism.

## The accepted cost

Enabling this makes the fallback line effective, so the 14 write collaborators
can no longer merge into `dev` by themselves; every pull request needs the
owner's approval. Until the first code owner exists, this design therefore
*increases* the owner's load, which is the opposite of its purpose.

This was weighed and accepted, for two reasons. The measured increment is close
to zero, because nine of the 14 have never contributed anything and the rest
have opened no pull request in the last 90 days. And it closes a live hole:
today any of those 14 can promote `dev` to `main` on their own.

The owner's own workflow does not change. As a ruleset bypass actor
(`RepositoryRole 5`, `always`) the owner can still push directly and merge
without any approval; going through a pull request simply annotates the merge as
bypassing rules.

## Mechanics worth knowing

- CODEOWNERS is read from the **base branch of the pull request**. Merging this
  into `dev` takes effect for pull requests into `dev` immediately; `main` keeps
  the old behaviour until the next `dev` → `main` promotion carries the file
  across.
- GitHub does not allow approving one's own pull request. With the fallback line
  pointing at the owner, the owner's own pull requests will show as missing code
  owner approval; the admin bypass covers this.
- Later CODEOWNERS lines override earlier ones, so the fallback belongs at the
  top and area lines are appended below it.

## Rolling back

Both ruleset switches revert with one API call each. The CODEOWNERS file, or any
single line in it, reverts with one commit. There is no data migration and no
irreversible step; the repository can return to its 2026-09-29 behaviour within
minutes.

## Non-goals

- No bot: no staleness automation, no auto-assignment, no application scoring.
- No change to the CLA, licensing, or trademark policy.
- No demotion or audit of existing collaborators. Existing `write` grants stand;
  the new standard governs CODEOWNERS membership only.
- No published map of ownable areas.
- No governance for `haoxiang-xu/unchain`. This design covers this repository,
  including `unchain_runtime/` inside it. Whether the separate runtime
  repository adopts the same model is an open question, not settled here.
- No delegation of the release pipeline, the MCP store catalog, or the
  repository's legal files.
