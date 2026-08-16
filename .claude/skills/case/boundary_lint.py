#!/usr/bin/env python3
"""Direct PuPu entry point for the vendored Quorum boundary linter."""

import argparse
from pathlib import Path

from quarantine_lint import lint_case


def main() -> int:
    parser = argparse.ArgumentParser(description="Lint PuPu Quorum boundary protocol cases")
    parser.add_argument("case", type=Path)
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
