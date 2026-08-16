#!/usr/bin/env python3
"""Scan PuPu cases and lint boundary_protocol:v1 cases at binding gates."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
import sys
from typing import TextIO

from quarantine_lint import lint_case


FRONTMATTER_FIELD_RE = re.compile(r"^(?P<name>[A-Za-z_][A-Za-z0-9_]*):\s*(?P<value>.*)\s*$")
AT_RE = re.compile(r"^##\s+AT-\d{3}\b", re.MULTILINE)
PLAN_RULING_RE = re.compile(r"\bPLAN_RULING\b")
ALLOWED_STATUSES = {
    "filed",
    "drafting",
    "awaiting-handoff",
    "awaiting-lead-integration",
    "reviewing",
    "awaiting-objection-disposition",
    "awaiting-objection-grouping",
    "awaiting-full-vote",
    "hearing",
    "awaiting-evidence-direction",
    "awaiting-ruling",
    "implementing",
    "acceptance",
    "awaiting-acceptance-response",
    "reconsideration",
    "awaiting-blocking-child",
    "closed",
    "terminated",
}
ACCEPTANCE_STATUSES = {
    "acceptance",
    "awaiting-acceptance-response",
    "reconsideration",
    "awaiting-blocking-child",
}
RULING_STATUSES = {"awaiting-ruling", "implementing"}
PUPU_V1_EFFECTIVE_FROM = datetime.fromisoformat("2026-08-12T00:00:00-07:00")


@dataclass(frozen=True)
class ClassifiedCase:
    path: Path
    category: str
    phase: str | None
    status: str | None


def _frontmatter(path: Path) -> dict[str, str]:
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        raise ValueError("canonical case.md frontmatter is missing")
    fields: dict[str, str] = {}
    closed = False
    for line in lines[1:]:
        if line.strip() == "---":
            closed = True
            break
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        match = FRONTMATTER_FIELD_RE.fullmatch(line)
        if not match:
            raise ValueError(f"invalid canonical frontmatter line: {line!r}")
        name = match.group("name")
        if name in fields:
            raise ValueError(f"duplicate canonical frontmatter key: {name}")
        fields[name] = match.group("value").strip()
    if not closed:
        raise ValueError("canonical case.md frontmatter is unterminated")
    return fields


def classify_case(path: Path) -> ClassifiedCase:
    fields = _frontmatter(path)
    protocol = fields.get("boundary_protocol")
    if protocol in (None, "", "null", "legacy"):
        if fields.get("discussion_type") == "proposal":
            created_at_raw = fields.get("created_at")
            if not created_at_raw:
                raise ValueError(
                    "legacy proposal must declare created_at to prove it predates "
                    "PuPu boundary_protocol:v1 effective-from"
                )
            try:
                created_at = datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError(f"proposal created_at is not valid ISO-8601: {created_at_raw!r}") from error
            if created_at.tzinfo is None or created_at.utcoffset() is None:
                raise ValueError("proposal created_at must include a UTC offset")
            if created_at >= PUPU_V1_EFFECTIVE_FROM:
                raise ValueError(
                    "proposal created on or after 2026-08-12T00:00:00-07:00 must "
                    "declare boundary_protocol: v1"
                )
        return ClassifiedCase(path, "legacy", None, fields.get("status"))
    if protocol != "v1":
        raise ValueError(f"unknown boundary_protocol value: {protocol!r}")
    if fields.get("discussion_type") != "proposal":
        raise ValueError("boundary_protocol:v1 is valid only for proposal cases")
    status = fields.get("status")
    if status not in ALLOWED_STATUSES:
        raise ValueError(f"unknown or missing v1 case status: {status!r}")

    case_dir = path.parent
    acceptance = case_dir / "acceptance.md"
    ruling = case_dir / "ruling.md"
    has_acceptance_snapshot = acceptance.is_file() and AT_RE.search(
        acceptance.read_text(encoding="utf-8")
    ) is not None
    has_plan_ruling = ruling.is_file() and PLAN_RULING_RE.search(
        ruling.read_text(encoding="utf-8")
    ) is not None

    if has_acceptance_snapshot or status in ACCEPTANCE_STATUSES:
        return ClassifiedCase(path, "v1_gated", "acceptance", status)
    if status in RULING_STATUSES:
        return ClassifiedCase(path, "v1_gated", "ruling", status)
    if status == "closed" and has_plan_ruling:
        return ClassifiedCase(path, "v1_gated", "ruling", status)
    if status in {"hearing", "awaiting-evidence-direction", "terminated"} and has_plan_ruling:
        return ClassifiedCase(path, "v1_gated", "ruling", status)
    return ClassifiedCase(path, "v1_pre_gate", None, status)


def scan_cases(cases_root: Path, output: TextIO = sys.stdout) -> int:
    if not cases_root.is_dir():
        print(f"ERROR cases root does not exist: {cases_root}", file=output)
        return 1
    classified: list[ClassifiedCase] = []
    scan_errors: list[str] = []
    for case_path in sorted(cases_root.rglob("case.md")):
        try:
            classified.append(classify_case(case_path))
        except (OSError, UnicodeError, ValueError) as error:
            scan_errors.append(f"{case_path}: {error}")

    counts = {
        category: sum(item.category == category for item in classified)
        for category in ("v1_gated", "v1_pre_gate", "legacy")
    }
    print(
        "BOUNDARY_PROTOCOL_SCAN "
        f"total={len(classified) + len(scan_errors)} "
        f"v1_gated={counts['v1_gated']} "
        f"v1_pre_gate={counts['v1_pre_gate']} legacy={counts['legacy']} "
        f"invalid={len(scan_errors)}",
        file=output,
    )
    for item in classified:
        relative = item.path.relative_to(cases_root)
        if item.category == "legacy":
            print(f"LEGACY_SKIP {relative} status={item.status or 'missing'}", file=output)
        elif item.category == "v1_pre_gate":
            print(f"V1_PRE_GATE {relative} status={item.status}", file=output)

    issues = []
    for item in (entry for entry in classified if entry.category == "v1_gated"):
        case_issues = lint_case(item.path.parent, phase=item.phase or "ruling")
        if case_issues:
            issues.extend(case_issues)
        else:
            print(
                f"V1_GATE_PASS {item.path.parent.relative_to(cases_root)} "
                f"phase={item.phase} status={item.status}",
                file=output,
            )

    for error in scan_errors:
        print(f"ERROR {error}", file=output)
    for issue in issues:
        print(f"ERROR {issue}", file=output)
    if scan_errors or issues:
        print(f"FAIL: {len(scan_errors) + len(issues)} boundary gate issue(s)", file=output)
        return 1
    if counts["v1_gated"] == 0:
        print(
            "NOT_EVALUATED: no boundary_protocol:v1 case has entered a ruling or "
            "acceptance gate; executable assurance comes from the vendored self-tests",
            file=output,
        )
        return 0
    print(f"PASS: {counts['v1_gated']} boundary_protocol:v1 gated case(s)", file=output)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Gate PuPu boundary_protocol:v1 cases")
    parser.add_argument("--cases-root", type=Path, default=Path(".claude/court/cases"))
    args = parser.parse_args()
    return scan_cases(args.cases_root.resolve())


if __name__ == "__main__":
    raise SystemExit(main())
