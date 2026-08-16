#!/usr/bin/env python3
"""Self-tests for PuPu's v1 gated/pre-gate/legacy case scanner."""

from __future__ import annotations

from io import StringIO
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest

from boundary_gate import classify_case, scan_cases
from quarantine_lint import lint_case


def _case(root: Path, name: str, fields: str, extra: str = "") -> Path:
    directory = root / name
    directory.mkdir()
    path = directory / "case.md"
    path.write_text(f"---\n{fields}\n---\n{extra}\n", encoding="utf-8")
    return path


class BoundaryGateTests(unittest.TestCase):
    def _quarantined_fixture(self, root: Path) -> tuple[Path, Path]:
        fixture = Path(__file__).parent / "fixtures" / "valid-case"
        case = root / "P-0000-0001-2026-0812"
        shutil.copytree(fixture, case)
        snapshot = case / "proposal.canonical.md"
        shutil.copyfile(case / "proposal.md", snapshot)
        (case / "proposal.md").write_text(
            (case / "proposal.md").read_text(encoding="utf-8")
            + "\n### PS-002 | 2026-08-12T14:00:00Z\n"
            + "- **supersedes**: PS-001\n",
            encoding="utf-8",
        )
        case_index = case / "case.md"
        case_index.write_text(
            case_index.read_text(encoding="utf-8").replace(
                "status: acceptance\n",
                "status: acceptance\nproposal_quarantine_manifest: proposal-quarantine.json\n",
            ),
            encoding="utf-8",
        )
        migration_id = "P-0000-0002-2026-0812"
        _case(root, migration_id, f"case_id: {migration_id}\nstatus: drafting")
        digest = lambda path: "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()
        (case / "ruling.md").write_text(
            (case / "ruling.md").read_text(encoding="utf-8")
            + "\n## R-0002 | 2026-08-12T14:30:00Z\n"
            + "- **ruling identity**: Chief Judge\n"
            + "- **record type**: PROCEDURAL_RULING\n"
            + "- **result**: REMEDY_REQUIRED\n"
            + "- **quarantine manifest**: proposal-quarantine.json\n"
            + f"- **preserved source**: proposal.md | {digest(case / 'proposal.md')}\n"
            + f"- **canonical snapshot**: {snapshot.name} | {digest(snapshot)}\n",
            encoding="utf-8",
        )
        manifest = {
            "case_id": "P-0000-0001-2026-0812",
            "chief_authorization": "R-0002",
            "migrated_to": [migration_id],
            "schema": "quorum.proposal_quarantine.v1",
            "snapshot_path": snapshot.name,
            "snapshot_sha256": digest(snapshot),
            "source_path": "proposal.md",
            "source_sha256": digest(case / "proposal.md"),
        }
        manifest_path = case / "proposal-quarantine.json"
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
            encoding="utf-8",
        )
        return case, manifest_path

    def test_chief_authorized_quarantine_delegates_canonical_snapshot_to_frozen_linter(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._quarantined_fixture(Path(directory))
            self.assertEqual(lint_case(case, phase="ruling"), [])

    def test_quarantine_fails_closed_on_source_digest_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._quarantined_fixture(Path(directory))
            (case / "proposal.md").write_text("changed after authorization\n", encoding="utf-8")
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("source SHA-256 does not match preserved bytes" in issue.message for issue in issues))

    def test_quarantine_fails_closed_on_snapshot_digest_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._quarantined_fixture(Path(directory))
            (case / "proposal.canonical.md").write_text("changed after authorization\n", encoding="utf-8")
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("snapshot SHA-256 does not match preserved bytes" in issue.message for issue in issues))

    def test_quarantine_fails_closed_when_manifest_and_snapshot_drift_past_ruling(self):
        with tempfile.TemporaryDirectory() as directory:
            case, manifest_path = self._quarantined_fixture(Path(directory))
            snapshot = case / "proposal.canonical.md"
            snapshot.write_text(snapshot.read_text(encoding="utf-8") + "\n", encoding="utf-8")
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["snapshot_sha256"] = "sha256:" + hashlib.sha256(snapshot.read_bytes()).hexdigest()
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("exact source/snapshot byte bindings" in issue.message for issue in issues))

    def test_quarantine_fails_closed_on_nonlocal_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            case, manifest_path = self._quarantined_fixture(Path(directory))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["snapshot_path"] = "../proposal.md"
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("source and snapshot must be local case-relative paths" in issue.message for issue in issues))

    def test_quarantine_fails_closed_without_matching_chief_authorization(self):
        with tempfile.TemporaryDirectory() as directory:
            case, manifest_path = self._quarantined_fixture(Path(directory))
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["chief_authorization"] = "R-9999"
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("Chief authorization must resolve" in issue.message for issue in issues))

    def test_distinguishes_legacy_pre_gate_and_ruling_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            legacy = _case(root, "legacy", "case_id: old\nstatus: filed")
            pre_gate = _case(
                root,
                "pre",
                "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: v1\nstatus: filed",
            )
            ruling = _case(
                root,
                "ruling",
                "case_id: P-2\ndiscussion_type: proposal\nboundary_protocol: v1\nstatus: awaiting-ruling",
            )
            self.assertEqual(classify_case(legacy).category, "legacy")
            self.assertEqual(classify_case(pre_gate).category, "v1_pre_gate")
            self.assertEqual(classify_case(ruling).phase, "ruling")

    def test_legacy_proposal_before_effective_from_remains_legacy(self):
        with tempfile.TemporaryDirectory() as directory:
            case = _case(
                Path(directory),
                "case",
                "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: legacy\n"
                "created_at: 2026-08-11T23:59:59-07:00\nstatus: awaiting-ruling",
            )
            self.assertEqual(classify_case(case).category, "legacy")

    def test_proposal_at_effective_from_requires_v1(self):
        with tempfile.TemporaryDirectory() as directory:
            case = _case(
                Path(directory),
                "case",
                "case_id: P-1\ndiscussion_type: proposal\n"
                "created_at: 2026-08-12T00:00:00-07:00\nstatus: awaiting-ruling",
            )
            with self.assertRaisesRegex(ValueError, "must declare boundary_protocol: v1"):
                classify_case(case)

    def test_explicit_legacy_proposal_after_effective_from_is_invalid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _case(
                root,
                "case",
                "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: legacy\n"
                "created_at: 2026-08-13T12:00:00-07:00\nstatus: awaiting-ruling",
            )
            output = StringIO()
            self.assertEqual(scan_cases(root, output), 1)
            self.assertIn("must declare boundary_protocol: v1", output.getvalue())

    def test_legacy_proposal_missing_or_naive_created_at_is_invalid(self):
        for created_at in (None, "2026-08-11T23:59:59"):
            with self.subTest(created_at=created_at), tempfile.TemporaryDirectory() as directory:
                timestamp = f"\ncreated_at: {created_at}" if created_at else ""
                case = _case(
                    Path(directory),
                    "case",
                    "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: legacy"
                    f"{timestamp}\nstatus: filed",
                )
                with self.assertRaisesRegex(ValueError, "created_at"):
                    classify_case(case)

    def test_acceptance_snapshot_selects_acceptance_phase(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            case = _case(
                root,
                "case",
                "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: v1\nstatus: awaiting-ruling",
            )
            (case.parent / "acceptance.md").write_text("## AT-001 | now\n", encoding="utf-8")
            self.assertEqual(classify_case(case).phase, "acceptance")

    def test_duplicate_protocol_is_invalid(self):
        with tempfile.TemporaryDirectory() as directory:
            case = _case(
                Path(directory),
                "case",
                "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: v1\n"
                "boundary_protocol: legacy\nstatus: filed",
            )
            with self.assertRaisesRegex(ValueError, "duplicate canonical frontmatter key"):
                classify_case(case)

    def test_zero_v1_gate_is_not_reported_as_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _case(root, "legacy", "case_id: old\nstatus: filed")
            _case(
                root,
                "pre",
                "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: v1\nstatus: drafting",
            )
            output = StringIO()
            self.assertEqual(scan_cases(root, output), 0)
            report = output.getvalue()
            self.assertIn("v1_gated=0 v1_pre_gate=1 legacy=1", report)
            self.assertIn("NOT_EVALUATED", report)
            self.assertNotIn("\nPASS:", report)

    def test_invalid_gated_case_blocks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _case(
                root,
                "case",
                "case_id: P-1\ndiscussion_type: proposal\nboundary_protocol: v1\nstatus: awaiting-ruling",
            )
            output = StringIO()
            self.assertEqual(scan_cases(root, output), 1)
            self.assertIn("FAIL:", output.getvalue())


if __name__ == "__main__":
    unittest.main()
