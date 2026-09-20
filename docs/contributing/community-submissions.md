# Community submissions: MCP, Skill, and Toolkit

Use an issue to propose an integration or ask for help packaging it. Use a PR
when you already have an implementation. A small, complete PR does not need a
separate issue first; link any existing discussion so reviewers can follow it.

## Choose a type

| Type | Use it for | Issue form | Labels for issues and PRs |
| --- | --- | --- | --- |
| MCP | A local or hosted server that exposes tools over MCP | [Submit an MCP](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-mcp-server.yml) | `mcp-submission` |
| Skill | Reusable agent instructions in `SKILL.md`, or a pack of skills | [Submit a Skill](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-skill.yml) | `skill-submission` |
| Toolkit | Native/custom executable tools integrated with PuPu's toolkit system | [Submit a Toolkit](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-toolkit.yml) | `toolkit-submission` |

If your toolkit is delivered by an MCP server, choose MCP. If it only provides
instructions for using existing tools, choose Skill. A contribution containing
both may have multiple submission labels.

Labels describe the contribution, not its provider's identity or reliability.
They never mean official, verified, approved, or scheduled for a release.

## Open an issue

1. Search existing issues and PRs for the integration name or source URL.
2. Select the matching form under **Issues → New issue**.
3. Give a name, use case, source/homepage, license, and your relationship to the
   project. Recommending someone else's work is welcome; identify its author.
4. Provide one usage example, what you tested, dependencies, permissions, costs,
   and known limitations. Do not paste API keys, tokens, or private user data.
5. Submit. The form applies the submission type and `considering`.
   You do not need permission to manage repository labels.

Examples: `[MCP] Acme Tasks`, `[Skill] Weekly release notes`,
`[Toolkit] Local image conversion`.

For MCP, include an exact package version for a local command, or the hosted
endpoint and its version policy if available. Separate open-source client code
from any private hosted service, and identify paid tools.

For Skills, link the `SKILL.md` files, supporting Markdown references, and an
immutable source commit/release. Include a sample prompt and expected result.
Declare required tools and scripts: the current store skill-pack importer uses
Markdown files and does not automatically install executable dependencies.

For Toolkits, list tools and input/output examples, platform support, runtime
requirements, and side effects. State whether you have an implementation or
are requesting one. See [Toolkit & Tool Catalog](../features/toolkit-and-tool-catalog.md).

Maintainers evaluate submissions one by one. `considering` means not yet
accepted or scheduled. Existing labels such as `help wanted`, `good first issue`,
`blocked`, and `needs-decision` are applied when their meanings actually fit.
Submitting a form does not assign a developer or add work to a release.

## Open a PR

1. Fork PuPu and create a contribution branch from **upstream `dev`**.
2. Make the relevant change:
   - MCP: add an entry to `src/SERVICEs/mcp_toolkit_registry.json` and follow the
     [MCP submission guide](./mcp-store-submission.md).
   - Skill: include the skill content or an immutable source reference and
     its integration. Store skill-pack entries currently live in the
     `skillPacks` section of `src/SERVICEs/plugin_store_curation.json`; follow
     the existing importer/manifest requirements. Do not fabricate review or
     verification evidence. An issue is fine if packaging needs assistance.
   - Toolkit: include the implementation, catalog integration, documentation,
     and focused tests. If it also needs changes in the runtime repository,
     identify and link that dependency rather than submitting only a UI entry.
3. Follow the repository's `AGENTS.md` and development conventions; run checks
   appropriate to the change. Run `npm run validate:mcp` for MCP catalog edits.
4. Open the PR with **base repository `haoxiang-xu/PuPu`, base branch `dev`**.
   GitHub may default to `main`; change it before submitting.
5. Select the contribution type in the PR template, link the issue if present,
   and describe the behavior, test results, source/version, license, permissions,
   costs, and limitations. Complete the existing CLA checklist.

PR template checkboxes do not automatically apply labels. Maintainers add
the matching submission label; contributors without label
permissions can simply select the type in the PR description.

`main` is the release branch. Maintainers promote `dev` to `main`. A merge to
`dev` does not itself publish a new application version. An issue linked to a
PR targeting `dev` may stay open until explicitly closed or promoted through
GitHub's default-branch closing behavior; do not assume it closed automatically.

## Acceptance and availability

We review the actual contribution, its source/version, integration behavior,
permissions, and known defects. Third-party inclusion does not require PuPu to
guarantee a provider's commercial honesty, paid delivery, or output accuracy.
Accepted third-party MCP entries can use `community`, `available`, and
`installable: true`; concrete blocking defects are evaluated separately.
Testing claims should name what was tested and the version. Broader plugin
provenance and test-result labeling is tracked in
[#278](https://github.com/haoxiang-xu/PuPu/issues/278).

## Maintaining these forms

Create referenced labels in the repository before publishing form changes.
GitHub uses templates from the default branch (`main`), so new forms and the PR
template become available after the normal `dev` → `main` promotion. Repository
labels are available immediately after creation. Do not change ordinary PRs to
`main` just to activate a template.

GitHub references: [issue-form syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)
and [template publishing](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates).
