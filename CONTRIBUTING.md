# Contributing to PuPu

Thanks for helping make PuPu better. You can propose community integrations
or contribute code directly.

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

## Licensing & CLA

By submitting a contribution you agree to the terms in [docs/CLA.md](./docs/CLA.md).
In short: you keep ownership; the project may ship your work under Apache-2.0 and
may relicense accepted contributions in future offerings. If the work is owned by
your employer, make sure you have authority to contribute it.

See also: [License](./LICENSE) · [Trademark policy](./docs/TRADEMARK_POLICY.md).
