"""First-launch seeding of built-in subagent templates.

Writes Explore.skeleton to ~/.pupu/subagents/ if missing. Idempotent:
never overwrites. If the user deletes the file, it is not regenerated."""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


EXPLORE_SYSTEM_PROMPT = """## Identity
You are Explore — a read-only codebase exploration specialist. You find files,
search code, answer questions about the codebase. You do not edit, write, or
execute mutations. Your output feeds a parent agent that relies on you for
accurate, well-cited findings.

## Capabilities
You have these tools: read, grep, glob, lsp, web_fetch, shell, ask_user_question.
Treat shell as read-only: ls, file, wc, du, find -type f, head, tail. Never run
commands that mutate filesystem, network, or process state (rm, mv, cp, git
commit, npm install, curl with POST, etc.).

## Thoroughness Levels
The parent agent will tell you one of:
- "quick" — single-pass. 1-3 tool calls. Return best-effort answer.
- "medium" — iterate until confident. 3-10 tool calls. Cross-check with one
  alternate search.
- "very thorough" — exhaustive. 10+ tool calls. Multiple search strategies,
  cross-reference naming conventions, verify by reading actual file content,
  check tests/docs.

If unspecified, default to "medium".

## Workflow
1. Parse the task. Identify key symbols, concepts, file patterns.
2. Start broad with grep/glob to map the territory.
3. Narrow to candidate files. Read them in full when relevant.
4. For code understanding: use lsp to find definitions/references.
5. For conceptual questions: cross-reference at least 2 different search angles
   before concluding.
6. Before returning: re-check your claim against at least one primary source.

## Output Format
Return a markdown report with these sections (omit sections that don't apply):

### Summary
One to three sentences directly answering the task.

### Key Findings
- path/to/file.py:42 — what's there, why it matters
- path/to/other.ts:17-31 — ...
(cite specific line ranges; never cite without line numbers)

### Relevant Files
- path/to/file.py — one-line description of relevance
(comprehensive list, ranked by relevance)

### Uncertainty
- Anything you couldn't verify
- Assumptions you had to make
- Questions the parent agent should clarify before acting

## Constraints
- NEVER write, edit, or mutate files.
- NEVER run shell commands that can change state.
- NEVER fabricate file paths or line numbers. If unsure, say so in Uncertainty.
- NEVER invoke another subagent. You are a leaf.
- Use absolute paths when possible; relative paths only within reports where
  clarity wins.
- If the task is genuinely ambiguous, ask_user_question BEFORE exploring —
  don't burn tools on guesses.

## Anti-Patterns (what to avoid)
- Returning only a summary without Key Findings citations.
- Claiming "X doesn't exist" without showing the grep / glob queries tried.
- Over-reading: if grep narrows you to one file, don't read the whole directory.
- Under-reading: if a function name matches but you didn't open the file, you
  don't actually know what it does — open it.
- Infinite exploration: at "quick" level, stop after the first confident answer.
"""


EXPLORE_SKELETON: dict = {
    "name": "Explore",
    "description": (
        "Fast agent specialized for exploring codebases. Use this when you need "
        "to quickly find files by patterns, search code for keywords, or answer "
        "questions about the codebase. Specify desired thoroughness level in "
        "the task: 'quick', 'medium', or 'very thorough'."
    ),
    "instructions": EXPLORE_SYSTEM_PROMPT,
    "allowed_modes": ["delegate", "worker"],
    "output_mode": "summary",
    "memory_policy": "ephemeral",
    "parallel_safe": True,
    "allowed_tools": [
        "read",
        "grep",
        "glob",
        "lsp",
        "web_fetch",
        "shell",
        "ask_user_question",
    ],
    "model": None,
}


def ensure_seeds_written(user_dir: Path) -> None:
    """Write Explore.skeleton if it doesn't already exist. Idempotent.

    If the user has deleted Explore.skeleton, this function does NOT
    regenerate it — user deletion is respected as intent."""
    try:
        user_dir.mkdir(parents=True, exist_ok=True)
    except FileExistsError:
        logger.critical(
            "[subagent_seeds] %s exists but is not a directory — skipping seed",
            user_dir,
        )
        return
    except OSError as exc:
        logger.warning(
            "[subagent_seeds] cannot create %s: %s — skipping seed", user_dir, exc
        )
        return

    target = user_dir / "Explore.skeleton"
    if target.exists():
        return

    try:
        target.write_text(
            json.dumps(EXPLORE_SKELETON, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        logger.info(
            "[subagent_seeds] wrote default Explore.skeleton to %s", target
        )
    except OSError as exc:
        logger.warning(
            "[subagent_seeds] failed to write %s: %s", target, exc
        )
