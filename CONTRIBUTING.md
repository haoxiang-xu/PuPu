# Contributing to PuPu

Thanks for helping make PuPu better. You can propose community integrations
or contribute code directly. You do not need to apply or be approved first.

**New here?** [Your first contribution](./docs/contributing/first-contribution.md)
walks through finding a task, claiming it, setting up, and opening the PR.

## 🧩 Contribute an MCP server, Skill, or Toolkit

No code is required to make a proposal. Choose the matching issue form:

| Contribution | Issue form | Labels for the issue and related PR |
| --- | --- | --- |
| MCP server | [Submit an MCP](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-mcp-server.yml) | `mcp-submission` |
| Skill / Skill Pack | [Submit a Skill](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-skill.yml) | `skill-submission` |
| Native Toolkit / custom tools | [Submit a Toolkit](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-toolkit.yml) | `toolkit-submission` |

Forms also apply `considering` while the proposal awaits evaluation. Contributors
do not need permission to manage labels: choose the form, and maintainers label
the related PR. A proposal does not automatically enter a release.

See the [community submission guide](./docs/contributing/community-submissions.md)
for examples, required information, and PR instructions. MCP-specific schema
requirements are in the [MCP guide](./docs/contributing/mcp-store-submission.md).

## 💻 Contribute code

1. Read [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) for the project conventions
   (JavaScript only, inline styles, the IPC boundary) and [`docs/DEV_GUIDE.md`](./docs/DEV_GUIDE.md).
2. Fork the repository, create your contribution branch from upstream `dev`,
   and make your change. If your fork only contains `main`, fetch upstream `dev`
   first.
3. Run the test suites that cover your area:

   ```bash
   npm test                 # frontend
   npm run validate:mcp     # if you touched the MCP store catalog
   ```

4. Open a PR with **`haoxiang-xu/PuPu` → `base: dev`**, describing what changed
   and why. Check the base before submitting: GitHub may default to `main`.

All ordinary contributions, including MCP catalog entries, target `dev`.
Maintainers promote `dev` to the release branch `main`; ordinary contribution
PRs targeting `main` fail the source-branch check.

### Claiming an issue

Issues open to outside help carry
[`good first issue`](https://github.com/haoxiang-xu/PuPu/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
or
[`help wanted`](https://github.com/haoxiang-xu/PuPu/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22).
Comment to say you would like to take one and a maintainer assigns it to you, so
everyone can see it is taken. An assignment with no visible progress for 14 days
is released for someone else; a short status comment keeps it. Small changes and
typo fixes need no claim at all — open the PR.

You never need repository write access, label permissions, or project board
access to contribute. Details in
[Your first contribution](./docs/contributing/first-contribution.md).

## Licensing & CLA

By submitting a contribution you agree to the terms in [docs/CLA.md](./docs/CLA.md).
In short: you keep ownership; the project may ship your work under Apache-2.0 and
may relicense accepted contributions in future offerings. If the work is owned by
your employer, make sure you have authority to contribute it.

## Code of conduct

Participation in this project is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md).

See also: [License](./LICENSE) · [Trademark policy](./docs/TRADEMARK_POLICY.md).
