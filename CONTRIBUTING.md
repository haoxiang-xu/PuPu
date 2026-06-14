# Contributing to PuPu

Thanks for helping make PuPu better. There are two main ways to contribute.

## 🧩 Add a tool / MCP server to the store

The easiest way to extend PuPu for everyone. No code needed — open a
**[Submit an MCP server](https://github.com/haoxiang-xu/PuPu/issues/new?template=submit-mcp-server.yml)**
issue. Prefer a PR? Both paths are documented in
[docs/contributing/mcp-store-submission.md](./docs/contributing/mcp-store-submission.md).

## 💻 Contribute code

1. Read [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) for the project conventions
   (JavaScript only, inline styles, the IPC boundary) and [`docs/DEV_GUIDE.md`](./docs/DEV_GUIDE.md).
2. Fork, branch, and make your change.
3. Run the test suites that cover your area:

   ```bash
   npm test                 # frontend
   npm run validate:mcp     # if you touched the MCP store catalog
   ```

4. Open a PR describing what changed and why.

## Licensing & CLA

By submitting a contribution you agree to the terms in [docs/CLA.md](./docs/CLA.md).
In short: you keep ownership; the project may ship your work under Apache-2.0 and
may relicense accepted contributions in future offerings. If the work is owned by
your employer, make sure you have authority to contribute it.

See also: [License](./LICENSE) · [Trademark policy](./docs/TRADEMARK_POLICY.md).
