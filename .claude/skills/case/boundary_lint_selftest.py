from pathlib import Path
import shutil
import tempfile
import unittest

from tools.quorum_lint import lint_case
from tools.quorum_lint.lint import (
    _boundary_object_hash,
    _events,
    _review_snapshot_hash,
    _sections,
)


ROOT = Path(__file__).resolve().parent
FIXTURES = ROOT / "fixtures"
VALID = FIXTURES / "valid-case"


class QuorumLintTests(unittest.TestCase):
    def test_valid_case_is_ruling_and_acceptance_ready(self):
        self.assertEqual(lint_case(VALID, phase="ruling"), [])
        self.assertEqual(lint_case(VALID, phase="acceptance"), [])

    def test_protocol_must_come_from_frontmatter(self):
        directory, case = self._mutated_case(
            [],
            case_replacements=[
                ("boundary_protocol: v1", "boundary_protocol_removed: v1", 1),
                ("# Boundary protocol fixture", "# Boundary protocol fixture\n\nboundary_protocol: v1", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("case.md frontmatter must declare canonical boundary_protocol" in issue.message for issue in issues), issues)

    def test_duplicate_boundary_object_ids_are_rejected(self):
        for identifier in ("BC-001", "SEQ-001"):
            with self.subTest(identifier=identifier):
                directory, case = self._mutated_case(
                    [("### PS-001", f"### {identifier} | duplicate\n\n### PS-001", 1)]
                )
                try:
                    issues = lint_case(case)
                finally:
                    directory.cleanup()
                self.assertTrue(any(f"duplicate boundary object identifier: {identifier}" in issue.message for issue in issues), issues)

    def test_duplicate_ps_and_ac_ids_are_rejected(self):
        directory, case = self._mutated_case(
            [
                ("  - AC-001 |", "  - AC-001 | duplicate criterion\n  - AC-001 |", 1),
                ("### PS-001", "### PS-001 | duplicate\n\n### PS-001", 1),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("duplicate acceptance criterion identifier: AC-001" in issue.message for issue in issues), issues)
        self.assertTrue(any("duplicate proposal snapshot identifier: PS-001" in issue.message for issue in issues), issues)

    def test_duplicate_frontmatter_and_structured_fields_are_rejected(self):
        directory, case = self._mutated_case(
            [
                (
                    "boundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222",
                    "boundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222\nboundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222",
                    1,
                ),
                ("- **producer**: service-a", "- **producer**: service-a\n- **producer**: service-a", 1),
                ("- **supersedes**: null", "- **supersedes**: null\n- **supersedes**: null", 1),
            ],
            case_replacements=[
                ("boundary_protocol: v1", "boundary_protocol: v1\nboundary_protocol: v1", 1),
                ("- **当前 contract_set**: BC-001", "- **当前 contract_set**: BC-001\n- **当前 contract_set**: BC-001", 1),
            ],
            record_replacements=[
                ("- **N**: 2", "- **N**: 2\n- **N**: 2", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        messages = [issue.message for issue in issues]
        self.assertTrue(any("case.md frontmatter contains duplicate key: boundary_protocol" in message for message in messages), issues)
        self.assertTrue(any("case.md contains duplicate canonical field: 当前 contract_set" in message for message in messages), issues)
        self.assertTrue(any("proposal frontmatter contains duplicate key: boundary_revision_set" in message for message in messages), issues)
        self.assertTrue(any("BC-001 contains duplicate field: producer" in message for message in messages), issues)
        self.assertTrue(any("PS-001 contains duplicate field: supersedes" in message for message in messages), issues)
        self.assertTrue(any("S-0005 contains duplicate field: n" in message for message in messages), issues)

    def test_duplicate_global_proposal_fields_are_rejected(self):
        directory, case = self._mutated_case(
            [
                ("- **主 owner**: code-owner-service-a", "- **主 owner**: code-owner-service-a\n- **主 owner**: attacker-owner", 1),
                ("- **contract_set**: BC-001", "- **contract_set**: BC-001\n- **contract_set**: BC-999", 1),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("global proposal contains duplicate field: 主 owner" in issue.message for issue in issues), issues)
        self.assertTrue(any("global proposal contains duplicate field: contract_set" in issue.message for issue in issues), issues)

    def test_canonical_case_refs_reject_duplicate_and_unknown_tokens(self):
        directory, case = self._mutated_case(
            [],
            case_replacements=[
                ("boundary_contract_refs: [BC-001]", "boundary_contract_refs: [BC-001, BC-001, EVIL]", 1),
                ("- **当前 contract_set**: BC-001", "- **当前 contract_set**: BC-001, EVIL", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("boundary_contract_refs contains invalid tokens" in issue.message for issue in issues), issues)
        self.assertTrue(any("boundary_contract_refs contains duplicate refs" in issue.message for issue in issues), issues)
        self.assertTrue(any("current contract_set contains invalid tokens" in issue.message for issue in issues), issues)

    def test_proposal_case_id_must_match_canonical_case(self):
        directory, case = self._mutated_case(
            [("case_id: P-0000-0001-2026-0812", "case_id: P-9999-9999-2099-0101", 1)]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("proposal frontmatter case_id must exactly match" in issue.message for issue in issues), issues)

    def test_boundary_object_hash_is_recomputed_from_canonical_content(self):
        directory, case = self._mutated_case(
            [("**consumer projection**: task_id, attempt_id, interaction_id, payload", "**consumer projection**: payload only")]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("boundary object hash does not match canonical" in issue.message for issue in issues), issues)

    def test_case_index_must_match_current_contract_and_objects(self):
        directory, case = self._mutated_case(
            [],
            case_replacements=[
                ("boundary_contract_refs: [BC-001]", "boundary_contract_refs: [BC-999]"),
                ("state_sequence_refs: [SEQ-001]", "state_sequence_refs: [SEQ-999]"),
                ("**当前 contract_set**: BC-001", "**当前 contract_set**: BC-998"),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("boundary_contract_refs differ" in issue.message for issue in issues), issues)
        self.assertTrue(any("state_sequence_refs differ" in issue.message for issue in issues), issues)
        self.assertTrue(any("current contract_set differs" in issue.message for issue in issues), issues)

    def test_case_current_artifact_must_match_latest_snapshot(self):
        directory, case = self._mutated_case(
            [],
            case_replacements=[("#PS-001", "#PS-999", 1)],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("current_artifact_ref points to PS-999" in issue.message for issue in issues), issues)

    def test_boundary_na_requires_reason(self):
        issues = lint_case(FIXTURES / "invalid" / "missing-na")
        self.assertTrue(any("boundary NOT_APPLICABLE requires" in issue.message for issue in issues), issues)

    def test_pending_criterion_blocks_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            shutil.copyfile(FIXTURES / "invalid" / "pending-acceptance.md", case / "acceptance.md")
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("AC-006 is PENDING" in issue.message for issue in issues), issues)
        self.assertTrue(any("initial result cannot be PASSED" in issue.message for issue in issues), issues)

    def test_parallel_handoffs_block_ruling(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            shutil.copyfile(FIXTURES / "invalid" / "parallel-record.md", case / "record.md")
            issues = lint_case(case)
        self.assertTrue(any("owner handoffs must be serial" in issue.message for issue in issues), issues)

    def test_non_lead_confirmation_must_be_returned(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            proposal = case / "proposal.md"
            proposal.write_text(
                proposal.read_text(encoding="utf-8").replace(
                    "**consumer owner confirmation**: HS-001",
                    "**consumer owner confirmation**: HS-099",
                ),
                encoding="utf-8",
            )
            issues = lint_case(case)
        self.assertTrue(any("HS-099 is not RETURNED" in issue.message for issue in issues), issues)

    def test_moving_revision_binding_blocks_ruling(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            proposal = case / "proposal.md"
            proposal.write_text(
                proposal.read_text(encoding="utf-8").replace(
                    "producer sha256:1111111111111111111111111111111111111111111111111111111111111111 + consumer sha256:2222222222222222222222222222222222222222222222222222222222222222",
                    "producer main + consumer latest",
                ),
                encoding="utf-8",
            )
            issues = lint_case(case)
        self.assertTrue(any("moving or unfrozen revision" in issue.message for issue in issues), issues)

    def test_bc_requires_exact_declared_revision_pair(self):
        directory, case = self._mutated_case(
            [
                (
                    "boundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222\n",
                    "",
                ),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("proposals with BC objects require boundary_revision_set" in issue.message for issue in issues), issues)

    def test_revision_pair_format_rejects_moving_refs(self):
        directory, case = self._mutated_case(
            [
                (
                    "boundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222",
                    "boundary_revision_set: main+latest",
                ),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("exact immutable" in issue.message for issue in issues), issues)

    def _mutated_case(
        self,
        replacements,
        *,
        record=None,
        case_replacements=None,
        record_replacements=None,
    ):
        directory = tempfile.TemporaryDirectory()
        case = Path(directory.name) / "case"
        shutil.copytree(VALID, case)
        proposal = case / "proposal.md"
        text = proposal.read_text(encoding="utf-8")
        for replacement in replacements:
            old, new, *count = replacement
            self.assertIn(old, text)
            text = text.replace(old, new, count[0] if count else -1)
        proposal.write_text(text, encoding="utf-8")
        if case_replacements:
            case_file = case / "case.md"
            case_text = case_file.read_text(encoding="utf-8")
            for replacement in case_replacements:
                old, new, *count = replacement
                self.assertIn(old, case_text)
                case_text = case_text.replace(old, new, count[0] if count else -1)
            case_file.write_text(case_text, encoding="utf-8")
        if record is not None:
            shutil.copyfile(record, case / "record.md")
        if record_replacements:
            record_file = case / "record.md"
            record_text = record_file.read_text(encoding="utf-8")
            for replacement in record_replacements:
                old, new, *count = replacement
                self.assertIn(old, record_text)
                record_text = record_text.replace(old, new, count[0] if count else -1)
            record_file.write_text(record_text, encoding="utf-8")
        return directory, case

    def _rehash_boundary_case(self, case):
        proposal = case / "proposal.md"
        proposal_text = proposal.read_text(encoding="utf-8")
        sections, _ = _sections(proposal_text)
        bc = {key: value for key, value in sections.items() if key.startswith("BC-")}
        seq = {key: value for key, value in sections.items() if key.startswith("SEQ-")}
        new_hash = _boundary_object_hash(bc, seq)
        proposal_text = proposal_text.replace(
            "sha256:f842c9788c83603e53a5d3776f4b6abb18cf930831d0adf3491394ef6d5c5574",
            new_hash,
            1,
        )
        proposal.write_text(proposal_text, encoding="utf-8")
        record = case / "record.md"
        record_text = record.read_text(encoding="utf-8").replace(
            "sha256:f842c9788c83603e53a5d3776f4b6abb18cf930831d0adf3491394ef6d5c5574",
            new_hash,
            1,
        )
        record.write_text(record_text, encoding="utf-8")
        review = next(
            event for event in _events(record_text)
            if event.fields.get("target") == "RS-001"
        )
        record.write_text(
            record_text.replace(review.fields["content hash"], _review_snapshot_hash(review), 1),
            encoding="utf-8",
        )

    def test_handoff_scope_must_cover_object_and_all_responsibility_ac(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("BC-001 consumer admission 与 AC-001/AC-002", "BC-001 consumer admission 与 AC-001", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("HS-001 scope does not cover responsibility criteria" in issue.message for issue in issues), issues)

    def test_empty_handoff_return_cannot_confirm_material_responsibility(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("- **contribution**: BC-001 consumer responsibility", "- **contribution**: completed", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("HS-001 return contribution does not cover responsibility objects" in issue.message for issue in issues), issues)

    def test_returned_material_handoff_owner_must_be_in_rs_electorate(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                (
                    "## S-0005 | 2026-08-12T11:30:00Z",
                    """## S-0005 | 2026-08-12T11:21:00Z
- **type**: HANDOFF
- **target**: HS-003
- **to**: code-owner-service-c
- **scope**: PS-001 integration review
- **expires at**: 2026-08-12T11:24:00Z
- **status**: OPEN

## S-0006 | 2026-08-12T11:23:00Z
- **type**: HANDOFF_RETURN
- **target**: HS-003
- **speaker**: code-owner-service-c
- **contribution**: PS-001 integration contribution
- **status**: RETURNED

## S-0005 | 2026-08-12T11:30:00Z""",
                    1,
                ),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("eligible owners differ" in issue.message and "code-owner-service-c" in issue.message for issue in issues), issues)

    def test_handoff_expiry_and_return_attribution_are_validated(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("- **expires at**: 2026-08-12T11:10:30Z", "- **expires at**: 2026-08-12T11:05:00Z", 1),
                ("- **speaker**: code-owner-service-b", "- **speaker**: attacker-owner", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("HS-001 return occurred after expires at" in issue.message for issue in issues), issues)
        self.assertTrue(any("HS-001 RETURNED speaker must be" in issue.message for issue in issues), issues)

    def test_rs_electorate_n_and_deadlines_are_validated(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("code-owner-service-a, code-owner-service-b", "code-owner-service-a", 1),
                ("- **N**: 2", "- **N**: 1", 1),
                ("2026-08-12T12:15:00Z", "not-a-deadline", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("eligible owners differ" in issue.message for issue in issues), issues)
        self.assertTrue(any("N must equal 2" in issue.message for issue in issues), issues)
        self.assertTrue(any("timezone-aware lead disposition deadline" in issue.message for issue in issues), issues)

    def test_stance_must_occur_within_rs_review_window(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("## S-0007 | 2026-08-12T11:32:00Z", "## S-0007 | 2099-08-12T11:32:00Z", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("stance occurred after RS-001 review deadline" in issue.message for issue in issues), issues)

    def test_objection_requires_scope_and_lead_disposition(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("- **type**: AGREE\n- **owner**: code-owner-service-b", "- **type**: OBJECTION\n- **owner**: code-owner-service-b", 1),
                ("- **target**: P-0000-0001-2026-0812#PS-001\n- **basis**: HS-001, HS-002\n- **decision effect**: 确认责任范围\n- **review snapshot**: RS-001\n- **scope**: BC-001, SEQ-001, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006", "- **target**: P-0000-0001-2026-0812#PS-001\n- **basis**: E-0002\n- **decision effect**: consumer contract is rejected\n- **review snapshot**: RS-001\n- **requested change**: fix admission", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("OBJECTION must record concrete scope" in issue.message for issue in issues), issues)
        self.assertTrue(any("must have exactly one canonical LEAD_DISPOSITION" in issue.message for issue in issues), issues)

    def test_rs_requires_canonical_stance_events_not_a_notice_summary(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("- **eligible owners**:", "- **owner stances**: code-owner-service-a=AGREE, code-owner-service-b=AGREE\n- **eligible owners**:", 1),
                ("- **review snapshot**: RS-001\n- **scope**: BC-001", "- **review snapshot**: RS-999\n- **scope**: BC-001", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("must not duplicate canonical stance S events" in issue.message for issue in issues), issues)
        self.assertTrue(any("missing canonical re-review stance events" in issue.message for issue in issues), issues)

    def test_review_snapshot_content_hash_is_recomputed(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                (
                    "sha256:f9d0d68c20b75f362fe1d760c932350f61ed2d56ac587ae9a1f79f430acc1043",
                    "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                    1,
                ),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("content hash does not match its canonical NOTICE body" in issue.message for issue in issues), issues)

    def test_review_basis_is_exact_same_case_and_nonduplicated_after_rehash(self):
        variants = (
            "P-EVIL#PS-001",
            "attacker text PS-001",
            "P-0000-0001-2026-0812#PS-001, PS-001",
        )
        for basis in variants:
            with self.subTest(basis=basis), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                record = case / "record.md"
                text = record.read_text(encoding="utf-8").replace(
                    "- **basis**: P-0000-0001-2026-0812#PS-001\n- **decision effect**: 冻结当前方案审查窗口",
                    f"- **basis**: {basis}\n- **decision effect**: 冻结当前方案审查窗口",
                    1,
                )
                review = next(event for event in _events(text) if event.fields.get("target") == "RS-001")
                record.write_text(
                    text.replace(review.fields["content hash"], _review_snapshot_hash(review), 1),
                    encoding="utf-8",
                )
                issues = lint_case(case)
            self.assertTrue(any("RS-001 basis must exactly equal canonical basis" in issue.message for issue in issues), issues)

    def test_action_ruling_basis_is_exact_same_case_and_nonduplicated(self):
        variants = (
            "P-0000-0001-2026-0812#PS-001, P-EVIL#RS-001, S-0007",
            "P-0000-0001-2026-0812#PS-001, P-0000-0001-2026-0812#PS-001, RS-001, S-0007",
            "attacker:P-0000-0001-2026-0812#PS-001, attacker-RS-001, S-0007",
        )
        for basis in variants:
            with self.subTest(basis=basis), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                ruling = case / "ruling.md"
                ruling.write_text(
                    ruling.read_text(encoding="utf-8").replace(
                        "- **basis**: P-0000-0001-2026-0812#PS-001, RS-001, S-0007",
                        f"- **basis**: {basis}",
                        1,
                    ),
                    encoding="utf-8",
                )
                issues = lint_case(case, phase="acceptance")
            self.assertTrue(any("basis must begin with exact current artifact and RS" in issue.message for issue in issues), issues)

    def test_sha256_fields_reject_40_hex_digests(self):
        directory, case = self._mutated_case(
            [
                (
                    "boundary_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222",
                    "boundary_revision_set: sha256:1111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222",
                    1,
                ),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("exact immutable" in issue.message for issue in issues), issues)

    def test_nonempty_contract_set_requires_bc(self):
        directory, case = self._mutated_case(
            [
                ("**contract_set**: BC-001", "**contract_set**: external-api-v2"),
                ("**boundary obligations**: BC-001", "**boundary obligations**: NOT_APPLICABLE"),
                ("**boundary N/A reason**: NOT_APPLICABLE", "**boundary N/A reason**: all communication remains internal"),
                ("### BC-001 | service-a 到 service-b", "### Removed boundary | service-a 到 service-b"),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("proposal contract_set contains invalid tokens" in issue.message for issue in issues), issues)

    def test_stateful_proposal_requires_sequence(self):
        directory, case = self._mutated_case(
            [
                ("**state sequence obligations**: SEQ-001", "**state sequence obligations**: STATELESS"),
                ("**state sequence N/A reason**: NOT_APPLICABLE", "**state sequence N/A reason**: declared stateless by author"),
                ("### SEQ-001 | durable task 生命周期", "### Removed sequence | durable task 生命周期"),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("STATEFUL proposal must" in issue.message for issue in issues), issues)

    def test_cross_boundary_owner_must_be_concrete(self):
        directory, case = self._mutated_case(
            [("**consumer owner**: code-owner-service-b", "**consumer owner**: TBD")]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("consumer owner" in issue.message and "missing concrete" in issue.message for issue in issues), issues)

    def test_bc_and_sequence_require_acceptance_refs(self):
        directory, case = self._mutated_case(
            [
                ("**negative acceptance**: AC-002", "**negative acceptance**: TODO", 1),
                ("**positive acceptance**: AC-003, AC-004, AC-006", "**positive acceptance**: TODO"),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("BC-001 field 'negative acceptance'" in issue.message for issue in issues), issues)
        self.assertTrue(any("SEQ-001 field 'positive acceptance'" in issue.message for issue in issues), issues)

    def test_actual_verified_revision_set_must_match_approved_set(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            acceptance = case / "acceptance.md"
            acceptance.write_text(
                acceptance.read_text(encoding="utf-8").replace(
                    "**verified boundary revision set**: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222",
                    "**verified boundary revision set**: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa+sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("verified boundary revision set does not match" in issue.message for issue in issues), issues)

    def test_proposal_author_cannot_self_assert_verified_revision(self):
        directory, case = self._mutated_case(
            [
                (
                    "updated_at: 2026-08-12T12:00:00Z",
                    "boundary_verified_revision_set: sha256:1111111111111111111111111111111111111111111111111111111111111111+sha256:2222222222222222222222222222222222222222222222222222222222222222\nupdated_at: 2026-08-12T12:00:00Z",
                    1,
                ),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("proposal authors must not declare boundary_verified_revision_set" in issue.message for issue in issues), issues)

    def test_verified_revision_requires_external_evidence_in_latest_at(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            acceptance = case / "acceptance.md"
            acceptance.write_text(
                acceptance.read_text(encoding="utf-8").replace(
                    "- **verified boundary revision evidence**: E-0007",
                    "- **verified boundary revision evidence**: TODO",
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("must cite stable evidence" in issue.message for issue in issues), issues)

    def test_acceptance_evidence_ref_must_resolve_to_stable_canonical_entry(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            acceptance = case / "acceptance.md"
            acceptance.write_text(
                acceptance.read_text(encoding="utf-8").replace(
                    "- **verified boundary revision evidence**: E-0007",
                    "- **verified boundary revision evidence**: E-9999",
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("missing canonical evidence: ['E-9999']" in issue.message for issue in issues), issues)

        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            evidence = case / "evidence.md"
            evidence.write_text(
                evidence.read_text(encoding="utf-8").replace(
                    "- **stable slices**: ES-001 | fixture://revisions |",
                    "- **unstable observation**: fixture://revisions |",
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("E-0007 must contain a stable slice" in issue.message for issue in issues), issues)

    def test_verified_revision_evidence_must_semantically_bind_revision_pair(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            acceptance = case / "acceptance.md"
            acceptance.write_text(
                acceptance.read_text(encoding="utf-8").replace(
                    "- **verified boundary revision evidence**: E-0007",
                    "- **verified boundary revision evidence**: E-0001",
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("E-0001 must explicitly support boundary revision set" in issue.message for issue in issues), issues)
        self.assertTrue(any("E-0001 stable slice must bind the approved revision pair" in issue.message for issue in issues), issues)

    def test_latest_plan_ruling_controls_acceptance(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            ruling = case / "ruling.md"
            ruling.write_text(
                ruling.read_text(encoding="utf-8")
                + """

## R-0002 | 2026-08-12T12:45:00Z
- **record type**: PLAN_RULING
- **proposal result**: REJECTED
- **ruling scope**: ACTION
- **approved proposal/snapshot**: NOT_APPLICABLE
- **acceptance criteria**: NOT_APPLICABLE
- **boundary revision set**: NOT_APPLICABLE
""",
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("latest PLAN_RULING R-0002 must be APPROVED" in issue.message for issue in issues), issues)

    def test_initial_acceptance_must_be_at001_with_explicit_null_predecessor(self):
        for old, new, expected in (
            ("## AT-001", "## AT-999", "lineage must begin with AT-001"),
            ("- **supersedes AT**: null\n", "", "must explicitly declare supersedes AT: null"),
        ):
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                acceptance = case / "acceptance.md"
                acceptance.write_text(
                    acceptance.read_text(encoding="utf-8").replace(old, new, 1),
                    encoding="utf-8",
                )
                issues = lint_case(case, phase="acceptance")
            self.assertTrue(any(expected in issue.message for issue in issues), issues)

    def test_duplicate_ruling_and_latest_at_fields_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            ruling = case / "ruling.md"
            ruling.write_text(
                ruling.read_text(encoding="utf-8").replace(
                    "- **acceptance criteria**:",
                    "- **acceptance criteria**: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006\n- **acceptance criteria**:",
                    1,
                ),
                encoding="utf-8",
            )
            acceptance = case / "acceptance.md"
            acceptance.write_text(
                acceptance.read_text(encoding="utf-8").replace(
                    "- **criteria**:",
                    "- **criteria**: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006\n- **criteria**:",
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("R-0001 contains duplicate field: acceptance criteria" in issue.message for issue in issues), issues)
        self.assertTrue(any("AT-001 contains duplicate field: criteria" in issue.message for issue in issues), issues)

    def test_one_handoff_cannot_confirm_different_owners(self):
        directory, case = self._mutated_case(
            [
                ("**owner**: code-owner-service-b", "**owner**: code-owner-service-c", 1),
                ("**owner confirmation**: HS-002", "**owner confirmation**: HS-001", 1),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("reused for different owners" in issue.message for issue in issues), issues)

    def test_all_proposal_snapshots_require_unique_fields_and_direct_lineage(self):
        directory, case = self._mutated_case(
            [
                (
                    "### PS-001 | 2026-08-12T12:00:00Z",
                    """### PS-000 | 2026-08-12T11:00:00Z
- **supersedes**: null
- **content hash**: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- **content hash**: sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

### PS-001 | 2026-08-12T12:00:00Z""",
                    1,
                ),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("PS-000 contains duplicate field: content hash" in issue.message for issue in issues), issues)
        self.assertTrue(any("lineage must begin with PS-001" in issue.message for issue in issues), issues)
        self.assertTrue(any("PS-001 must directly supersede PS-000" in issue.message for issue in issues), issues)

    def test_successor_rs_must_directly_bind_existing_predecessor(self):
        directory, case = self._mutated_case(
            [
                (
                    "### PS-001 | 2026-08-12T12:00:00Z\n- **supersedes**: null",
                    """### PS-001 | 2026-08-12T11:25:00Z
- **supersedes**: null
- **included contributions**: HS-001, HS-002
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:f842c9788c83603e53a5d3776f4b6abb18cf930831d0adf3491394ef6d5c5574
- **content hash**: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- **formed_by**: code-owner-service-a

### PS-002 | 2026-08-12T12:00:00Z
- **supersedes**: PS-001""",
                    1,
                ),
            ],
            case_replacements=[("#PS-001", "#PS-002", 1)],
            record_replacements=[("- **supersedes**: null", "- **supersedes**: RS-999", 1)],
        )
        try:
            record = case / "record.md"
            events = _events(record.read_text(encoding="utf-8"))
            review = next(event for event in events if event.fields.get("target") == "RS-001")
            old_hash = review.fields["content hash"]
            record.write_text(record.read_text(encoding="utf-8").replace(old_hash, _review_snapshot_hash(review), 1), encoding="utf-8")
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("must directly supersede an existing predecessor RS" in issue.message for issue in issues), issues)

    def test_rs_boundary_object_refs_must_be_exact(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("- **boundary reviewed objects**: BC-001, SEQ-001", "- **boundary reviewed objects**: BC-001, SEQ-001, BC-999", 1),
            ],
        )
        try:
            record = case / "record.md"
            events = _events(record.read_text(encoding="utf-8"))
            review = next(event for event in events if event.fields.get("target") == "RS-001")
            old_hash = review.fields["content hash"]
            record.write_text(record.read_text(encoding="utf-8").replace(old_hash, _review_snapshot_hash(review), 1), encoding="utf-8")
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("boundary reviewed objects must exactly equal" in issue.message for issue in issues), issues)

    def test_successor_boundary_change_requires_successor_review(self):
        directory, case = self._mutated_case(
            [
                (
                    "- **supersedes**: null\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: 全案",
                    "- **supersedes**: PS-000\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: BC-001, SEQ-001",
                ),
            ]
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("successor review RS-001 must directly supersede" in issue.message for issue in issues), issues)

    def test_successor_review_reference_must_exist_in_record(self):
        directory, case = self._mutated_case(
            [
                (
                    "- **supersedes**: null\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: 全案",
                    "- **supersedes**: PS-000\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: BC-001, SEQ-001",
                ),
            ],
            case_replacements=[("review_snapshot_ref: RS-001", "review_snapshot_ref: RS-999")],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("RS-999 must have exactly one canonical NOTICE" in issue.message for issue in issues), issues)

    def test_empty_notice_is_not_a_canonical_successor_review(self):
        directory, case = self._mutated_case(
            [
                (
                    "- **supersedes**: null\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: 全案",
                    "- **supersedes**: PS-000\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: docs-only",
                )
            ],
            case_replacements=[("review_snapshot_ref: RS-001", "review_snapshot_ref: RS-002")],
        )
        try:
            record = case / "record.md"
            record.write_text(
                record.read_text(encoding="utf-8")
                + "\n## S-0008 | 2026-08-12T11:40:00Z\n- **type**: NOTICE\n- **target**: RS-002\n",
                encoding="utf-8",
            )
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("RS-002 artifact must exactly bind" in issue.message for issue in issues), issues)
        self.assertTrue(any("RS-002 must declare an exact 64-hex SHA-256 content hash" in issue.message for issue in issues), issues)

    def test_successor_cannot_hide_boundary_review_by_omitting_changed_blocks(self):
        directory, case = self._mutated_case(
            [
                (
                    "- **supersedes**: null\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: 全案",
                    "- **supersedes**: PS-000\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: documentation-only",
                )
            ],
            case_replacements=[("review_snapshot_ref: RS-001", "review_snapshot_ref: RS-999")],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("RS-999 must have exactly one canonical NOTICE" in issue.message for issue in issues), issues)

    def test_canonical_successor_review_passes(self):
        directory, case = self._mutated_case(
            [
                (
                    "### PS-001 | 2026-08-12T12:00:00Z\n- **supersedes**: null",
                    """### PS-001 | 2026-08-12T11:25:00Z
- **supersedes**: null
- **included contributions**: HS-001, HS-002
- **changed blocks**: 全案
- **dependent review blocks**: 全案
- **boundary object hash**: sha256:f842c9788c83603e53a5d3776f4b6abb18cf930831d0adf3491394ef6d5c5574
- **content hash**: sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- **formed_by**: code-owner-service-a

### PS-002 | 2026-08-12T12:00:00Z
- **supersedes**: PS-001""",
                ),
                (
                    "- **supersedes**: PS-001\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: 全案\n- **dependent review blocks**: 全案",
                    "- **supersedes**: PS-001\n- **included contributions**: HS-001, HS-002\n- **changed blocks**: lead-owned narrative\n- **dependent review blocks**: lead-owned narrative",
                    1,
                ),
            ],
            case_replacements=[
                ("#PS-001", "#PS-002", 1),
                ("review_snapshot_ref: RS-001", "review_snapshot_ref: RS-002"),
            ],
        )
        try:
            record = case / "record.md"
            record.write_text(
                record.read_text(encoding="utf-8").split("\n## S-0008 |", 1)[0],
                encoding="utf-8",
            )
            (case / "ruling.md").unlink()
            (case / "acceptance.md").unlink()
            record.write_text(
                record.read_text(encoding="utf-8")
                + """

## S-0008 | 2026-08-12T11:40:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: RS-002
- **basis**: P-0000-0001-2026-0812#PS-002, RS-001
- **decision effect**: 冻结 successor review
- **artifact**: P-0000-0001-2026-0812#PS-002
- **supersedes**: RS-001
- **review kind**: ORDINARY
- **boundary reviewed objects**: BC-001, SEQ-001
- **boundary object hash**: sha256:f842c9788c83603e53a5d3776f4b6abb18cf930831d0adf3491394ef6d5c5574
- **artifact content hash**: sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
- **eligible owners**: code-owner-service-a, code-owner-service-b
- **N**: 2
- **inherited stances**: code-owner-service-b=S-0007@RS-001
- **re-review owners**: code-owner-service-a
- **invalidated scopes**: lead-owned narrative
- **review deadline**: 2026-08-12T12:00:00Z
- **objection intake deadline**: 2026-08-12T12:00:00Z
- **lead disposition deadline**: 2026-08-12T12:15:00Z
- **lead reminder final deadline**: 2026-08-12T12:30:00Z
- **content hash**: sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc

## S-0009 | 2026-08-12T11:41:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-service-a
- **type**: AGREE
- **owner**: code-owner-service-a
- **target**: P-0000-0001-2026-0812#PS-002
- **basis**: PS-002
- **decision effect**: 确认 successor lead baseline
- **review snapshot**: RS-002
- **scope**: 全案
""",
                encoding="utf-8",
            )
            events = _events(record.read_text(encoding="utf-8"))
            review = next(event for event in events if event.fields.get("target") == "RS-002")
            record.write_text(
                record.read_text(encoding="utf-8").replace(
                    "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                    _review_snapshot_hash(review),
                    1,
                ),
                encoding="utf-8",
            )
            issues = lint_case(case)
            self.assertEqual(issues, [])
            proposal = case / "proposal.md"
            proposal.write_text(
                proposal.read_text(encoding="utf-8").replace(
                    "- **changed blocks**: lead-owned narrative",
                    "- **changed blocks**: 全案",
                    1,
                ),
                encoding="utf-8",
            )
            record_text = record.read_text(encoding="utf-8").replace(
                "- **invalidated scopes**: lead-owned narrative",
                "- **invalidated scopes**: ALL",
                1,
            )
            affected_review = next(
                event for event in _events(record_text) if event.fields.get("target") == "RS-002"
            )
            record.write_text(
                record_text.replace(
                    affected_review.fields["content hash"],
                    _review_snapshot_hash(affected_review),
                    1,
                ),
                encoding="utf-8",
            )
            affected_issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(
            any("cannot inherit stances when changed blocks or invalidated scopes cover ALL" in issue.message for issue in affected_issues),
            affected_issues,
        )

    def test_only_latest_acceptance_snapshot_can_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            acceptance = case / "acceptance.md"
            acceptance.write_text(
                acceptance.read_text(encoding="utf-8")
                + """

## AT-002 | 2026-08-12T14:00:00Z
- **supersedes AT**: AT-001

### Initial observation
- **methods**: successor visit
- **results**: no criteria executed
- **evidence**: E-0010
- **initial result**: PASSED

### Criteria results
""",
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("AT-002 criteria results are missing" in issue.message for issue in issues), issues)
        self.assertTrue(any("AT-002 initial result cannot be PASSED" in issue.message for issue in issues), issues)

    def test_acceptance_uses_approved_ruling_criteria_and_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            ruling = case / "ruling.md"
            ruling.write_text(
                ruling.read_text(encoding="utf-8")
                .replace("#PS-001", "#PS-999")
                .replace("AC-001, AC-002, AC-003, AC-004, AC-005, AC-006", "AC-001, AC-002"),
                encoding="utf-8",
            )
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("approved snapshot must exactly match" in issue.message for issue in issues), issues)
        self.assertTrue(any("acceptance criteria differ" in issue.message for issue in issues), issues)

    def test_latest_acceptance_pending_cell_blocks_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            pending = (FIXTURES / "invalid" / "pending-acceptance.md").read_text(encoding="utf-8")
            pending = pending.replace("## AT-001", "## AT-002", 1)
            acceptance = case / "acceptance.md"
            acceptance.write_text(acceptance.read_text(encoding="utf-8") + "\n" + pending, encoding="utf-8")
            issues = lint_case(case, phase="acceptance")
        self.assertTrue(any("AT-002 AC-006 is PENDING" in issue.message for issue in issues), issues)

    def test_action_ruling_requires_exact_effective_closure_commit(self):
        mutations = (
            ("record", "\n## S-0008 |", "", "exactly one canonical NOTICE:CLOSURE_COMMIT"),
            ("ruling", "- **ruling identity**: Chief Judge\n", "", "missing concrete closure/action field 'ruling identity'"),
            ("ruling", "- **closure bundle hash**: sha256:f4e385eba980f9f28435905d1064ffe0ff8d08b9580886280dc99f16ecee0a79", "- **closure bundle hash**: sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", "closure bundle hash does not match"),
        )
        for filename, old, new, expected in mutations:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                path = case / f"{filename}.md"
                text = path.read_text(encoding="utf-8")
                if filename == "record" and old == "\n## S-0008 |":
                    text = text.split(old, 1)[0]
                else:
                    self.assertIn(old, text)
                    text = text.replace(old, new, 1)
                path.write_text(text, encoding="utf-8")
                ruling_issues = lint_case(case, phase="ruling")
                acceptance_issues = lint_case(case, phase="acceptance")
            self.assertTrue(any(expected in issue.message for issue in ruling_issues), ruling_issues)
            self.assertTrue(any(expected in issue.message for issue in acceptance_issues), acceptance_issues)

    def test_closure_and_acceptance_timestamps_are_causal(self):
        mutations = (
            ("ruling.md", "## R-0001 | 2026-08-12T12:30:00Z", "## R-0001 | 2026-08-12T11:00:00Z", "cannot precede the current RS review deadline"),
            ("acceptance.md", "## AT-001 | 2026-08-12T13:00:00Z", "## AT-001 | 2026-08-12T12:30:00Z", "must occur after the PLAN_RULING closure commit"),
        )
        for filename, old, new, expected in mutations:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                path = case / filename
                path.write_text(path.read_text(encoding="utf-8").replace(old, new, 1), encoding="utf-8")
                issues = lint_case(case, phase="acceptance")
            self.assertTrue(any(expected in issue.message for issue in issues), issues)

    def test_acceptance_case_status_must_follow_effective_action(self):
        for status in ("implementing", "closed"):
            directory, case = self._mutated_case(
                [],
                case_replacements=[("status: acceptance", f"status: {status}", 1)],
            )
            try:
                issues = lint_case(case, phase="acceptance")
            finally:
                directory.cleanup()
            self.assertTrue(any("status must be acceptance" in issue.message for issue in issues), issues)

    def test_structured_proposal_refs_are_exact_same_case_lists(self):
        mutations = (
            ("**boundary obligations**: BC-001", "**boundary obligations**: BC-001, EVIL", False, "invalid tokens"),
            ("**boundary obligations**: BC-001", "**boundary obligations**: BC-001, BC-001", False, "duplicate refs"),
            ("**positive acceptance**: AC-001", "**positive acceptance**: P-EVIL#AC-001", True, "invalid tokens"),
            ("**positive acceptance**: AC-001", "**positive acceptance**: AC-001, AC-001", True, "duplicate refs"),
            ("**first use**: REQUIRED | AC-003", "**first use**: REQUIRED | P-EVIL#AC-003", True, "invalid tokens"),
        )
        for old, new, rehash, expected in mutations:
            with self.subTest(new=new):
                directory, case = self._mutated_case([(old, new, 1)])
                try:
                    if rehash:
                        self._rehash_boundary_case(case)
                    issues = lint_case(case)
                finally:
                    directory.cleanup()
                self.assertTrue(any(expected in issue.message for issue in issues), issues)

    def test_ruling_and_acceptance_criteria_are_exact_same_case_lists(self):
        mutations = (
            ("ruling.md", "AC-001, AC-002, AC-003, AC-004, AC-005, AC-006", "AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, EVIL"),
            ("ruling.md", "AC-001, AC-002, AC-003, AC-004, AC-005, AC-006", "AC-001, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006"),
            ("acceptance.md", "AC-001, AC-002, AC-003, AC-004, AC-005, AC-006", "P-EVIL#AC-001, AC-002, AC-003, AC-004, AC-005, AC-006"),
        )
        for filename, old, new in mutations:
            with self.subTest(filename=filename, new=new), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                path = case / filename
                path.write_text(path.read_text(encoding="utf-8").replace(old, new, 1), encoding="utf-8")
                issues = lint_case(case, phase="acceptance")
            self.assertTrue(any("invalid tokens" in issue.message or "duplicate refs" in issue.message for issue in issues), issues)

    def test_handoff_scope_and_contribution_reject_foreign_qualified_refs(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("BC-001 consumer admission 与 AC-001/AC-002", "P-EVIL#BC-001 consumer admission 与 P-EVIL#AC-001/P-EVIL#AC-002", 1),
                ("BC-001 consumer responsibility", "P-EVIL#BC-001 consumer responsibility", 1),
            ],
        )
        try:
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("foreign-qualified" in issue.message for issue in issues), issues)

    def test_acceptance_requires_concrete_canonical_evidence_per_criterion(self):
        mutations = (
            ("method: real producer to strict consumer", "method: NOT_APPLICABLE", "must record a concrete method"),
            ("evidence: E-0001", "evidence: trust me", "must contain at least one exact same-case E ref"),
            ("AC-002 | PASS | method: unknown-field negative admission | evidence: E-0002", "AC-002 | PASS | method: unknown-field negative admission | evidence: E-0001", "E-0001 must explicitly support AC-002"),
            ("evidence: E-0001", "evidence: E-0007", "E-0007 must explicitly support AC-001"),
        )
        for old, new, expected in mutations:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                acceptance = case / "acceptance.md"
                acceptance.write_text(acceptance.read_text(encoding="utf-8").replace(old, new, 1), encoding="utf-8")
                issues = lint_case(case, phase="acceptance")
            self.assertTrue(any(expected in issue.message for issue in issues), issues)

    def test_handoff_opening_status_is_exact_open(self):
        for invalid in ("RETURNED", "EVIL"):
            directory, case = self._mutated_case(
                [],
                record_replacements=[("- **status**: OPEN", f"- **status**: {invalid}", 1)],
            )
            try:
                issues = lint_case(case)
            finally:
                directory.cleanup()
            self.assertTrue(any("HANDOFF opening status must be OPEN" in issue.message for issue in issues), issues)

    def test_nonreturned_handoff_terminals_close_serial_window(self):
        terminal_bodies = {
            "DECLINED": """- **speaker**: code-owner-service-c
- **type**: HANDOFF_RETURN
- **target**: HS-003
- **basis**: S-0100
- **decision effect**: 拒绝该有限交付
- **reason**: ownership boundary 不匹配
- **status**: DECLINED""",
            "EXPIRED": """- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: HS-003
- **basis**: S-0100
- **decision effect**: 关闭过期交棒
- **notice kind**: HANDOFF_EXPIRED
- **status**: EXPIRED""",
            "CANCELLED": """- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: HS-003
- **basis**: S-0100
- **decision effect**: 关闭已取消交棒
- **notice kind**: HANDOFF_CANCELLED
- **status**: CANCELLED""",
        }
        for status, terminal_body in terminal_bodies.items():
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                record = case / "record.md"
                terminal_time = "2026-08-12T11:23:00Z"
                inserted = f"""## S-0100 | 2026-08-12T11:21:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: HANDOFF
- **target**: HS-003
- **basis**: PS-001
- **decision effect**: 授予非必要有限检查
- **to**: code-owner-service-c
- **scope**: PS-001 documentation check
- **expires at**: 2026-08-12T11:22:00Z
- **status**: OPEN

## S-0101 | {terminal_time}
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
{terminal_body}

"""
                text = record.read_text(encoding="utf-8")
                record.write_text(text.replace("## S-0005 |", inserted + "## S-0005 |", 1), encoding="utf-8")
                issues = lint_case(case)
            self.assertEqual(issues, [])

    def test_current_objection_disposition_routes_before_ruling(self):
        for disposition, expected in (
            ("ACCEPT", "requires a successor artifact and successor RS"),
            ("PARTIAL_ACCEPT", "requires a successor artifact and successor RS"),
            ("REJECT", "requires debate/full procedure and objection-routing state"),
        ):
            with self.subTest(disposition=disposition), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                record = case / "record.md"
                text = record.read_text(encoding="utf-8")
                old = """- **type**: AGREE
- **owner**: code-owner-service-b
- **target**: P-0000-0001-2026-0812#PS-001
- **basis**: HS-001, HS-002
- **decision effect**: 确认责任范围
- **review snapshot**: RS-001
- **scope**: BC-001, SEQ-001, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006"""
                new = """- **type**: OBJECTION
- **owner**: code-owner-service-b
- **target**: P-0000-0001-2026-0812#PS-001
- **basis**: E-0002
- **decision effect**: 改变 consumer admission 决策
- **review snapshot**: RS-001
- **scope**: BC-001, AC-002
- **requested change**: 收紧 unknown field admission"""
                self.assertIn(old, text)
                text = text.replace(old, new, 1)
                partial = ""
                if disposition == "PARTIAL_ACCEPT":
                    partial = "\n- **accepted portion**: unknown field rejection\n- **rejected portion**: error wording"
                disposition_event = f"""## S-0100 | 2026-08-12T12:10:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-service-a
- **type**: LEAD_DISPOSITION
- **target**: S-0007
- **basis**: S-0007
- **decision effect**: 处置当前 material objection
- **disposition**: {disposition}
- **reason**: 主 owner 明示处置{partial}

"""
                text = text.replace("## S-0008 |", disposition_event + "## S-0008 |", 1)
                record.write_text(text, encoding="utf-8")
                issues = lint_case(case)
            self.assertTrue(any(expected in issue.message for issue in issues), issues)

    def test_non_electorate_limited_objection_is_not_misclassified_as_owner_stance(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            case_file = case / "case.md"
            case_file.write_text(
                case_file.read_text(encoding="utf-8")
                .replace("procedure_mode: collaboration", "procedure_mode: debate", 1)
                .replace("status: acceptance", "status: awaiting-objection-grouping", 1),
                encoding="utf-8",
            )
            record = case / "record.md"
            text = record.read_text(encoding="utf-8").split("\n## S-0008 |", 1)[0]
            text += """

## S-0100 | 2026-08-12T11:40:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-external-reviewer
- **type**: OBJECTION
- **owner**: code-owner-external-reviewer
- **target**: P-0000-0001-2026-0812#PS-001
- **basis**: E-0002
- **decision effect**: 改变 consumer admission 决策
- **review snapshot**: RS-001
- **scope**: BC-001, AC-002
- **requested change**: 收紧 unknown field admission

## S-0101 | 2026-08-12T12:10:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-service-a
- **type**: LEAD_DISPOSITION
- **target**: S-0100
- **basis**: S-0100
- **decision effect**: 拒绝有限异议并进入庭前分组
- **disposition**: REJECT
- **reason**: 当前 admission 已按冻结契约处理
"""
            record.write_text(text, encoding="utf-8")
            (case / "ruling.md").unlink()
            (case / "acceptance.md").unlink()
            issues = lint_case(case)
        self.assertEqual(issues, [])

    def test_late_or_unbound_objection_cannot_bypass_current_review(self):
        variants = (
            ("", "OBJECTION must bind a current RS or PENDING_RS", "2026-08-12T11:40:00Z"),
            ("- **review snapshot**: PENDING_RS\n- **status**: PENDING_REVIEW_TARGET\n", "cannot use PENDING_RS after RS-001 opens", "2026-08-12T11:40:00Z"),
            ("- **review snapshot**: RS-001\n", "objection occurred after RS-001 review deadline", "2026-08-12T12:05:00Z"),
        )
        for snapshot_fields, expected, timestamp in variants:
            with self.subTest(expected=expected), tempfile.TemporaryDirectory() as directory:
                case = Path(directory) / "case"
                shutil.copytree(VALID, case)
                record = case / "record.md"
                event = f"""## S-0100 | {timestamp}
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-external-reviewer
- **type**: OBJECTION
- **owner**: code-owner-external-reviewer
- **target**: P-0000-0001-2026-0812#PS-001
- **basis**: E-0002
- **decision effect**: 改变 consumer admission 决策
{snapshot_fields}- **scope**: BC-001, AC-002
- **requested change**: 收紧 unknown field admission

"""
                text = record.read_text(encoding="utf-8").replace("## S-0008 |", event + "## S-0008 |", 1)
                record.write_text(text, encoding="utf-8")
                issues = lint_case(case)
            self.assertTrue(any(expected in issue.message for issue in issues), issues)

    def test_pending_objection_can_be_canonically_retargeted_into_current_review(self):
        with tempfile.TemporaryDirectory() as directory:
            case = Path(directory) / "case"
            shutil.copytree(VALID, case)
            case_file = case / "case.md"
            case_file.write_text(
                case_file.read_text(encoding="utf-8")
                .replace("procedure_mode: collaboration", "procedure_mode: debate", 1)
                .replace("status: acceptance", "status: awaiting-objection-grouping", 1),
                encoding="utf-8",
            )
            record = case / "record.md"
            text = record.read_text(encoding="utf-8")
            pending = """## S-0100 | 2026-08-12T11:21:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-external-reviewer
- **type**: OBJECTION
- **owner**: code-owner-external-reviewer
- **target**: P-0000-0001-2026-0812#DRAFT-001
- **basis**: E-0002
- **decision effect**: 请求收紧 consumer admission
- **review snapshot**: PENDING_RS
- **status**: PENDING_REVIEW_TARGET
- **scope**: BC-001, AC-002
- **requested change**: 收紧 unknown field admission

"""
            retarget = """## S-0101 | 2026-08-12T11:30:30Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: speaker-of-the-house
- **type**: NOTICE
- **target**: S-0100
- **basis**: RS-001, P-0000-0001-2026-0812#PS-001
- **decision effect**: 把交棒期异议确认到当前 review
- **notice kind**: OBJECTION_RETARGET
- **old target / status**: P-0000-0001-2026-0812#DRAFT-001 | PENDING_REVIEW_TARGET
- **new target / review snapshot**: P-0000-0001-2026-0812#PS-001 | RS-001
- **result**: CONFIRMED

"""
            disposition = """## S-0102 | 2026-08-12T11:33:00Z
- **case**: P-0000-0001-2026-0812
- **discussion type**: proposal
- **procedure mode**: collaboration
- **speaker**: code-owner-service-a
- **type**: LEAD_DISPOSITION
- **target**: S-0100
- **basis**: S-0100, S-0101
- **decision effect**: 拒绝异议并进入庭前分组
- **disposition**: REJECT
- **reason**: 当前 admission 已按冻结契约处理

"""
            text = text.replace("## S-0005 |", pending + "## S-0005 |", 1)
            text = text.replace("## S-0006 |", retarget + "## S-0006 |", 1)
            text = text.replace("## S-0008 |", disposition + "## S-0008 |", 1)
            record.write_text(text.split("\n## S-0008 |", 1)[0] + "\n", encoding="utf-8")
            (case / "ruling.md").unlink()
            (case / "acceptance.md").unlink()
            issues = lint_case(case)
        self.assertEqual(issues, [])

    def test_successor_inheritance_rejects_non_stance_source(self):
        directory, case = self._mutated_case(
            [],
            record_replacements=[
                ("- **inherited stances**: NOT_APPLICABLE", "- **inherited stances**: code-owner-service-b=S-0005@RS-000", 1),
                ("- **re-review owners**: code-owner-service-a, code-owner-service-b", "- **re-review owners**: code-owner-service-a", 1),
            ],
        )
        try:
            record = case / "record.md"
            review = next(event for event in _events(record.read_text(encoding="utf-8")) if event.fields.get("target") == "RS-001")
            record.write_text(
                record.read_text(encoding="utf-8").replace(review.fields["content hash"], _review_snapshot_hash(review), 1),
                encoding="utf-8",
            )
            issues = lint_case(case)
        finally:
            directory.cleanup()
        self.assertTrue(any("may inherit only AGREE or ABSTAIN" in issue.message for issue in issues), issues)


if __name__ == "__main__":
    unittest.main()
