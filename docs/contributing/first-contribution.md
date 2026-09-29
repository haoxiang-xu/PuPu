# Your first contribution to PuPu

This page is the starting point if you want to help but do not yet know what to
work on. It covers finding a task, claiming it, setting the project up, opening
the pull request, and where to ask when something is unclear.

You do not need to apply or be approved to contribute. Nobody has to invite you.

## 1. Pick the kind of contribution

| You want to | Go to | No code needed |
| --- | --- | --- |
| Add an MCP server, Skill, or Toolkit to the store | [Community submissions](./community-submissions.md) | yes |
| Fix a bug, build a feature, improve the UI | keep reading | no |
| Improve documentation | keep reading — docs changes follow the same PR flow | no |
| Report a problem without fixing it | [open an issue](https://github.com/haoxiang-xu/PuPu/issues/new/choose) | yes |
| Ask about a task, or say you would like to take it | comment on that issue | yes |

The store submissions are a separate path with their own issue forms and their
own review. If that is what you came for, follow that guide instead; the rest of
this page is about changing the application itself.

## 2. Find a task

Two labels mark work that is open to outside help:

| Label | What it means |
| --- | --- |
| [`good first issue`](https://github.com/haoxiang-xu/PuPu/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) | Self-contained and well scoped. The issue says what to change and how you will know it worked. You should not have to understand the whole application to finish it. |
| [`help wanted`](https://github.com/haoxiang-xu/PuPu/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) | Outside help is welcome. Usually larger than a first issue and assumes you have found your way around the codebase. |

Two more labels tell you to stay away for now:

- [`blocked`](https://github.com/haoxiang-xu/PuPu/issues?q=is%3Aissue+is%3Aopen+label%3Ablocked)
  — waiting on other work to land first.
- [`needs-decision`](https://github.com/haoxiang-xu/PuPu/issues?q=is%3Aissue+is%3Aopen+label%3Aneeds-decision)
  — waiting on a product decision, not on engineering.

If nothing fits today, check back — the list changes. You are also welcome to
just open a pull request for something you noticed yourself; no issue has to
exist first.

## 3. Claim it

Comment on the issue saying you would like to take it. A maintainer assigns it
to you, which is how everyone else can see the task is taken.

If an assigned issue shows no visible progress for **14 days** — no comment, no
draft PR — the assignment is released and someone else may pick it up. You are
not expected to finish in 14 days; a short comment saying where you are keeps
the claim. If you get stuck or change your mind, say so and hand it back. That
is a normal outcome and costs you nothing.

For a change of a few lines, or a typo, skip all of this and open the pull
request.

## 4. Set up

Full instructions are in the [Developer Guide](../DEV_GUIDE.md); the short
version is:

```bash
npm install
npm start        # React + Electron
npm test         # frontend test suite
```

Read [`AGENTS.md`](../../AGENTS.md) and [`CLAUDE.md`](../../CLAUDE.md) before
you write code. They carry the conventions that will otherwise get your PR sent
back: JavaScript only, inline styles only, React never touching `ipcRenderer`
directly, and overlay `zIndex` coming from the shared layer constants.

## 5. Open the pull request

1. Fork the repository and create your branch from upstream **`dev`**. If your
   fork only has `main`, fetch `dev` from upstream first.
2. Make the change and run the tests that cover it:

   ```bash
   npm test                 # frontend
   npm run validate:mcp     # if you touched the MCP store catalog
   ```

3. Open the PR against **`haoxiang-xu/PuPu`, base branch `dev`**. Check the base
   before you submit — GitHub often defaults to `main`, and a contribution PR
   targeting `main` fails the source-branch check. `main` is the release branch;
   maintainers promote `dev` to it.
4. Fill in the PR template: what changed, how you tested it, and the CLA
   checkbox.

Review is on the change, not on you. Expect questions; they are not a rejection.

## 6. What you do not need

Contributing is not the same as having maintainer access, and you will never be
asked to get any of the following first:

- **Write access to the repository.** You work in your fork.
- **Permission to manage labels.** Issue forms apply their own labels, and
  maintainers label pull requests. Describe the type in the PR body and that is
  enough.
- **Access to the project board.** Release planning happens there; contributions
  do not go through it.
- **An accepted proposal before writing code.** A proposal is useful for large
  or uncertain work, and unnecessary for a bug fix.

## 7. Getting help

- Stuck on the task, or unsure how it should behave — comment on that issue.
  Questions on the issue are welcome and are not a sign you picked wrong.
- Stuck on setup, or unsure whether an idea is wanted — open an issue and ask.
- Found a security problem — do not open a public issue; email
  haoxiangxu1998@gmail.com instead.

Everyone here agrees to the [Code of Conduct](../../CODE_OF_CONDUCT.md).

## For maintainers

Keeping this page working takes upkeep rather than documentation:

- An issue labelled `good first issue` must state the change and its acceptance
  in the issue itself. A one-line title someone would have to reverse-engineer
  is a `help wanted` issue, not a first issue.
- Keep a few `good first issue` items open at all times. An empty list makes
  this page a dead end.
- Assign on request, and release assignments that have gone quiet for 14 days
  with a comment rather than silently.
- Interest arrives as a comment on the issue itself, which keeps one canonical
  home per task and adds no second inbox to watch.
