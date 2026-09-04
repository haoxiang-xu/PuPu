#!/usr/bin/env python3
"""Self-tests for PuPu's v1 gated/pre-gate/legacy case scanner."""

from __future__ import annotations

import base64
from io import StringIO
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from unittest import mock
import zlib

from boundary_gate import classify_case, scan_cases
import quarantine_lint
from quarantine_lint import lint_case


EVENT_HEADING_BYTES_RE = re.compile(rb"(?m)^## (S-\d{4}) \| [^\r\n]+\n")
P7_R6_QUARANTINE_TEMPLATE_BYTES = 113414
P7_R6_QUARANTINE_TEMPLATE_DIGEST = "sha256:61f36834ea263c1296dcd20ee656c2458a8103dd09a5877fb8bf7e5a718591be"
P7_R5_QUARANTINE_TEMPLATE_BYTES = 75579
P7_R5_QUARANTINE_TEMPLATE_DIGEST = "sha256:79347648e1a0b4ed770d1936d949af31b025a8cafed80a793ea44f7a96fad6cb"
P7_PREACTIVATION_CASE_BYTES = 15894
P7_PREACTIVATION_CASE_DIGEST = "sha256:0420af5fc0957393db03d8e68a5da6c0f4e59889fcf558aef439e6a40014ef81"
P7_PREACTIVATION_UPDATED_AT = "2026-08-16T17:14:16-07:00"
P7_PREACTIVATION_GATE_STATE = (
    "GATE_BLOCKED_RECORD_ERRATA_ACTIVATION_INTEGRITY_INCIDENT | R-0001 authorization preserved but "
    "activation failed; S-0051 INVALID; manifest pointer removed; overlay INACTIVE; successor activation "
    "NOT_AUTHORIZED without a new Chief ruling; S-0028 / S-0040 raw record defects remain visible; "
    "PS-008 / RS-003 NOT_YET_CREATED"
)
P7_R6_ROLLBACK_CASE_BYTES = 15951
P7_R6_ROLLBACK_CASE_DIGEST = "sha256:8818c5630d40e0f2d1384facce0921ebad1ca428907d3df04d0adb35b86fb9e7"
P7_R6_ROLLBACK_UPDATED_AT = "2026-08-16T21:22:42-07:00"
P7_R6_ROLLBACK_GATE_STATE = (
    "GATE_BLOCKED_RECORD_ERRATA_ACTIVATION_POSTCHECK_FAILED | R-0003 candidate preserved; R-0005 "
    "pointer authorization consumed but activation failed; manifest pointer removed; overlay INACTIVE; "
    "retry requires new Chief ruling; S-0051 remains INVALID; S-0052 / S-0053 preserved; S-0028 / "
    "S-0040 raw record defects visible; PS-008 / RS-003 NOT_YET_CREATED; production authority NONE"
)
P7_R6_FROZEN_MUTABLE_PREFIXES = {
    "proposal.md": (
        149965,
        "sha256:2fdbd5313a0915406702a876aa056e1733a2727f8225dbc32520a7c7463ef5ab",
    ),
    "record.md": (
        289717,
        "sha256:54997fc7b006260830c2b935eecdfa0d4f202770a328d25ed9c50f9297f31e21",
    ),
    "ruling.md": (
        51150,
        "sha256:a88bb9d3119aab3c6e2787430dc11d1cec664aa10f6b6f4393760d1a761476f4",
    ),
}
P7_FROZEN_MUTABLE_PREFIXES = {
    "proposal.md": (
        149965,
        "sha256:2fdbd5313a0915406702a876aa056e1733a2727f8225dbc32520a7c7463ef5ab",
    ),
    "record.md": (
        283127,
        "sha256:2f00f033c97deda801085736a6fb9270a7190ecb3ab0b7603f0964002efd5054",
    ),
    "ruling.md": (
        38598,
        "sha256:3a5143ccbb484134bea0d2b63bc843d435811fa805144ea154d117342d6f3ae3",
    ),
}
P7_FROZEN_STATIC_FILES = {
    "record-errata.S-0050.json": (
        1796,
        "sha256:9bed927485b8d679d3a78712101f4e8e89c86d0028bdcee2e670ec2ff54ba979",
    ),
    "record-errata.S-0052.json": (
        1796,
        "sha256:64f7d3af8a8642442e2aebd8eff266ca8863d7b0c4375b2a0c7e23ab99057df5",
    ),
    "record.canonical.through-S-0050.md": (
        267583,
        "sha256:5e60d30a8dcd42114425ebea1e0e699da71421e552a15c059c9d6bc5f6b0d684",
    ),
    "record.canonical.through-S-0052.md": (
        271890,
        "sha256:41da7be64a4789379a103b64211b24991a29933dee1262d3e4d88b0834e73724",
    ),
    "record.preserved.through-S-0050.md": (
        277012,
        "sha256:62d6ba315522b9010a852e4737de3c0ffe9b1fd65a996996fadea57ba0a720b0",
    ),
    "record.preserved.through-S-0052.md": (
        281319,
        "sha256:0fed6177aaa2b3bf27126dfdaaf1dac3d3c9a9b88ba1d9d63decf198ae843432",
    ),
}
P7_PREACTIVATION_CASE_ZLIB_BASE64 = (
    "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"
)


def _digest_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _digest_path(path: Path) -> str:
    return _digest_bytes(path.read_bytes())


def _canonical_manifest(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    ).encode("utf-8")


def _event_bytes(record: bytes, event_id: str) -> bytes:
    matches = list(EVENT_HEADING_BYTES_RE.finditer(record))
    selected = [index for index, match in enumerate(matches) if match.group(1).decode() == event_id]
    if len(selected) != 1:
        raise AssertionError(f"expected one {event_id}, found {len(selected)}")
    position = selected[0]
    start = matches[position].start()
    end = matches[position + 1].start() if position + 1 < len(matches) else len(record)
    return record[start:end]


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

    def _record_errata_fixture(
        self,
        root: Path,
        *,
        activate: bool = True,
        proposal_quarantine: bool = False,
    ) -> tuple[Path, Path, dict[str, object]]:
        case, _ = (
            self._quarantined_fixture(root)
            if proposal_quarantine
            else (root / "P-0000-0001-2026-0812", None)
        )
        if not proposal_quarantine:
            fixture = Path(__file__).parent / "fixtures" / "valid-case"
            shutil.copytree(fixture, case)

        record_path = case / "record.md"
        canonical_value = "SEQ-001 owner responsibility"
        raw_value = "SEQ-001, SEQ-001 owner responsibility"
        canonical_line = f"- **contribution**: {canonical_value}\n"
        raw_line = f"- **contribution**: {raw_value}\n"
        canonical_text = record_path.read_text(encoding="utf-8")
        self.assertEqual(canonical_text.count(canonical_line), 1)
        raw_text = canonical_text.replace(canonical_line, raw_line)
        raw_prefix = raw_text.encode("utf-8")
        canonical_prefix = canonical_text.encode("utf-8")
        record_path.write_bytes(raw_prefix)

        cutoff_event_id = "S-0008"
        preserved = case / "record.preserved.through-S-0008.md"
        canonical = case / "record.canonical.through-S-0008.md"
        preserved.write_bytes(raw_prefix)
        canonical.write_bytes(canonical_prefix)
        raw_event = _event_bytes(raw_prefix, "S-0004")
        canonical_event = _event_bytes(canonical_prefix, "S-0004")
        authorization = "R-0003" if proposal_quarantine else "R-0002"

        manifest = {
            "canonical_prefix_path": canonical.name,
            "canonical_prefix_sha256": _digest_path(canonical),
            "case_id": "P-0000-0001-2026-0812",
            "chief_authorization": authorization,
            "cutoff_event_id": cutoff_event_id,
            "event_allowlist": ["S-0004"],
            "event_patches": [
                {
                    "canonical_event_sha256": _digest_bytes(canonical_event),
                    "changes": [
                        {
                            "canonical_value": canonical_value,
                            "canonical_value_sha256": _digest_bytes(canonical_value.encode("utf-8")),
                            "field": "contribution",
                            "operation": "REPLACE_FIELD_VALUE",
                            "raw_value_sha256": _digest_bytes(raw_value.encode("utf-8")),
                        }
                    ],
                    "event_id": "S-0004",
                    "raw_event_sha256": _digest_bytes(raw_event),
                }
            ],
            "live_path": "record.md",
            "preserved_prefix_bytes": len(raw_prefix),
            "preserved_prefix_path": preserved.name,
            "preserved_prefix_sha256": _digest_path(preserved),
            "schema": "quorum.record_errata.v1",
        }
        manifest_path = case / "record-errata.S-0008.json"
        manifest_path.write_bytes(_canonical_manifest(manifest))
        manifest_digest = _digest_path(manifest_path)

        ruling_path = case / "ruling.md"
        ruling_path.write_text(
            ruling_path.read_text(encoding="utf-8")
            + f"\n## {authorization} | 2026-08-12T14:30:00Z\n"
            + "- **ruling identity**: Chief Judge\n"
            + "- **record type**: PROCEDURAL_RULING\n"
            + "- **basis**: Chief Judge user message 2026-08-12 “批准” | "
            + "utf8-sha256:8cbe697b157364a5b13646285b38409dc53ec5287deeb7913493e65b275cd14d\n"
            + "- **result**: REMEDY_REQUIRED\n"
            + "- **record errata schema**: quorum.record_errata.v1\n"
            + f"- **errata manifest**: {manifest_path.name} | {manifest_digest}\n"
            + f"- **preserved source prefix**: {preserved.name} | bytes:{len(raw_prefix)} | {_digest_path(preserved)}\n"
            + f"- **canonical prefix**: {canonical.name} | {_digest_path(canonical)}\n"
            + f"- **cutoff event**: {cutoff_event_id}\n"
            + "- **event allowlist**: S-0004\n"
            + f"- **S-0004 raw / canonical event hashes**: {_digest_bytes(raw_event)} / {_digest_bytes(canonical_event)}\n"
            + "- **S-0004 exact patch**: REPLACE_FIELD_VALUE | contribution | "
            + f"{_digest_bytes(raw_value.encode('utf-8'))} | {canonical_value} | "
            + f"{_digest_bytes(canonical_value.encode('utf-8'))}\n"
            + "- **authorization limit**: raw record prefix immutable; closed manifest and exact patches only\n",
            encoding="utf-8",
        )

        suffix = (
            "## S-0009 | 2026-08-12T14:31:00Z\n"
            "- **case**: P-0000-0001-2026-0812\n"
            "- **discussion type**: proposal\n"
            "- **procedure mode**: collaboration\n"
            "- **speaker**: speaker-of-the-house\n"
            "- **type**: NOTICE\n"
            f"- **target**: {authorization}\n"
            f"- **basis**: {authorization}\n"
            f"- **decision effect**: 激活 {authorization} 授权的 record errata prefix overlay\n"
            "- **notice kind**: RECORD_ERRATA_ACTIVATED\n"
            f"- **record errata manifest**: {manifest_path.name} | {manifest_digest}\n"
            f"- **preserved source prefix**: {preserved.name} | bytes:{len(raw_prefix)} | {_digest_path(preserved)}\n"
            f"- **canonical prefix**: {canonical.name} | {_digest_path(canonical)}\n"
        )
        record_path.write_bytes(raw_prefix + suffix.encode("utf-8"))
        if activate:
            case_index = case / "case.md"
            case_index.write_text(
                case_index.read_text(encoding="utf-8").replace(
                    "status: acceptance\n",
                    f"status: acceptance\nrecord_errata_manifest: {manifest_path.name}\n",
                ),
                encoding="utf-8",
            )
        return case, manifest_path, manifest

    def _p7_frozen_case_fixture(self, root: Path, *, source: Path | None = None) -> Path:
        source = source or Path(__file__).parents[2] / "court" / "cases" / "P-0000-0007-2026-0815"
        case = root / source.name
        shutil.copytree(source, case)
        frozen_case = zlib.decompress(
            base64.b64decode(P7_PREACTIVATION_CASE_ZLIB_BASE64, validate=True)
        )
        self.assertEqual(len(frozen_case), P7_PREACTIVATION_CASE_BYTES)
        self.assertEqual(_digest_bytes(frozen_case), P7_PREACTIVATION_CASE_DIGEST)
        (case / "case.md").write_bytes(frozen_case)
        for name, (prefix_bytes, prefix_digest) in P7_FROZEN_MUTABLE_PREFIXES.items():
            path = case / name
            observed = path.read_bytes()
            self.assertGreaterEqual(len(observed), prefix_bytes)
            frozen_prefix = observed[:prefix_bytes]
            self.assertEqual(_digest_bytes(frozen_prefix), prefix_digest)
            path.write_bytes(frozen_prefix)
        for name, (expected_bytes, expected_digest) in P7_FROZEN_STATIC_FILES.items():
            observed = (case / name).read_bytes()
            self.assertEqual(len(observed), expected_bytes)
            self.assertEqual(_digest_bytes(observed), expected_digest)
        return case

    def _p7_record_errata_fixture(self, root: Path) -> tuple[Path, dict[str, object]]:
        case = self._p7_frozen_case_fixture(root)
        ruling_path = case / "ruling.md"
        historical_rulings = ruling_path.read_bytes()
        successor_heading = historical_rulings.index(b"## R-0002 |")
        ruling_path.write_bytes(historical_rulings[:successor_heading])
        manifest_path = case / "record-errata.S-0050.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        record = case / "record.md"
        prefix_bytes = manifest["preserved_prefix_bytes"]
        raw_prefix = record.read_bytes()[:prefix_bytes]
        manifest_digest = _digest_path(manifest_path)
        activation = (
            "## S-0051 | 2026-08-16T13:20:00-07:00\n"
            "- **case**: P-0000-0007-2026-0815\n"
            "- **discussion type**: proposal\n"
            "- **procedure mode**: collaboration\n"
            "- **speaker**: speaker-of-the-house\n"
            "- **type**: NOTICE\n"
            "- **target**: R-0001\n"
            "- **basis**: R-0001\n"
            "- **decision effect**: 激活 R-0001 授权的 record errata prefix overlay\n"
            "- **notice kind**: RECORD_ERRATA_ACTIVATED\n"
            f"- **record errata manifest**: record-errata.S-0050.json | {manifest_digest}\n"
            f"- **preserved source prefix**: {manifest['preserved_prefix_path']} | bytes:{prefix_bytes} | {manifest['preserved_prefix_sha256']}\n"
            f"- **canonical prefix**: {manifest['canonical_prefix_path']} | {manifest['canonical_prefix_sha256']}\n"
        )
        record.write_bytes(raw_prefix + activation.encode("utf-8"))
        case_index = case / "case.md"
        case_text = case_index.read_text(encoding="utf-8")
        if "record_errata_manifest:" not in case_text:
            case_text = case_text.replace(
                "status: drafting\n",
                "status: drafting\nrecord_errata_manifest: record-errata.S-0050.json\n",
            )
        case_index.write_text(case_text, encoding="utf-8")
        return case, manifest

    def _p7_live_old_pointer_fixture(self, root: Path) -> Path:
        case = self._p7_frozen_case_fixture(root)
        case_index = case / "case.md"
        case_text = case_index.read_text(encoding="utf-8")
        self.assertNotIn("record_errata_manifest:", case_text)
        case_index.write_text(
            case_text.replace(
                "boundary_protocol: v1\n",
                "boundary_protocol: v1\n"
                "record_errata_manifest: record-errata.S-0050.json\n",
                1,
            ),
            encoding="utf-8",
        )
        return case

    def _assert_p7_install_case_candidate(
        self,
        case: Path,
        *,
        r5_timestamp: str,
        observed_wall_clock: str,
    ) -> None:
        case_bytes = (case / "case.md").read_bytes()
        case_text = case_bytes.decode("utf-8")
        metadata, duplicate_fields = quarantine_lint._frontmatter(case_text)
        self.assertFalse(
            any(
                name in duplicate_fields
                for name in ("boundary_protocol", "record_errata_manifest", "updated_at")
            )
        )
        self.assertEqual(metadata.get("updated_at"), observed_wall_clock)
        observed = quarantine_lint._parse_timestamp(observed_wall_clock)
        r5 = quarantine_lint._parse_timestamp(r5_timestamp)
        self.assertIsNotNone(observed)
        self.assertIsNotNone(r5)
        self.assertGreater(observed, r5)
        self.assertEqual(len(case_bytes), 15902)
        self.assertEqual(
            case_bytes.count(b"boundary_protocol: v1\nrecord_errata_manifest: record-errata.S-0052.json\n"),
            1,
        )
        self.assertEqual(
            case_bytes.count(f"- **gate state**: {quarantine_lint.P7_INITIAL_ACTIVE_GATE_STATE}".encode("utf-8")),
            1,
        )
        baseline = case_text.replace(
            "boundary_protocol: v1\nrecord_errata_manifest: record-errata.S-0052.json\n",
            "boundary_protocol: v1\n",
            1,
        ).replace(
            f"updated_at: {observed_wall_clock}\n",
            f"updated_at: {P7_PREACTIVATION_UPDATED_AT}\n",
            1,
        ).replace(
            f"- **gate state**: {quarantine_lint.P7_INITIAL_ACTIVE_GATE_STATE}",
            f"- **gate state**: {P7_PREACTIVATION_GATE_STATE}",
            1,
        ).encode("utf-8")
        self.assertEqual(len(baseline), P7_PREACTIVATION_CASE_BYTES)
        self.assertEqual(_digest_bytes(baseline), P7_PREACTIVATION_CASE_DIGEST)

    def _p7_successor_pointer_fixture(self, root: Path) -> tuple[Path, str, str]:
        case = self._p7_frozen_case_fixture(root)
        timestamp = "2026-08-16T19:40:00-07:00"
        basis = (
            "R-0001, R-0002, R-0003, R-0004, S-0051, S-0052, S-0053；"
            "Chief Judge user message 2026-08-16 “批准 R-0005” | "
            "utf8-sha256:4f61d04cb0c4b59ec432dc09a0dce71a3abfe697883710ff57667f5c018be58a"
        )
        fields = {
            name: f"TEST_ONLY_{index:02d}_{name.upper().replace(' ', '_')}"
            for index, name in enumerate(quarantine_lint.P7_R5_FIELD_ORDER, start=1)
        }
        raw_names = dict(
            zip(
                quarantine_lint.P7_R5_PARSED_FIELD_ORDER,
                quarantine_lint.P7_R5_FIELD_ORDER,
            )
        )
        fields.update(
            {
                raw_names[name]: value
                for name, value in quarantine_lint.P7_R5_EXACT_BINDINGS.items()
            }
        )
        fields["basis"] = basis
        fields["tooling template"] = "TEST_ONLY_TEMPLATE_BINDING"
        fields["tooling substitution placeholders"] = "TEST_ONLY_TWO_EXACT_PLACEHOLDERS"
        fields["tooling verification"] = "TEST_ONLY_GREEN_COUNTS"
        fields["exact write_set"] = "TEST_ONLY_WRITE_SET"
        fields["execution order"] = "TEST_ONLY_EXECUTION_ORDER"
        fields["rollback authority"] = "TEST_ONLY_ROLLBACK_AUTHORITY"
        fields["expected rollback case shape"] = "TEST_ONLY_ROLLBACK_SHAPE"
        fields["authorization limit"] = "TEST_ONLY_AUTHORIZATION_LIMIT"
        fields["appeal to Chief"] = "Café"
        fields["stop condition"] = "TEST_ONLY_STOP"
        ordered = list(quarantine_lint.P7_R5_FIELD_ORDER)
        self.assertEqual(set(fields), set(ordered))
        ruling_path = case / "ruling.md"
        self.assertEqual(len(ruling_path.read_bytes()), quarantine_lint.P7_RULING_THROUGH_R4_BYTES)
        ruling = f"## R-0005 | {timestamp}\n" + "".join(
            f"- **{name}**: {fields[name]}\n" for name in ordered
        )
        ruling_path.write_text(
            ruling_path.read_text(encoding="utf-8") + "\n" + ruling,
            encoding="utf-8",
        )
        parsed = [
            item
            for item in quarantine_lint._rulings(ruling_path.read_text(encoding="utf-8"))
            if item.identifier == "R-0005"
        ]
        self.assertEqual(len(parsed), 1)
        digest = quarantine_lint._ruling_envelope_digest(parsed[0])

        case_index = case / "case.md"
        case_text = case_index.read_text(encoding="utf-8")
        self.assertNotIn("record_errata_manifest:", case_text)
        case_text = case_text.replace(
            "boundary_protocol: v1\n",
            "boundary_protocol: v1\n"
            "record_errata_manifest: record-errata.S-0052.json\n",
            1,
        ).replace(
            "updated_at: 2026-08-16T17:14:16-07:00",
            "updated_at: 2026-08-16T19:40:01-07:00",
            1,
        )
        old_gate_lines = [
            line for line in case_text.splitlines() if line.startswith("- **gate state**: ")
        ]
        self.assertEqual(len(old_gate_lines), 1)
        case_text = case_text.replace(
            old_gate_lines[0],
            f"- **gate state**: {quarantine_lint.P7_INITIAL_ACTIVE_GATE_STATE}",
            1,
        )
        case_index.write_text(case_text, encoding="utf-8")
        self._assert_p7_install_case_candidate(
            case,
            r5_timestamp=timestamp,
            observed_wall_clock="2026-08-16T19:40:01-07:00",
        )
        return case, timestamp, digest

    def _p7_r6_frozen_case_fixture(self, root: Path, *, source: Path | None = None) -> Path:
        source = source or Path(__file__).parents[2] / "court" / "cases" / "P-0000-0007-2026-0815"
        case = root / source.name
        shutil.copytree(source, case)
        frozen_case = zlib.decompress(
            base64.b64decode(P7_PREACTIVATION_CASE_ZLIB_BASE64, validate=True)
        ).decode("utf-8")
        frozen_case = frozen_case.replace(
            f"updated_at: {P7_PREACTIVATION_UPDATED_AT}",
            f"updated_at: {P7_R6_ROLLBACK_UPDATED_AT}",
            1,
        ).replace(
            f"- **gate state**: {P7_PREACTIVATION_GATE_STATE}",
            f"- **gate state**: {P7_R6_ROLLBACK_GATE_STATE}",
            1,
        ).encode("utf-8")
        self.assertEqual(len(frozen_case), P7_R6_ROLLBACK_CASE_BYTES)
        self.assertEqual(_digest_bytes(frozen_case), P7_R6_ROLLBACK_CASE_DIGEST)
        (case / "case.md").write_bytes(frozen_case)
        for name, (prefix_bytes, prefix_digest) in P7_R6_FROZEN_MUTABLE_PREFIXES.items():
            path = case / name
            observed = path.read_bytes()
            self.assertGreaterEqual(len(observed), prefix_bytes)
            frozen_prefix = observed[:prefix_bytes]
            self.assertEqual(_digest_bytes(frozen_prefix), prefix_digest)
            path.write_bytes(frozen_prefix)
        for name, (expected_bytes, expected_digest) in P7_FROZEN_STATIC_FILES.items():
            observed = (case / name).read_bytes()
            self.assertEqual(len(observed), expected_bytes)
            self.assertEqual(_digest_bytes(observed), expected_digest)
        return case

    def _assert_p7_r6_install_case_candidate(
        self,
        case: Path,
        *,
        r6_timestamp: str,
        observed_wall_clock: str,
    ) -> None:
        case_bytes = (case / "case.md").read_bytes()
        case_text = case_bytes.decode("utf-8")
        metadata, duplicate_fields = quarantine_lint._frontmatter(case_text)
        self.assertFalse(
            any(
                name in duplicate_fields
                for name in ("boundary_protocol", "record_errata_manifest", "updated_at")
            )
        )
        self.assertEqual(metadata.get("updated_at"), observed_wall_clock)
        observed = quarantine_lint._parse_timestamp(observed_wall_clock)
        archived = quarantine_lint._parse_timestamp(r6_timestamp)
        self.assertIsNotNone(observed)
        self.assertIsNotNone(archived)
        self.assertGreater(observed, archived)
        self.assertEqual(len(case_bytes), 16032)
        self.assertEqual(
            case_bytes.count(
                b"boundary_protocol: v1\nrecord_errata_manifest: record-errata.S-0052.json\n"
            ),
            1,
        )
        self.assertEqual(
            case_bytes.count(
                f"- **gate state**: {quarantine_lint.P7_INITIAL_ACTIVE_GATE_STATE}".encode("utf-8")
            ),
            1,
        )
        baseline = case_text.replace(
            "boundary_protocol: v1\nrecord_errata_manifest: record-errata.S-0052.json\n",
            "boundary_protocol: v1\n",
            1,
        ).replace(
            f"updated_at: {observed_wall_clock}\n",
            f"updated_at: {P7_R6_ROLLBACK_UPDATED_AT}\n",
            1,
        ).replace(
            f"- **gate state**: {quarantine_lint.P7_INITIAL_ACTIVE_GATE_STATE}",
            f"- **gate state**: {P7_R6_ROLLBACK_GATE_STATE}",
            1,
        ).encode("utf-8")
        self.assertEqual(len(baseline), P7_R6_ROLLBACK_CASE_BYTES)
        self.assertEqual(_digest_bytes(baseline), P7_R6_ROLLBACK_CASE_DIGEST)

    def _p7_r6_successor_pointer_fixture(self, root: Path) -> tuple[Path, str, str]:
        case = self._p7_r6_frozen_case_fixture(root)
        timestamp = "2026-08-16T21:30:00-07:00"
        updated_at = "2026-08-16T21:30:01-07:00"
        basis = (
            "R-0001, R-0002, R-0003, R-0004, R-0005, S-0051, S-0052, S-0053, S-0054；"
            "Chief Judge user message 2026-08-16 “批准 R-0006” | "
            "utf8-sha256:13b0c24f1b2ebd34591e504a18a99e8dfe6ce965198ec9d218c21fccbec46b52"
        )
        fields = {
            name: f"TEST_ONLY_{index:02d}_{name.upper().replace(' ', '_')}"
            for index, name in enumerate(quarantine_lint.P7_R6_FIELD_ORDER, start=1)
        }
        raw_names = dict(
            zip(
                quarantine_lint.P7_R6_PARSED_FIELD_ORDER,
                quarantine_lint.P7_R6_FIELD_ORDER,
            )
        )
        fields.update(
            {
                raw_names[name]: value
                for name, value in quarantine_lint.P7_R6_EXACT_BINDINGS.items()
            }
        )
        fields["basis"] = basis
        fields["tooling template"] = "TEST_ONLY_TEMPLATE_BINDING"
        fields["tooling verification"] = "TEST_ONLY_GREEN_COUNTS"
        fields["exact write_set"] = "TEST_ONLY_WRITE_SET"
        fields["execution order"] = "TEST_ONLY_EXECUTION_ORDER"
        fields["rollback authority"] = "TEST_ONLY_ROLLBACK_AUTHORITY"
        fields["expected rollback case shape"] = "TEST_ONLY_ROLLBACK_SHAPE"
        fields["authorization limit"] = "TEST_ONLY_AUTHORIZATION_LIMIT"
        fields["appeal to Chief"] = "Café"
        fields["stop condition"] = "TEST_ONLY_STOP"
        ordered = list(quarantine_lint.P7_R6_FIELD_ORDER)
        self.assertEqual(set(fields), set(ordered))
        ruling_path = case / "ruling.md"
        self.assertEqual(len(ruling_path.read_bytes()), quarantine_lint.P7_RULING_THROUGH_R5_BYTES)
        ruling = f"## R-0006 | {timestamp}\n" + "".join(
            f"- **{name}**: {fields[name]}\n" for name in ordered
        )
        ruling_path.write_text(
            ruling_path.read_text(encoding="utf-8") + "\n" + ruling,
            encoding="utf-8",
        )
        parsed = [
            item
            for item in quarantine_lint._rulings(ruling_path.read_text(encoding="utf-8"))
            if item.identifier == "R-0006"
        ]
        self.assertEqual(len(parsed), 1)
        digest = quarantine_lint._ruling_envelope_digest(parsed[0])

        case_index = case / "case.md"
        case_text = case_index.read_text(encoding="utf-8")
        self.assertNotIn("record_errata_manifest:", case_text)
        case_text = case_text.replace(
            "boundary_protocol: v1\n",
            "boundary_protocol: v1\n"
            "record_errata_manifest: record-errata.S-0052.json\n",
            1,
        ).replace(
            f"updated_at: {P7_R6_ROLLBACK_UPDATED_AT}",
            f"updated_at: {updated_at}",
            1,
        ).replace(
            f"- **gate state**: {P7_R6_ROLLBACK_GATE_STATE}",
            f"- **gate state**: {quarantine_lint.P7_INITIAL_ACTIVE_GATE_STATE}",
            1,
        )
        case_index.write_text(case_text, encoding="utf-8")
        self._assert_p7_r6_install_case_candidate(
            case,
            r6_timestamp=timestamp,
            observed_wall_clock=updated_at,
        )
        return case, timestamp, digest

    def _p7_future_event(
        self,
        identifier: str,
        timestamp: str,
        *,
        event_type: str = "NOTICE",
        extension: str = "- **extension field**: opaque NFC value\n",
        json_attachment: bytes = b"",
    ) -> bytes:
        return (
            f"## {identifier} | {timestamp}\n"
            "- **case**: P-0000-0007-2026-0815\n"
            "- **discussion type**: proposal\n"
            "- **procedure mode**: collaboration\n"
            "- **speaker**: speaker-of-the-house\n"
            f"- **type**: {event_type}\n"
            "- **target**: RS-003\n"
            "- **basis**: R-0006\n"
            "- **decision effect**: preserve one strict append-only event\n"
            f"{extension}"
        ).encode("utf-8") + json_attachment

    def _p7_r6_resolve(
        self,
        case: Path,
        timestamp: str,
        digest: str,
    ) -> tuple[bytes | None, Path | None, list[object]]:
        with mock.patch.multiple(
            quarantine_lint,
            P7_R6_TIMESTAMP=timestamp,
            P7_R6_AUTHORIZATION_DIGEST=digest,
        ):
            return quarantine_lint._resolve_record_overlay(case)

    def _p7_r6_lint(
        self,
        case: Path,
        timestamp: str,
        digest: str,
    ) -> list[object]:
        with mock.patch.multiple(
            quarantine_lint,
            P7_R6_TIMESTAMP=timestamp,
            P7_R6_AUTHORIZATION_DIGEST=digest,
        ):
            return lint_case(case, phase="ruling")

    def _assert_p7_r6_invalid_before_frozen_lint(
        self,
        case: Path,
        timestamp: str,
        digest: str,
    ) -> list[object]:
        with mock.patch.multiple(
            quarantine_lint,
            P7_R6_TIMESTAMP=timestamp,
            P7_R6_AUTHORIZATION_DIGEST=digest,
        ), mock.patch("quarantine_lint._lint_case") as frozen_lint:
            issues = lint_case(case, phase="ruling")
        self.assertEqual(frozen_lint.call_count, 0)
        self.assertTrue(issues)
        return issues

    def _assert_p7_r6_future_record_invalid(
        self,
        future: bytes,
        *,
        delimiter: bytes = b"\n",
    ) -> list[object]:
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            record = case / "record.md"
            record.write_bytes(record.read_bytes() + delimiter + future)
            return self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)

    def test_p7_r6_exact_authority_composes_current_through_s0054_record(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            composed, live_record, issues = self._p7_r6_resolve(case, timestamp, digest)
            self.assertEqual(issues, [])
            self.assertEqual(live_record, case / "record.md")
            self.assertIsNotNone(composed)
            self.assertEqual(len(composed), quarantine_lint.P7_POST_S0054_COMPOSED_BYTES)
            self.assertEqual(_digest_bytes(composed), quarantine_lint.P7_POST_S0054_COMPOSED_DIGEST)

    def test_p7_r6_active_direct_lint_has_only_two_non_record_blockers(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            issues = self._p7_r6_lint(case, timestamp, digest)
            self.assertEqual(
                [issue.message for issue in issues],
                [
                    "boundary_revision_set must be an exact immutable sha256:<producer>+sha256:<consumer> pair",
                    "acceptance validation requires an APPROVED ACTION PLAN_RULING",
                ],
            )

    def test_p7_r5_only_pointer_authority_is_consumed_and_nonreactivatable(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            ruling = case / "ruling.md"
            ruling.write_bytes(ruling.read_bytes()[: quarantine_lint.P7_RULING_THROUGH_R5_BYTES])
            issues = self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)
            self.assertTrue(any("R-0006" in issue.message and "R-0005" in issue.message for issue in issues))

    def test_p7_r6_authority_must_be_unique_and_immediately_follow_r5(self):
        for label, mutate in (
            (
                "missing",
                lambda raw: raw[: quarantine_lint.P7_RULING_THROUGH_R5_BYTES],
            ),
            (
                "duplicate",
                lambda raw: raw
                + b"\n"
                + raw[quarantine_lint.P7_RULING_THROUGH_R5_BYTES + 1 :],
            ),
            (
                "extra delimiter",
                lambda raw: raw[: quarantine_lint.P7_RULING_THROUGH_R5_BYTES]
                + b"\n\n"
                + raw[quarantine_lint.P7_RULING_THROUGH_R5_BYTES + 1 :],
            ),
        ):
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                ruling = case / "ruling.md"
                ruling.write_bytes(mutate(ruling.read_bytes()))
                issues = self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)
                self.assertTrue(any("R-0006" in issue.message for issue in issues), issues)

    def test_p7_r6_rejects_field_reorder_extra_field_and_unparsed_bytes(self):
        for label, mutate in (
            (
                "reorder",
                lambda value: value.replace(
                    "- **ruling identity**: Chief Judge\n- **record type**: PROCEDURAL_RULING\n",
                    "- **record type**: PROCEDURAL_RULING\n- **ruling identity**: Chief Judge\n",
                    1,
                ),
            ),
            (
                "extra field",
                lambda value: value.replace(
                    "- **stop condition**: TEST_ONLY_STOP\n",
                    "- **unexpected**: forbidden\n- **stop condition**: TEST_ONLY_STOP\n",
                    1,
                ),
            ),
            (
                "unparsed",
                lambda value: value + "UNPARSED\n",
            ),
        ):
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                ruling = case / "ruling.md"
                value = ruling.read_text(encoding="utf-8")
                ruling.write_text(mutate(value), encoding="utf-8")
                issues = self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)
                self.assertTrue(any("R-0006" in issue.message for issue in issues), issues)

    def test_p7_r6_rejects_timestamp_approval_envelope_and_nfc_drift(self):
        mutations = (
            ("backdate", "## R-0006 | 2026-08-16T21:30:00-07:00", "## R-0006 | 2026-08-16T20:30:00-07:00"),
            ("approval", "批准 R-0006", "批准 R-0007"),
            ("NFD", "Café", "Cafe\u0301"),
            ("binding", "R-0005 approval was consumed", "R-0005 approval was reusable"),
        )
        for label, old, new in mutations:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                ruling = case / "ruling.md"
                value = ruling.read_text(encoding="utf-8")
                self.assertIn(old, value)
                ruling.write_text(value.replace(old, new, 1), encoding="utf-8")
                issues = self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)
                self.assertTrue(any("R-0006" in issue.message for issue in issues), issues)

    def test_p7_r6_allows_one_strict_future_r7_ruling(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            future = (
                "## R-0007 | 2026-08-16T21:31:00-07:00\n"
                "- **ruling identity**: Chief Judge\n"
                "- **record type**: PROCEDURAL_RULING\n"
                "- **discussion type / procedure mode**: proposal | collaboration\n"
                "- **basis**: R-0006\n"
                "- **result**: VALID\n"
            ).encode("utf-8")
            ruling = case / "ruling.md"
            ruling.write_bytes(ruling.read_bytes() + b"\n" + future)
            composed, _, issues = self._p7_r6_resolve(case, timestamp, digest)
            self.assertEqual(issues, [])
            self.assertIsNotNone(composed)

    def test_p7_r6_rejects_invalid_future_ruling_chain_from_r7(self):
        valid = (
            "## R-0007 | 2026-08-16T21:31:00-07:00\n"
            "- **ruling identity**: Chief Judge\n"
            "- **record type**: PROCEDURAL_RULING\n"
            "- **discussion type / procedure mode**: proposal | collaboration\n"
            "- **basis**: R-0006\n"
            "- **result**: VALID\n"
        )
        variants = (
            ("missing delimiter", b"", valid.encode("utf-8")),
            ("extra delimiter", b"\n\n", valid.encode("utf-8")),
            ("naive", b"\n", valid.replace("-07:00", "").encode("utf-8")),
            (
                "reordered envelope",
                b"\n",
                valid.replace(
                    "- **ruling identity**: Chief Judge\n- **record type**: PROCEDURAL_RULING\n",
                    "- **record type**: PROCEDURAL_RULING\n- **ruling identity**: Chief Judge\n",
                    1,
                ).encode("utf-8"),
            ),
            ("junk", b"\n", (valid + "UNPARSED\n").encode("utf-8")),
        )
        for label, delimiter, future in variants:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                ruling = case / "ruling.md"
                ruling.write_bytes(ruling.read_bytes() + delimiter + future)
                issues = self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)
                self.assertTrue(any("R-0006 raw item" in issue.message for issue in issues), issues)

    def test_p7_r6_future_ruling_canonical_json_is_strict(self):
        prefix = (
            "## R-0007 | 2026-08-16T21:31:00-07:00\n"
            "- **ruling identity**: Chief Judge\n"
            "- **record type**: PROCEDURAL_RULING\n"
            "- **discussion type / procedure mode**: proposal | collaboration\n"
            "- **basis**: R-0006\n"
            "- **payload exact canonical JSON**:\n"
            "```json\n"
        ).encode("utf-8")
        suffix = b"```\n"
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            ruling = case / "ruling.md"
            ruling.write_bytes(ruling.read_bytes() + b"\n" + prefix + b'{"nested":{"label":"Caf\xc3\xa9"}}\n' + suffix)
            composed, _, issues = self._p7_r6_resolve(case, timestamp, digest)
            self.assertEqual(issues, [])
            self.assertIsNotNone(composed)
        for json_line in (
            b'{"a":1,"a":2}\n',
            b'[1]\n',
            b'{"a":NaN}\n',
            '{"label":"Cafe\u0301"}\n'.encode("utf-8"),
            '{"label":"X\ufeffY"}\n'.encode("utf-8"),
            b'{"label":"X\\ufeffY"}\n',
            b'{"label":"X\\u0000Y"}\n',
            b'{"value":"\\ud800"}\n',
        ):
            with self.subTest(json=json_line), tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                ruling = case / "ruling.md"
                ruling.write_bytes(ruling.read_bytes() + b"\n" + prefix + json_line + suffix)
                self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)

    def test_p7_r6_rejects_embedded_bom_in_future_event_field(self):
        future = self._p7_future_event("S-0055", "2026-08-16T21:31:00-07:00").replace(
            b"- **basis**: R-0006\n",
            "- **basis**: R-0006\ufeffX\n".encode("utf-8"),
            1,
        )
        self._assert_p7_r6_future_record_invalid(future)

    def test_p7_r6_rejects_embedded_bom_in_future_ruling_field(self):
        future = (
            "## R-0007 | 2026-08-16T21:31:00-07:00\n"
            "- **ruling identity**: Chief Judge\n"
            "- **record type**: PROCEDURAL_RULING\n"
            "- **discussion type / procedure mode**: proposal | collaboration\n"
            "- **basis**: R-0006\ufeffX\n"
            "- **result**: VALID\n"
        ).encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            ruling = case / "ruling.md"
            ruling.write_bytes(ruling.read_bytes() + b"\n" + future)
            self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)

    def test_p7_r6_rejects_embedded_nul_in_future_ruling_field(self):
        future = (
            b"## R-0007 | 2026-08-16T21:31:00-07:00\n"
            b"- **ruling identity**: Chief Judge\n"
            b"- **record type**: PROCEDURAL_RULING\n"
            b"- **discussion type / procedure mode**: proposal | collaboration\n"
            b"- **basis**: R-0006\x00X\n"
            b"- **result**: VALID\n"
        )
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            ruling = case / "ruling.md"
            ruling.write_bytes(ruling.read_bytes() + b"\n" + future)
            self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)

    def test_p7_r6_delimiter_tokenizer_excludes_zero_one_and_many_lfs_from_event_hashes(self):
        source = Path(__file__).parents[2] / "court" / "cases" / "P-0000-0007-2026-0815" / "record.md"
        raw = source.read_bytes()[quarantine_lint.P7_PRESERVED_THROUGH_S0052_BYTES :]
        parsed = quarantine_lint._p7_strict_record_suffix(raw)
        self.assertIsNotNone(parsed)
        items, _ = parsed
        s0053 = items[0][4]
        s0054 = items[1][4]
        for delimiter_count in (0, 1, 4):
            with self.subTest(delimiter_count=delimiter_count):
                candidate = s0053 + b"\n" * delimiter_count + s0054
                result = quarantine_lint._p7_strict_record_suffix(candidate)
                self.assertIsNotNone(result)
                observed, _ = result
                self.assertEqual(_digest_bytes(observed[0][4]), quarantine_lint.P7_EVENT_BINDINGS["S-0053"][1])
                self.assertEqual(_digest_bytes(observed[1][4]), quarantine_lint.P7_S0054_RAW_DIGEST)
                self.assertEqual(len(observed[0][5]), delimiter_count)

    def test_p7_r6_accepts_mixed_pure_lf_delimiters_and_open_event_types(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            events = (
                self._p7_future_event("S-0055", "2026-08-16T21:31:00-07:00", event_type="HANDOFF_REQUEST"),
                self._p7_future_event("S-0056", "2026-08-16T21:32:00-07:00", event_type="HANDOFF_RETURN"),
                self._p7_future_event("S-0057", "2026-08-16T21:33:00-07:00", event_type="NOTICE"),
                self._p7_future_event("S-0058", "2026-08-16T21:34:00-07:00", event_type="SUMMARY"),
                self._p7_future_event("S-0059", "2026-08-16T21:35:00-07:00", event_type="CLOSURE_COMMIT"),
                self._p7_future_event("S-0060", "2026-08-16T21:36:00-07:00", event_type="EVIL_UNKNOWN"),
            )
            future = b"".join(
                delimiter + event
                for delimiter, event in zip(
                    (b"", b"\n", b"\n\n\n", b"", b"\n\n", b"\n"),
                    events,
                )
            )
            record = case / "record.md"
            record.write_bytes(record.read_bytes() + future)
            composed, _, issues = self._p7_r6_resolve(case, timestamp, digest)
            self.assertEqual(issues, [])
            self.assertIsNotNone(composed)
            self.assertTrue(composed.endswith(future))

    def test_p7_r6_preserves_future_suffix_bytes_and_calls_frozen_lint_once(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            future = b"\n\n" + self._p7_future_event(
                "S-0055",
                "2026-08-16T21:31:00-07:00",
                extension="- **unknown payload field**: opaque Café bytes\n",
            )
            record = case / "record.md"
            original_suffix = record.read_bytes()[quarantine_lint.P7_PRESERVED_THROUGH_S0052_BYTES :]
            record.write_bytes(record.read_bytes() + future)
            observed: list[bytes] = []

            def frozen_once(path: Path, *, phase: str):
                observed.append((Path(path) / "record.md").read_bytes())
                return []

            with mock.patch.multiple(
                quarantine_lint,
                P7_R6_TIMESTAMP=timestamp,
                P7_R6_AUTHORIZATION_DIGEST=digest,
            ), mock.patch("quarantine_lint._lint_case", side_effect=frozen_once) as frozen_lint:
                self.assertEqual(lint_case(case, phase="ruling"), [])
            self.assertEqual(frozen_lint.call_count, 1)
            self.assertEqual(len(observed), 1)
            expected = (case / "record.canonical.through-S-0052.md").read_bytes() + original_suffix + future
            self.assertEqual(observed[0], expected)

    def test_p7_r6_accepts_one_canonical_json_attachment(self):
        attachment = (
            "- **payload exact canonical JSON**:\n"
            "```json\n"
            '{"nested":{"label":"Café"},"values":[1,true,null]}\n'
            "```\n"
        ).encode("utf-8")
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            future = self._p7_future_event(
                "S-0055",
                "2026-08-16T21:31:00-07:00",
                json_attachment=attachment,
            )
            record = case / "record.md"
            record.write_bytes(record.read_bytes() + b"\n" + future)
            composed, _, issues = self._p7_r6_resolve(case, timestamp, digest)
            self.assertEqual(issues, [])
            self.assertIsNotNone(composed)
            self.assertTrue(composed.endswith(b"\n" + future))

    def test_p7_r6_rejects_non_lf_or_unconsumed_event_delimiters(self):
        future = self._p7_future_event("S-0055", "2026-08-16T21:31:00-07:00")
        for label, delimiter, suffix in (
            ("space pseudo-empty", b" \n", b""),
            ("tab pseudo-empty", b"\t\n", b""),
            ("junk", b"JUNK\n", b""),
            ("trailing blank", b"\n", b"\n"),
        ):
            with self.subTest(label=label):
                self._assert_p7_r6_future_record_invalid(future + suffix, delimiter=delimiter)

    def test_p7_r6_rejects_duplicate_decreasing_malformed_or_hidden_future_ids(self):
        variants = (
            self._p7_future_event("S-0054", "2026-08-16T21:31:00-07:00"),
            self._p7_future_event("S-0053", "2026-08-16T21:31:00-07:00"),
            self._p7_future_event("S-055", "2026-08-16T21:31:00-07:00"),
            b"hidden\n" + self._p7_future_event("S-0055", "2026-08-16T21:31:00-07:00"),
        )
        for future in variants:
            with self.subTest(prefix=future[:40]):
                self._assert_p7_r6_future_record_invalid(future)

    def test_p7_r6_rejects_naive_invalid_equal_or_decreasing_future_times(self):
        for value in (
            "2026-08-16T21:31:00",
            "not-a-timestamp",
            quarantine_lint.P7_S0054_TIMESTAMP,
            "2026-08-16T21:17:59-07:00",
        ):
            with self.subTest(timestamp=value):
                self._assert_p7_r6_future_record_invalid(
                    self._p7_future_event("S-0055", value)
                )

    def test_p7_r6_rejects_future_common_envelope_drift(self):
        base = self._p7_future_event("S-0055", "2026-08-16T21:31:00-07:00")
        variants = (
            base.replace(b"- **speaker**: speaker-of-the-house\n", b"", 1),
            base.replace(
                b"- **speaker**: speaker-of-the-house\n- **type**: NOTICE\n",
                b"- **type**: NOTICE\n- **speaker**: speaker-of-the-house\n",
                1,
            ),
            base.replace(
                b"- **extension field**: opaque NFC value\n",
                b"- **case**: P-0000-0007-2026-0815\n",
                1,
            ),
            base.replace(b"P-0000-0007-2026-0815", b"P-9999-9999-9999-9999", 1),
            base.replace(b"- **discussion type**: proposal\n", b"- **discussion type**: acceptance\n", 1),
            base.replace(b"- **procedure mode**: collaboration\n", b"- **procedure mode**: invalid\n", 1),
            base.replace(b"- **target**: RS-003\n", b"- **target**: TODO\n", 1),
            base.replace(b"- **type**: NOTICE\n", b"- **type**: TBD\n", 1),
        )
        for future in variants:
            with self.subTest(prefix=future[:100]):
                self._assert_p7_r6_future_record_invalid(future)

    def test_p7_r6_accepts_all_three_procedure_modes(self):
        base = self._p7_future_event("S-0055", "2026-08-16T21:31:00-07:00")
        for mode in (b"collaboration", b"debate", b"full"):
            with self.subTest(mode=mode):
                future = base.replace(b"collaboration", mode, 1)
                with tempfile.TemporaryDirectory() as directory:
                    case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                    record = case / "record.md"
                    record.write_bytes(record.read_bytes() + b"\n" + future)
                    composed, _, issues = self._p7_r6_resolve(case, timestamp, digest)
                    self.assertEqual(issues, [])
                    self.assertTrue(composed and composed.endswith(b"\n" + future))

    def test_p7_r6_rejects_loose_hidden_or_noncanonical_future_field_bytes(self):
        base = self._p7_future_event("S-0055", "2026-08-16T21:31:00-07:00")
        variants = (
            base.replace(b"- **extension field**: opaque NFC value\n", b"* **extension field**: opaque NFC value\n", 1),
            base.replace(b"- **extension field**: opaque NFC value\n", b"-  **extension field**: opaque NFC value\n", 1),
            base.replace(b"- **extension field**: opaque NFC value\n", b"- ** extension field**: opaque NFC value\n", 1),
            base.replace(b"- **extension field**: opaque NFC value\n", b"- **Extension   Field**: duplicate\n", 1)
            + b"- **extension field**: duplicate\n",
            base + b"prose\n",
            base + b"<!-- comment -->\n",
            base + b"```text\n",
            base + b"\n",
            base.replace(b"\n", b"\r\n"),
            b"\xef\xbb\xbf" + base,
            base + b"\x00",
            base[:-1] + b"\xff\n",
            base.replace(b"opaque NFC value", "opaque Cafe\u0301 value".encode("utf-8"), 1),
        )
        for future in variants:
            with self.subTest(prefix=future[:100]):
                self._assert_p7_r6_future_record_invalid(future)

    def test_p7_r6_rejects_noncanonical_json_attachment_variants(self):
        lines = (
            b'{"a":1,"a":2}\n',
            b'[1]\n',
            b'1\n',
            b'{"a": 1}\n',
            b'{"a":1} \n',
            b'{"a":NaN}\n',
            b'{"a":Infinity}\n',
            '{"label":"Cafe\u0301"}\n'.encode("utf-8"),
            '{"label":"X\ufeffY"}\n'.encode("utf-8"),
            b'{"label":"X\\ufeffY"}\n',
            b'{"label":"X\\u0000Y"}\n',
            b'{"value":"\\ud800"}\n',
            b'{\n"a":1\n}\n',
        )
        for line in lines:
            with self.subTest(json=line):
                attachment = b"- **payload exact canonical JSON**:\n```json\n" + line + b"```\n"
                self._assert_p7_r6_future_record_invalid(
                    self._p7_future_event(
                        "S-0055",
                        "2026-08-16T21:31:00-07:00",
                        json_attachment=attachment,
                    )
                )
        for tail in (b"```\n", b"unknown bytes\n"):
            attachment = b'- **payload exact canonical JSON**:\n```json\n{"a":1}\n```\n' + tail
            self._assert_p7_r6_future_record_invalid(
                self._p7_future_event(
                    "S-0055",
                    "2026-08-16T21:31:00-07:00",
                    json_attachment=attachment,
                )
            )

    def test_p7_r6_rejects_fixed_s0053_s0054_and_prefix_anchor_drift(self):
        mutations = (
            lambda raw: raw.replace(b"CANDIDATE_ONLY_PENDING_R-0004_POINTER_RULING", b"CANDIDATE_ONLY_PENDING_R-0004_POINTER_RULINH", 1),
            lambda raw: raw[: quarantine_lint.P7_POST_S0053_RECORD_BYTES],
            lambda raw: raw.replace(b"HANDOFF_REQUEST", b"HANDOFF_REQUESU", 1),
            lambda raw: raw[: quarantine_lint.P7_PRESERVED_THROUGH_S0052_BYTES] + self._p7_future_event("S-0052", "2026-08-16T18:00:00-07:00") + raw[quarantine_lint.P7_PRESERVED_THROUGH_S0052_BYTES :],
            lambda raw: b"X" + raw[1:],
        )
        for mutate in mutations:
            with tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                record = case / "record.md"
                record.write_bytes(mutate(record.read_bytes()))
                self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)

    def test_p7_r6_invalid_pointer_placement_or_path_never_falls_back(self):
        def moved(value: str) -> str:
            line = "record_errata_manifest: record-errata.S-0052.json\n"
            return value.replace(line, "", 1).replace("status: drafting\n", "status: drafting\n" + line, 1)

        def duplicate(value: str) -> str:
            line = "record_errata_manifest: record-errata.S-0052.json\n"
            return value.replace(line, line + line, 1)

        def outside(value: str) -> str:
            line = "record_errata_manifest: record-errata.S-0052.json\n"
            return value.replace(line, "", 1) + "\n" + line

        mutations = (
            moved,
            duplicate,
            outside,
            lambda value: value.replace("record-errata.S-0052.json", "record-errata.S-9999.json", 1),
        )
        for mutate in mutations:
            with tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                index = case / "case.md"
                index.write_text(mutate(index.read_text(encoding="utf-8")), encoding="utf-8")
                self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)

    def test_p7_r6_rejects_invalid_case_projection_before_frozen_lint(self):
        mutations = (
            lambda value: value.replace("updated_at: 2026-08-16T21:30:01-07:00", "updated_at: 2026-08-16T21:30:00-07:00", 1),
            lambda value: value.replace("updated_at: 2026-08-16T21:30:01-07:00", "updated_at: 2026-08-16T21:31:00", 1),
            lambda value: value.replace("case_id: P-0000-0007-2026-0815", "case_id: P-9999-9999-9999-9999", 1),
            lambda value: value.replace("boundary_protocol: v1", "boundary_protocol: v2", 1),
            lambda value: value.replace("case_id: P-0000-0007-2026-0815\n", "case_id: P-0000-0007-2026-0815\ncase_id: P-0000-0007-2026-0815\n", 1),
        )
        for mutate in mutations:
            with tempfile.TemporaryDirectory() as directory:
                case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
                index = case / "case.md"
                index.write_text(mutate(index.read_text(encoding="utf-8")), encoding="utf-8")
                self._assert_p7_r6_invalid_before_frozen_lint(case, timestamp, digest)

    def test_p7_r6_ongoing_case_projection_allows_later_lifecycle_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            index = case / "case.md"
            value = index.read_text(encoding="utf-8")
            value = value.replace("status: drafting\n", "status: awaiting-ruling\nlater_authority_ref: R-0007\n", 1)
            value = value.replace("updated_at: 2026-08-16T21:30:01-07:00", "updated_at: 2026-08-16T21:35:00-07:00", 1)
            index.write_text(value, encoding="utf-8")
            composed, _, issues = self._p7_r6_resolve(case, timestamp, digest)
            self.assertEqual(issues, [])
            self.assertIsNotNone(composed)

    def test_p7_r6_pointer_absent_calls_frozen_lint_once_on_exact_raw_case(self):
        with tempfile.TemporaryDirectory() as directory:
            case = self._p7_r6_frozen_case_fixture(Path(directory))
            observed: list[bytes] = []
            original_frozen_lint = quarantine_lint._lint_case

            def frozen_once(path: Path, *, phase: str):
                observed.append((Path(path) / "record.md").read_bytes())
                return original_frozen_lint(path, phase=phase)

            with mock.patch("quarantine_lint._lint_case", side_effect=frozen_once) as frozen_lint:
                issues = lint_case(case, phase="ruling")
            self.assertEqual(frozen_lint.call_count, 1)
            self.assertEqual(observed, [(case / "record.md").read_bytes()])
            self.assertEqual(
                [issue.message for issue in issues],
                [
                    "S-0040 common envelope is missing concrete field 'decision effect'",
                    "HS-005 RETURNED contribution contains duplicate SEQ refs: ['SEQ-007']",
                    "HS-005 RETURNED contribution contains duplicate AC refs: ['AC-014']",
                    "boundary_revision_set must be an exact immutable sha256:<producer>+sha256:<consumer> pair",
                    "acceptance validation requires an APPROVED ACTION PLAN_RULING",
                ],
            )

    def test_p7_r6_pointer_removal_alone_deactivates_overlay_and_restores_raw_visibility(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._p7_r6_successor_pointer_fixture(Path(directory))
            index = case / "case.md"
            index.write_text(
                index.read_text(encoding="utf-8").replace(
                    "record_errata_manifest: record-errata.S-0052.json\n", "", 1
                ),
                encoding="utf-8",
            )
            with mock.patch("quarantine_lint._lint_case", wraps=quarantine_lint._lint_case) as frozen_lint:
                issues = lint_case(case, phase="ruling")
            self.assertEqual(frozen_lint.call_count, 1)
            self.assertTrue(any("S-0040 common envelope" in issue.message for issue in issues), issues)

    def test_p7_r6_initial_case_candidate_and_inverse_baseline_are_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, _ = self._p7_r6_successor_pointer_fixture(Path(directory))
            self._assert_p7_r6_install_case_candidate(
                case,
                r6_timestamp=timestamp,
                observed_wall_clock="2026-08-16T21:30:01-07:00",
            )

    def test_p7_r6_case_only_rollback_shape_preserves_all_other_files(self):
        rollback_gate = quarantine_lint.P7_R6_EXACT_BINDINGS["rollback case gate-state"]
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._p7_r6_successor_pointer_fixture(Path(directory))
            protected = {
                path.name: _digest_bytes(path.read_bytes())
                for path in case.iterdir()
                if path.is_file() and path.name != "case.md"
            }
            index = case / "case.md"
            value = index.read_text(encoding="utf-8")
            value = value.replace("record_errata_manifest: record-errata.S-0052.json\n", "", 1)
            value = value.replace("updated_at: 2026-08-16T21:30:01-07:00", "updated_at: 2026-08-16T21:31:00-07:00", 1)
            value = value.replace(quarantine_lint.P7_INITIAL_ACTIVE_GATE_STATE, rollback_gate, 1)
            index.write_text(value, encoding="utf-8")
            self.assertEqual(len(index.read_bytes()), 16017)
            self.assertNotIn("record_errata_manifest:", value)
            self.assertEqual(
                protected,
                {
                    path.name: _digest_bytes(path.read_bytes())
                    for path in case.iterdir()
                    if path.is_file() and path.name != "case.md"
                },
            )

    def test_p7_r6_template_and_finalized_forms_share_one_reversible_substitution_seam(self):
        source = Path(quarantine_lint.__file__).read_bytes()
        selftest = Path(__file__).read_bytes()
        timestamp_placeholder = "-".join(("0" * 4, "0" * 2, "0" * 2)) + "T00:00:00+00:00"
        digest_placeholder = "sha256:" + "R" * 64
        timestamp_bytes = timestamp_placeholder.encode("utf-8")
        digest_bytes = digest_placeholder.encode("utf-8")
        token_counts = (source.count(timestamp_bytes), source.count(digest_bytes))
        self.assertIn(token_counts, {(1, 1), (0, 0)})
        self.assertEqual(selftest.count(timestamp_bytes), 0)
        self.assertEqual(selftest.count(digest_bytes), 0)

        if token_counts == (1, 1):
            self.assertEqual(quarantine_lint.P7_R6_TIMESTAMP, timestamp_placeholder)
            self.assertEqual(quarantine_lint.P7_R6_AUTHORIZATION_DIGEST, digest_placeholder)
            normalized = source
        else:
            timestamp = quarantine_lint.P7_R6_TIMESTAMP
            digest = quarantine_lint.P7_R6_AUTHORIZATION_DIGEST
            observed = quarantine_lint._parse_timestamp(timestamp)
            r5 = quarantine_lint._parse_timestamp(quarantine_lint.P7_R5_TIMESTAMP)
            self.assertIsNotNone(observed)
            self.assertIsNotNone(r5)
            self.assertGreater(observed, r5)
            self.assertRegex(digest, r"^sha256:[0-9a-f]{64}$")
            observed_timestamp = timestamp.encode("utf-8")
            observed_digest = digest.encode("utf-8")
            self.assertEqual(len(observed_timestamp), len(timestamp_bytes))
            self.assertEqual(len(observed_digest), len(digest_bytes))
            self.assertEqual(source.count(observed_timestamp), 1)
            self.assertEqual(source.count(observed_digest), 1)
            normalized = source.replace(observed_timestamp, timestamp_bytes, 1).replace(
                observed_digest, digest_bytes, 1
            )

        self.assertEqual(len(normalized), P7_R6_QUARANTINE_TEMPLATE_BYTES)
        self.assertEqual(_digest_bytes(normalized), P7_R6_QUARANTINE_TEMPLATE_DIGEST)
        self.assertNotEqual(_digest_bytes(normalized[:-1] + bytes([normalized[-1] ^ 1])), P7_R6_QUARANTINE_TEMPLATE_DIGEST)

    def test_p7_r6_unfinalized_placeholders_fail_closed_without_raw_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            case, timestamp, digest = self._p7_r6_successor_pointer_fixture(Path(directory))
            with mock.patch("quarantine_lint._lint_case") as frozen_lint:
                issues = lint_case(case, phase="ruling")
            if (
                quarantine_lint.P7_R6_TIMESTAMP == timestamp
                and quarantine_lint.P7_R6_AUTHORIZATION_DIGEST == digest
            ):
                self.assertEqual(frozen_lint.call_count, 1)
            else:
                self.assertEqual(frozen_lint.call_count, 0)
                self.assertTrue(
                    any(
                        "R6-only activation bindings" in issue.message
                        or "R-0006 authorization envelope" in issue.message
                        for issue in issues
                    ),
                    issues,
                )

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

    def test_record_errata_pointer_absent_keeps_raw_record_visible(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(Path(directory), activate=False)
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("duplicate SEQ refs" in issue.message for issue in issues), issues)

    def test_record_errata_happy_path_delegates_composed_record_to_frozen_linter(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(Path(directory))
            self.assertEqual(lint_case(case, phase="ruling"), [])

    def test_proposal_quarantine_and_record_errata_compose_before_one_frozen_lint(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(
                Path(directory), proposal_quarantine=True
            )
            with mock.patch(
                "quarantine_lint._lint_case", wraps=quarantine_lint._lint_case
            ) as frozen_lint:
                self.assertEqual(lint_case(case, phase="ruling"), [])
            self.assertEqual(frozen_lint.call_count, 1)

    def test_record_errata_fails_closed_on_live_prefix_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, manifest = self._record_errata_fixture(Path(directory))
            record = case / "record.md"
            raw = bytearray(record.read_bytes())
            raw[10] ^= 1
            record.write_bytes(raw)
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("live record prefix" in issue.message for issue in issues), issues)
            self.assertEqual(manifest["preserved_prefix_bytes"], len((case / manifest["preserved_prefix_path"]).read_bytes()))

    def test_record_errata_fails_closed_on_preserved_or_canonical_drift(self):
        for key, expected in (
            ("preserved_prefix_path", "preserved prefix SHA-256"),
            ("canonical_prefix_path", "canonical prefix SHA-256"),
        ):
            with self.subTest(key=key), tempfile.TemporaryDirectory() as directory:
                case, _, manifest = self._record_errata_fixture(Path(directory))
                path = case / manifest[key]
                path.write_bytes(path.read_bytes() + b"\n")
                issues = lint_case(case, phase="ruling")
                self.assertTrue(any(expected in issue.message for issue in issues), issues)

    def test_record_errata_fails_closed_on_manifest_schema_and_encoding_drift(self):
        mutations = {
            "unknown key": lambda manifest: manifest.__setitem__("extra", True),
            "wrong schema": lambda manifest: manifest.__setitem__("schema", "quorum.record_errata.v2"),
            "wrong allowlist": lambda manifest: manifest.__setitem__("event_allowlist", ["S-0004", "S-9999"]),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as directory:
                case, manifest_path, manifest = self._record_errata_fixture(Path(directory))
                mutate(manifest)
                manifest_path.write_bytes(_canonical_manifest(manifest))
                issues = lint_case(case, phase="ruling")
                self.assertTrue(any("record errata" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, manifest_path, _ = self._record_errata_fixture(Path(directory))
            manifest_path.write_bytes(b"\xef\xbb\xbf" + manifest_path.read_bytes() + b"\n")
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("invalid JSON" in issue.message or "canonical JSON" in issue.message for issue in issues), issues)

    def test_record_errata_fails_closed_on_nonlocal_nul_or_symlink_paths(self):
        for value in ("../record.md", "./record.md", "bad\\record.md", "C:/record.md", "\x00"):
            with self.subTest(value=repr(value)), tempfile.TemporaryDirectory() as directory:
                case, manifest_path, manifest = self._record_errata_fixture(Path(directory))
                manifest["preserved_prefix_path"] = value
                manifest_path.write_bytes(_canonical_manifest(manifest))
                issues = lint_case(case, phase="ruling")
                self.assertTrue(any("local non-symlink" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, _, manifest = self._record_errata_fixture(Path(directory))
            canonical = case / manifest["canonical_prefix_path"]
            canonical.unlink()
            canonical.symlink_to(manifest["preserved_prefix_path"])
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("local non-symlink" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, manifest_path, _ = self._record_errata_fixture(Path(directory))
            replacement = case / "manifest-target.json"
            manifest_path.rename(replacement)
            manifest_path.symlink_to(replacement.name)
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("local non-symlink" in issue.message for issue in issues), issues)

    def test_record_errata_fails_closed_when_live_preserved_and_canonical_share_inode(self):
        for destination_key, source_key in (
            ("canonical_prefix_path", "preserved_prefix_path"),
            ("canonical_prefix_path", "live_path"),
            ("preserved_prefix_path", "live_path"),
        ):
            with self.subTest(pair=(destination_key, source_key)), tempfile.TemporaryDirectory() as directory:
                case, _, manifest = self._record_errata_fixture(Path(directory))
                destination = case / manifest[destination_key]
                source = case / manifest[source_key]
                destination.unlink()
                destination.hardlink_to(source)
                issues = lint_case(case, phase="ruling")
                self.assertTrue(any("distinct regular files" in issue.message for issue in issues), issues)

    def test_record_errata_fails_closed_on_cutoff_truncation_and_off_by_one(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, manifest = self._record_errata_fixture(Path(directory))
            record = case / "record.md"
            record.write_bytes(record.read_bytes()[: manifest["preserved_prefix_bytes"] - 1])
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("live record prefix" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, manifest_path, manifest = self._record_errata_fixture(Path(directory))
            manifest["preserved_prefix_bytes"] += 1
            manifest_path.write_bytes(_canonical_manifest(manifest))
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("byte length mismatch" in issue.message for issue in issues), issues)

    def test_record_errata_reconstructs_canonical_instead_of_trusting_updated_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            case, manifest_path, manifest = self._record_errata_fixture(Path(directory))
            canonical = case / manifest["canonical_prefix_path"]
            content = canonical.read_bytes()
            self.assertIn("授予".encode("utf-8"), content)
            canonical.write_bytes(content.replace("授予".encode("utf-8"), "授与".encode("utf-8"), 1))
            manifest["canonical_prefix_sha256"] = _digest_path(canonical)
            manifest_path.write_bytes(_canonical_manifest(manifest))
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("patch exactness" in issue.message for issue in issues), issues)

    def test_record_errata_fails_closed_on_patch_or_event_identity_drift(self):
        mutations = (
            lambda manifest: manifest["event_patches"][0].__setitem__("event_id", "S-0003"),
            lambda manifest: manifest["event_patches"][0].__setitem__("raw_event_sha256", "sha256:" + "0" * 64),
            lambda manifest: manifest["event_patches"][0]["changes"][0].__setitem__("field", "basis"),
            lambda manifest: manifest["event_patches"][0]["changes"][0].__setitem__("canonical_value", "SEQ-001 owner responsibility "),
        )
        for index, mutate in enumerate(mutations):
            with self.subTest(index=index), tempfile.TemporaryDirectory() as directory:
                case, manifest_path, manifest = self._record_errata_fixture(Path(directory))
                mutate(manifest)
                manifest_path.write_bytes(_canonical_manifest(manifest))
                issues = lint_case(case, phase="ruling")
                self.assertTrue(
                    any("event identity" in issue.message or "patch exactness" in issue.message or "Chief authorization" in issue.message for issue in issues),
                    issues,
                )

    def test_record_errata_fails_closed_without_one_exact_activation_notice(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, manifest = self._record_errata_fixture(Path(directory))
            record = case / "record.md"
            record.write_bytes(record.read_bytes()[: manifest["preserved_prefix_bytes"]])
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("activation NOTICE" in issue.message for issue in issues), issues)

    def test_record_errata_activation_notice_bindings_and_uniqueness_are_closed(self):
        for old, new in (
            ("- **target**: R-0002", "- **target**: R-9999"),
            ("- **basis**: R-0002", "- **basis**: R-9999"),
            ("record-errata.S-0008.json | sha256:", "wrong.json | sha256:"),
            ("record.preserved.through-S-0008.md | bytes:", "wrong-preserved.md | bytes:"),
            ("record.canonical.through-S-0008.md | sha256:", "wrong-canonical.md | sha256:"),
        ):
            with self.subTest(old=old), tempfile.TemporaryDirectory() as directory:
                case, _, _ = self._record_errata_fixture(Path(directory))
                record = case / "record.md"
                text = record.read_text(encoding="utf-8")
                self.assertIn(old, text)
                record.write_text(text.replace(old, new, 1), encoding="utf-8")
                issues = lint_case(case, phase="ruling")
                self.assertTrue(any("activation NOTICE" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, _, manifest = self._record_errata_fixture(Path(directory))
            record = case / "record.md"
            suffix = record.read_bytes()[manifest["preserved_prefix_bytes"] :]
            duplicate = suffix.replace(b"## S-0009 |", b"## S-0010 |", 1).replace(
                b"2026-08-12T14:31:00Z", b"2026-08-12T14:32:00Z", 1
            )
            record.write_bytes(record.read_bytes() + b"\n" + duplicate)
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("exactly one" in issue.message and "activation NOTICE" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(Path(directory))
            record = case / "record.md"
            record.write_text(
                record.read_text(encoding="utf-8").replace(
                    "- **speaker**: speaker-of-the-house\n- **type**: NOTICE\n- **target**: R-0002\n",
                    "- **speaker**: code-owner-service-a\n- **type**: NOTICE\n- **target**: R-0002\n",
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("activation NOTICE" in issue.message for issue in issues), issues)

    def test_record_errata_suffix_is_not_filtered_or_reordered(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(Path(directory))
            record = case / "record.md"
            record.write_text(
                record.read_text(encoding="utf-8")
                + "\n## S-0010 | 2026-08-12T14:32:00Z\n"
                + "- **case**: P-0000-0001-2026-0812\n"
                + "- **discussion type**: proposal\n"
                + "- **procedure mode**: collaboration\n"
                + "- **speaker**: speaker-of-the-house\n"
                + "- **type**: NOTICE\n"
                + "- **target**: R-0002\n"
                + "- **basis**: R-0002\n",
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("S-0010 common envelope" in issue.message for issue in issues), issues)
            self.assertFalse(any("duplicate SEQ refs" in issue.message for issue in issues), issues)
            self.assertTrue(all(str(case) in str(issue.path) for issue in issues), issues)

    def test_record_errata_case_pointer_must_be_unique_and_exact(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(Path(directory))
            case_index = case / "case.md"
            case_index.write_text(
                case_index.read_text(encoding="utf-8").replace(
                    "record_errata_manifest: record-errata.S-0008.json\n",
                    "record_errata_manifest: record-errata.S-0008.json\n"
                    "record_errata_manifest: record-errata.S-0008.json\n",
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("duplicate record_errata_manifest" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(Path(directory))
            case_index = case / "case.md"
            case_index.write_text(
                case_index.read_text(encoding="utf-8").replace(
                    "record-errata.S-0008.json", "missing-record-errata.json", 1
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("manifest must be a local non-symlink regular file" in issue.message for issue in issues), issues)

    def test_record_errata_ruling_binding_is_fail_closed(self):
        for old, new in (
            ("- **ruling identity**: Chief Judge", "- **ruling identity**: clerk"),
            ("- **result**: REMEDY_REQUIRED", "- **result**: VALID"),
            ("- **cutoff event**: S-0008", "- **cutoff event**: S-0007"),
            ("raw record prefix immutable", "raw record prefix mutable"),
        ):
            with self.subTest(old=old), tempfile.TemporaryDirectory() as directory:
                case, _, _ = self._record_errata_fixture(Path(directory))
                ruling = case / "ruling.md"
                text = ruling.read_text(encoding="utf-8")
                plan, record_authorization = text.split("## R-0002", 1)
                self.assertIn(old, record_authorization)
                ruling.write_text(
                    plan + "## R-0002" + record_authorization.replace(old, new, 1),
                    encoding="utf-8",
                )
                issues = lint_case(case, phase="ruling")
                self.assertTrue(any("Chief authorization" in issue.message for issue in issues), issues)

    def test_record_errata_authorization_survives_successor_ruling_separator(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _, _ = self._record_errata_fixture(Path(directory))
            ruling = case / "ruling.md"
            ruling.write_text(
                ruling.read_text(encoding="utf-8")
                + "\n## R-0003 | 2026-08-12T15:00:00Z\n"
                + "- **ruling identity**: Chief Judge\n"
                + "- **record type**: PROCEDURAL_RULING\n"
                + "- **result**: VALID\n",
                encoding="utf-8",
            )
            self.assertEqual(lint_case(case, phase="ruling"), [])

    def test_p7_record_errata_exact_parsed_ruling_fields_are_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._p7_record_errata_fixture(Path(directory))
            composed, _, issues = quarantine_lint._resolve_record_overlay(case)
            self.assertIsNone(composed)
            self.assertTrue(any("permanently tombstoned" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._p7_record_errata_fixture(Path(directory))
            ruling = case / "ruling.md"
            text = ruling.read_text(encoding="utf-8")
            ruling.write_text(
                text.replace("vendor 与 global gate 测试全部通过", "vendor 与 global gate 测试部分通过", 1),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(
                any(
                    "record errata Chief authorization" in issue.message
                    or "permanently tombstoned" in issue.message
                    for issue in issues
                ),
                issues,
            )

    def test_p7_intermediate_without_pointer_keeps_three_raw_record_defects(self):
        with tempfile.TemporaryDirectory() as directory:
            case, manifest = self._p7_record_errata_fixture(Path(directory))
            case_index = case / "case.md"
            case_index.write_text(
                "\n".join(
                    line
                    for line in case_index.read_text(encoding="utf-8").splitlines()
                    if not line.startswith("record_errata_manifest:")
                )
                + "\n",
                encoding="utf-8",
            )
            (case / "record.md").write_bytes(
                (case / manifest["preserved_prefix_path"]).read_bytes()
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(any("S-0040 common envelope" in issue.message for issue in issues), issues)
            self.assertTrue(any("duplicate SEQ refs" in issue.message for issue in issues), issues)
            self.assertTrue(any("duplicate AC refs" in issue.message for issue in issues), issues)

    def test_p7_record_errata_rejects_extra_authorization_field(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._p7_record_errata_fixture(Path(directory))
            ruling = case / "ruling.md"
            text = ruling.read_text(encoding="utf-8")
            next_ruling = re.search(r"(?m)^## R-(?!0001)\d{4} \|", text)
            insertion = next_ruling.start() if next_ruling else len(text)
            ruling.write_text(
                text[:insertion]
                + "- **unexpected authorization**: forbidden\n"
                + text[insertion:],
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(
                any(
                    "record errata Chief authorization" in issue.message
                    or "permanently tombstoned" in issue.message
                    for issue in issues
                ),
                issues,
            )

    def test_p7_record_errata_rejects_authorization_timestamp_backdate(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._p7_record_errata_fixture(Path(directory))
            ruling = case / "ruling.md"
            text = ruling.read_text(encoding="utf-8")
            self.assertIn("## R-0001 | 2026-08-16T13:19:36-07:00", text)
            ruling.write_text(
                text.replace(
                    "## R-0001 | 2026-08-16T13:19:36-07:00",
                    "## R-0001 | 2026-08-16T13:19:35-07:00",
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="ruling")
            self.assertTrue(
                any(
                    "record errata Chief authorization" in issue.message
                    or "permanently tombstoned" in issue.message
                    for issue in issues
                ),
                issues,
            )

    def test_p7_predecessor_pointer_is_tombstoned_after_any_future_ruling(self):
        with tempfile.TemporaryDirectory() as directory:
            case, _ = self._p7_record_errata_fixture(Path(directory))
            ruling = case / "ruling.md"
            ruling.write_text(
                ruling.read_text(encoding="utf-8")
                + "\n## R-0002 | 2026-08-16T14:00:00-07:00\n"
                + "- **ruling identity**: Chief Judge\n"
                + "- **record type**: PROCEDURAL_RULING\n"
                + "- **result**: VALID\n",
                encoding="utf-8",
            )
            composed, _, issues = quarantine_lint._resolve_record_overlay(case)
            self.assertIsNone(composed)
            self.assertTrue(any("cannot reactivate" in issue.message for issue in issues), issues)

    def test_p7_old_s0050_pointer_is_tombstoned_after_exact_s0052_invalidation(self):
        with tempfile.TemporaryDirectory() as directory:
            case = self._p7_live_old_pointer_fixture(Path(directory))
            composed, _, issues = quarantine_lint._resolve_record_overlay(case)
            self.assertIsNone(composed)
            self.assertTrue(
                any("permanently tombstoned" in issue.message for issue in issues),
                issues,
            )

    def test_p7_old_s0050_pointer_cannot_hide_s0052_payload_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            case = self._p7_live_old_pointer_fixture(Path(directory))
            record = case / "record.md"
            raw = record.read_bytes()
            old = b"- **production effect**: NONE\n"
            s0052 = _event_bytes(raw, "S-0052")
            self.assertEqual(s0052.count(old), 1)
            drifted = s0052.replace(old, b"- **production effect**: DRIFT\n", 1)
            record.write_bytes(raw.replace(s0052, drifted, 1))
            composed, _, issues = quarantine_lint._resolve_record_overlay(case)
            self.assertIsNone(composed)
            self.assertTrue(
                any("permanently tombstoned" in issue.message for issue in issues),
                issues,
            )

    def test_p7_old_s0050_pointer_cannot_ignore_renamed_s0053_candidate(self):
        with tempfile.TemporaryDirectory() as directory:
            case = self._p7_live_old_pointer_fixture(Path(directory))
            record = case / "record.md"
            raw = record.read_bytes()
            self.assertEqual(raw.count(b"## S-0053 |"), 1)
            record.write_bytes(raw.replace(b"## S-0053 |", b"## S-0054 |", 1))
            composed, _, issues = quarantine_lint._resolve_record_overlay(case)
            self.assertIsNone(composed)
            self.assertTrue(
                any("permanently tombstoned" in issue.message for issue in issues),
                issues,
            )

    def test_p7_old_s0050_pointer_cannot_reactivate_when_r2_is_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            case = self._p7_live_old_pointer_fixture(Path(directory))
            ruling = case / "ruling.md"
            raw = ruling.read_text(encoding="utf-8")
            start = raw.index("## R-0002 |")
            end = raw.index("\n## R-0003 |", start)
            ruling.write_text(raw[:start] + raw[end + 1:], encoding="utf-8")
            composed, _, issues = quarantine_lint._resolve_record_overlay(case)
            self.assertIsNone(composed)
            self.assertTrue(
                any("permanently tombstoned" in issue.message for issue in issues),
                issues,
            )

    def test_p7_old_s0050_pointer_cannot_reactivate_after_coordinated_lineage_renames(self):
        with tempfile.TemporaryDirectory() as directory:
            case = self._p7_live_old_pointer_fixture(Path(directory))
            ruling = case / "ruling.md"
            ruling.write_text(
                ruling.read_text(encoding="utf-8").replace("## R-0002 |", "## R-0092 |", 1),
                encoding="utf-8",
            )
            record = case / "record.md"
            raw = record.read_bytes()
            mutations = (
                (b"## S-0052 |", b"## S-0092 |"),
                (b"## S-0053 |", b"## S-0093 |"),
                (b"RECORD_ERRATA_ACTIVATION_INVALIDATED", b"RECORD_ERRATA_ACTIVATION_SUPERSEDED"),
                (b"RECORD_ERRATA_ACTIVATION_CANDIDATE", b"RECORD_ERRATA_ACTIVATION_PROSPECTIVE"),
            )
            for old, new in mutations:
                self.assertIn(old, raw)
                raw = raw.replace(old, new, 1)
            record.write_bytes(raw)
            composed, _, issues = quarantine_lint._resolve_record_overlay(case)
            self.assertIsNone(composed)
            self.assertTrue(any("permanently tombstoned" in issue.message for issue in issues), issues)


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
