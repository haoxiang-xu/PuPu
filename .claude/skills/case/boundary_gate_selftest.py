#!/usr/bin/env python3
"""Self-tests for PuPu's v1 gated/pre-gate/legacy case scanner."""

from __future__ import annotations

from io import StringIO
from pathlib import Path
import tempfile
import unittest

from boundary_gate import classify_case, scan_cases


def _case(root: Path, name: str, fields: str, extra: str = "") -> Path:
    directory = root / name
    directory.mkdir()
    path = directory / "case.md"
    path.write_text(f"---\n{fields}\n---\n{extra}\n", encoding="utf-8")
    return path


class BoundaryGateTests(unittest.TestCase):
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
