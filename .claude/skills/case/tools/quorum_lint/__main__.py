"""Command-line entry point for the Quorum reference linter."""

from __future__ import annotations

import argparse
from pathlib import Path

from .lint import lint_case


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint Quorum boundary protocol v1 canonical Markdown records")
    parser.add_argument("case", type=Path, help="case directory or proposal.md")
    parser.add_argument("--phase", choices=("ruling", "acceptance"), default="ruling")
    args = parser.parse_args()
    issues = lint_case(args.case, phase=args.phase)
    if issues:
        for issue in issues:
            print(f"ERROR {issue}")
        print(f"FAIL: {len(issues)} issue(s)")
        return 1
    print(f"PASS: {args.case} satisfies boundary protocol v1 ({args.phase})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
