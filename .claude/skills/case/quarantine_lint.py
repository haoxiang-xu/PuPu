#!/usr/bin/env python3
"""Fail-closed overlay for Chief-authorized proposal snapshot quarantine.

The frozen Quorum linter remains byte-for-byte upstream.  This PuPu gate only
selects a byte-bound canonical snapshot after verifying the preserved raw
proposal, a closed manifest, explicit migration cases, and a matching Chief
procedural ruling.  It then delegates every substantive check to the frozen
reference linter in an isolated copy.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import unicodedata

from tools.quorum_lint import Issue
from tools.quorum_lint.lint import _frontmatter, _rulings, lint_case as _lint_case


SCHEMA = "quorum.proposal_quarantine.v1"
MANIFEST_FIELD = "proposal_quarantine_manifest"
EXPECTED_KEYS = {
    "schema",
    "case_id",
    "source_path",
    "source_sha256",
    "snapshot_path",
    "snapshot_sha256",
    "migrated_to",
    "chief_authorization",
}
CASE_ID_RE = re.compile(r"^P-\d{4}-\d{4}-\d{4}-\d{4}$")
RULING_RE = re.compile(r"^R-\d{4}$")
SHA_RE = re.compile(r"^sha256:[0-9a-f]{64}$")


def _canonical_json(value: object) -> str:
    def normalize(item: object) -> object:
        if isinstance(item, str):
            return unicodedata.normalize("NFC", item)
        if isinstance(item, list):
            return [normalize(value) for value in item]
        if isinstance(item, dict):
            return {unicodedata.normalize("NFC", str(key)): normalize(value) for key, value in item.items()}
        return item

    return json.dumps(
        normalize(value),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _sha256(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _local_path(case_path: Path, value: object) -> Path | None:
    if not isinstance(value, str) or not value or "\\" in value:
        return None
    relative = Path(value)
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        return None
    resolved_case = case_path.resolve()
    resolved = (case_path / relative).resolve()
    try:
        resolved.relative_to(resolved_case)
    except ValueError:
        return None
    return resolved


def _read_manifest(path: Path, issues: list[Issue]) -> dict[str, object] | None:
    duplicates: list[str] = []

    def object_hook(pairs: list[tuple[str, object]]) -> dict[str, object]:
        result: dict[str, object] = {}
        for key, value in pairs:
            if key in result:
                duplicates.append(key)
            else:
                result[key] = value
        return result

    try:
        raw = path.read_text(encoding="utf-8")
        manifest = json.loads(raw, object_pairs_hook=object_hook)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        issues.append(Issue(path, f"proposal quarantine manifest is invalid JSON: {error}"))
        return None
    if not isinstance(manifest, dict):
        issues.append(Issue(path, "proposal quarantine manifest must be a JSON object"))
        return None
    if duplicates:
        issues.append(Issue(path, f"proposal quarantine manifest has duplicate keys: {sorted(set(duplicates))}"))
    canonical = _canonical_json(manifest)
    if raw not in {canonical, canonical + "\n"}:
        issues.append(Issue(path, "proposal quarantine manifest must use canonical JSON encoding with at most one trailing newline"))
    return manifest


def _resolve_snapshot(case_path: Path) -> tuple[Path | None, list[Issue]]:
    issues: list[Issue] = []
    case_index_path = case_path / "case.md"
    raw_proposal = case_path / "proposal.md"
    if not case_index_path.is_file():
        return None, issues
    metadata, _ = _frontmatter(case_index_path.read_text(encoding="utf-8"))
    manifest_ref = metadata.get(MANIFEST_FIELD)
    if not manifest_ref:
        return None, issues
    manifest_path = _local_path(case_path, manifest_ref)
    if manifest_path is None:
        issues.append(Issue(case_index_path, f"{MANIFEST_FIELD} must be a local case-relative path"))
        return None, issues
    if not manifest_path.is_file():
        issues.append(Issue(manifest_path, "proposal quarantine manifest is missing"))
        return None, issues
    manifest = _read_manifest(manifest_path, issues)
    if manifest is None:
        return None, issues
    if set(manifest) != EXPECTED_KEYS:
        issues.append(Issue(manifest_path, f"proposal quarantine manifest must use exact keys {sorted(EXPECTED_KEYS)}"))
    if manifest.get("schema") != SCHEMA:
        issues.append(Issue(manifest_path, f"proposal quarantine schema must be {SCHEMA}"))
    case_id = metadata.get("case_id", "")
    if manifest.get("case_id") != case_id:
        issues.append(Issue(manifest_path, "proposal quarantine case_id must match case.md"))
    if manifest.get("source_path") != "proposal.md":
        issues.append(Issue(manifest_path, "proposal quarantine source_path must be proposal.md"))
    source = _local_path(case_path, manifest.get("source_path"))
    snapshot = _local_path(case_path, manifest.get("snapshot_path"))
    if source is None or snapshot is None:
        issues.append(Issue(manifest_path, "proposal quarantine source and snapshot must be local case-relative paths"))
    for label, path, digest in (
        ("source", source, manifest.get("source_sha256")),
        ("snapshot", snapshot, manifest.get("snapshot_sha256")),
    ):
        if not isinstance(digest, str) or not SHA_RE.fullmatch(digest):
            issues.append(Issue(manifest_path, f"proposal quarantine {label} SHA-256 must be exact lowercase sha256:<64 hex>"))
        if path is None or not path.is_file():
            issues.append(Issue(path or manifest_path, f"proposal quarantine {label} file is missing"))
        elif digest != _sha256(path):
            issues.append(Issue(manifest_path, f"proposal quarantine {label} SHA-256 does not match preserved bytes"))
    migrated_to = manifest.get("migrated_to")
    if (
        not isinstance(migrated_to, list)
        or not migrated_to
        or any(not isinstance(item, str) or not CASE_ID_RE.fullmatch(item) for item in migrated_to)
        or len(migrated_to) != len(set(migrated_to))
        or case_id in migrated_to
    ):
        issues.append(Issue(manifest_path, "proposal quarantine migrated_to must be unique foreign proposal case IDs"))
    else:
        for migrated_case_id in migrated_to:
            migrated_case = case_path.parent / migrated_case_id / "case.md"
            if not migrated_case.is_file():
                issues.append(Issue(manifest_path, f"proposal quarantine migration case is missing: {migrated_case_id}"))
                continue
            migrated_metadata, _ = _frontmatter(migrated_case.read_text(encoding="utf-8"))
            if migrated_metadata.get("case_id") != migrated_case_id:
                issues.append(Issue(migrated_case, "proposal quarantine migration target case_id mismatch"))
    authorization = manifest.get("chief_authorization")
    ruling_path = case_path / "ruling.md"
    if not isinstance(authorization, str) or not RULING_RE.fullmatch(authorization):
        issues.append(Issue(manifest_path, "proposal quarantine Chief authorization must be one R-####"))
    else:
        rulings = _rulings(ruling_path.read_text(encoding="utf-8")) if ruling_path.is_file() else []
        matching = [ruling for ruling in rulings if ruling.identifier == authorization]
        source_binding = f"{manifest.get('source_path')} | {manifest.get('source_sha256')}"
        snapshot_binding = f"{manifest.get('snapshot_path')} | {manifest.get('snapshot_sha256')}"
        if (
            len(matching) != 1
            or matching[0].fields.get("ruling identity") != "Chief Judge"
            or matching[0].fields.get("record type") != "PROCEDURAL_RULING"
            or matching[0].fields.get("result") != "REMEDY_REQUIRED"
            or matching[0].fields.get("quarantine manifest") != manifest_ref
            or matching[0].fields.get("preserved source") != source_binding
            or matching[0].fields.get("canonical snapshot") != snapshot_binding
        ):
            issues.append(
                Issue(
                    ruling_path,
                    "proposal quarantine Chief authorization must resolve to one matching "
                    "PROCEDURAL_RULING with result REMEDY_REQUIRED and exact source/snapshot byte bindings",
                )
            )
    return snapshot, issues


def lint_case(path: str | Path, *, phase: str = "ruling") -> list[Issue]:
    requested = Path(path)
    case_path = requested.parent if requested.name == "proposal.md" else requested
    snapshot, issues = _resolve_snapshot(case_path)
    if snapshot is None:
        if issues:
            return issues
        return _lint_case(case_path, phase=phase)
    if issues:
        return issues
    with tempfile.TemporaryDirectory(prefix="quorum-proposal-quarantine-") as directory:
        isolated = Path(directory) / case_path.name
        shutil.copytree(case_path, isolated)
        shutil.copyfile(snapshot, isolated / "proposal.md")
        isolated_issues = _lint_case(isolated, phase=phase)
        mapped: list[Issue] = []
        for issue in isolated_issues:
            try:
                relative = issue.path.relative_to(isolated)
            except ValueError:
                mapped.append(issue)
                continue
            mapped_path = snapshot if relative == Path("proposal.md") else case_path / relative
            mapped.append(Issue(mapped_path, issue.message))
        return mapped
