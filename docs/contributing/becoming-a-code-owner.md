# Becoming a code owner

A code owner is named in [`.github/CODEOWNERS`](../../.github/CODEOWNERS) for
one path. Their approval is required before any pull request touching that path
can merge, and they can merge inside that path without waiting for anyone.

This is a way to hand review away, not a title. If you do not want to review
other people's code, you do not want this — and nothing about contributing
requires it.

## Two levels

| | What it is | How you get it |
| --- | --- | --- |
| **Resident contributor** | `write` on the repository: you branch here instead of in a fork, and you appear in the collaborator list | Two merged pull requests anywhere in the repository |
| **Code owner** | Named in CODEOWNERS for one path; your approval gates it and you can merge inside it | Two merged pull requests **in the path you are applying for** |

`write` on its own does not let you merge: the path's code owner still has to
approve. What it buys is branching here directly and being publicly listed.

## The bar

**Two merged pull requests in the path you want.** That is the whole numeric
requirement, and it is set where it is on purpose — it is what the most active
contributors in this project's history have actually reached in a single area.

Meeting it lets you apply. It does not oblige acceptance: the project owner
reads the code before deciding, and will say why either way.

## Applying

Open an issue titled `[Code owner] <path>` containing:

1. **The path.** A coherent functional cluster — `/src/COMPONENTs/chat-input/`,
   not one file and not `src/` entire.
2. **Your merged pull requests touching it**, by number.
3. **How you would review it.** What you would approve directly, and what you
   would refer upward. Say where your confidence ends; that is more useful than
   claiming it does not.
4. **Roughly how responsive you expect to be.** An estimate, not a promise.

There is no form to fill in and no queue to wait in.

Anyone can check the count:

```bash
gh pr list --repo haoxiang-xu/PuPu --state merged --author <you> \
  --json number,files --limit 100 \
  | jq '[.[] | select(any(.files[]; .path | startswith("<path>")))] | length'
```

If a path was renamed — `miso_runtime/` became `unchain_runtime/` — that command
reads your history as zero. Say so in the application and give the old path.

## What you can and cannot do

Inside your path you may approve and merge into `dev`, including your own pull
requests. That is deliberate: requiring a second approver would send every
change back to the project owner, which is the bottleneck this exists to
remove. It rests on trust, and the safeguard is that it can be withdrawn.

Outside your path, nothing changes: you are a contributor like anyone else.

`main` is the project owner's alone. So is the release pipeline, the MCP store
catalog, and the repository's legal files. No code owner merges a release.

## Losing it

- **Six months with no review activity in your area** removes your CODEOWNERS
  line. You keep `write`. This is not a punishment: because the rule requires
  your approval, an unresponsive code owner blocks every pull request in that
  area, so the role has to lapse on its own.
- **The project owner can remove a code owner at any time**, and will record it
  on the original application issue. This is a personal project, and saying that
  plainly beats implying a process that does not exist.

Either way you are welcome to keep contributing and to apply again.
