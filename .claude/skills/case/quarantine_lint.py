#!/usr/bin/env python3
"""Fail-closed overlays for Chief-authorized Quorum record repairs.

The frozen Quorum linter remains byte-for-byte upstream.  This PuPu gate only
selects byte-bound canonical inputs after verifying closed manifests and
matching Chief procedural rulings.  Proposal quarantine and record-prefix
errata are composed in one isolated copy before exactly one substantive call
to the frozen reference linter.
"""

from __future__ import annotations

from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import stat
import tempfile
import unicodedata

from tools.quorum_lint import Issue
from tools.quorum_lint.lint import (
    _events,
    _frontmatter,
    _rulings,
    lint_case as _lint_case,
)


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
RECORD_SCHEMA = "quorum.record_errata.v1"
RECORD_MANIFEST_FIELD = "record_errata_manifest"
RECORD_EXPECTED_KEYS = {
    "canonical_prefix_path",
    "canonical_prefix_sha256",
    "case_id",
    "chief_authorization",
    "cutoff_event_id",
    "event_allowlist",
    "event_patches",
    "live_path",
    "preserved_prefix_bytes",
    "preserved_prefix_path",
    "preserved_prefix_sha256",
    "schema",
}
RECORD_PATCH_KEYS = {
    "canonical_event_sha256",
    "changes",
    "event_id",
    "raw_event_sha256",
}
RECORD_CHANGE_KEYS = {
    "REPLACE_FIELD_VALUE": {
        "canonical_value",
        "canonical_value_sha256",
        "field",
        "operation",
        "raw_value_sha256",
    },
    "INSERT_FIELD_AFTER": {
        "after_field",
        "canonical_value",
        "canonical_value_sha256",
        "field",
        "operation",
    },
    "RENAME_FIELD": {
        "from_field",
        "operation",
        "to_field",
        "value_sha256",
    },
}
CASE_ID_RE = re.compile(r"^P-\d{4}-\d{4}-\d{4}-\d{4}$")
RULING_RE = re.compile(r"^R-\d{4}$")
SHA_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
EVENT_ID_RE = re.compile(r"^S-\d{4}$")
EVENT_HEADING_BYTES_RE = re.compile(
    rb"(?m)^## (?P<id>S-\d{4}) \| (?P<timestamp>[^\r\n]+)\n"
)
RULING_HEADING_BYTES_RE = re.compile(
    rb"(?m)^## (?P<id>R-\d{4}) \| (?P<timestamp>[^\r\n]+)\n"
)
FIELD_BYTES_RE = re.compile(
    rb"^- \*\*(?P<name>[^*\r\n]+)\*\*: (?P<value>[^\r\n]*)\n$"
)
EMPTY_CANONICAL_JSON_FIELD_BYTES_RE = re.compile(
    rb"^- \*\*(?P<name>[^*\r\n]+ exact canonical JSON)\*\*:\n$"
)
P7_COMMON_EVENT_FIELD_ORDER = (
    "case",
    "discussion type",
    "procedure mode",
    "speaker",
    "type",
    "target",
    "basis",
    "decision effect",
)
P7_EVENT_PROCEDURE_MODES = frozenset({"collaboration", "debate", "full"})
# Frozen normative closed sets from court-records/templates.md section 10.
# This admission layer checks only the common ruling envelope; type-specific
# payload legality remains the frozen linter's responsibility.
P7_FUTURE_RULING_RECORD_TYPES = frozenset(
    {
        "MOTION_RULING",
        "PLAN_RULING",
        "ACCEPTANCE_RULING",
        "RECONSIDERATION_RULING",
        "PROCEDURAL_RULING",
        "PROCEDURAL_AUTHORITY_RULING",
        "PARTICIPATION_RULING",
        "EVIDENCE_DIRECTION",
        "SCOPE_RULING",
        "REFRAME_RULING",
        "SIDE_CASE_RULING",
        "TERMINATION_RULING",
    }
)
P7_FUTURE_DISCUSSION_PROCEDURE_MODES = frozenset(
    f"{discussion_type} | {procedure_mode}"
    for discussion_type in ("motion", "proposal")
    for procedure_mode in ("collaboration", "debate", "full")
)
APPROVAL_DIGEST = "utf8-sha256:8cbe697b157364a5b13646285b38409dc53ec5287deeb7913493e65b275cd14d"
P7_CASE_ID = "P-0000-0007-2026-0815"
P7_PREDECESSOR_MANIFEST_REF = "record-errata.S-0050.json"
P7_PREDECESSOR_MANIFEST_DIGEST = "sha256:9bed927485b8d679d3a78712101f4e8e89c86d0028bdcee2e670ec2ff54ba979"
P7_SUCCESSOR_MANIFEST_REF = "record-errata.S-0052.json"
P7_SUCCESSOR_MANIFEST_DIGEST = "sha256:64f7d3af8a8642442e2aebd8eff266ca8863d7b0c4375b2a0c7e23ab99057df5"
P7_RULING_ENVELOPE_DIGESTS = {
    "R-0001": "sha256:f7c50f34e7422b48d3ad0655d3ee3d4079d9faeb710f19fb6826d1d8a7d981a8",
    "R-0002": "sha256:f7c31f413228457745157aef05db5ee92cbe69defa77e8a6220576c0635e2591",
    "R-0003": "sha256:2baa8246ae72031014e3478416c74c690eaec85de2b3a251a47264c051242149",
}
P7_RULING_THROUGH_R4_BYTES = 38598
P7_RULING_THROUGH_R4_DIGEST = "sha256:3a5143ccbb484134bea0d2b63bc843d435811fa805144ea154d117342d6f3ae3"
P7_R4_TIMESTAMP = "2026-08-16T19:35:40-07:00"
P7_R4_RAW_BYTES = 9256
P7_R4_RAW_DIGEST = "sha256:c94d4c52d48b7397d54ff8308bc6a7843299a0832bf5b7eb26a23adf61b8c56c"
P7_R4_AUTHORIZATION_ENVELOPE_BYTES = 9122
P7_R4_AUTHORIZATION_DIGEST = "sha256:74e81eef5591c7b7eaa01f1af165f13e45c2bb493fe2ebd73e5f4032b7990eb4"
P7_R5_APPROVAL_DIGEST = "utf8-sha256:4f61d04cb0c4b59ec432dc09a0dce71a3abfe697883710ff57667f5c018be58a"
# R-0005 freezes this template.  After R-0005 is append-only archived, the
# authorized finalization pass replaces each literal exactly once with the
# archived heading timestamp and the SHA-256 of canonical parsed
# {"fields": ..., "id": "R-0005", "timestamp": ...}.  No logic changes are
# permitted in that pass.
P7_R5_TIMESTAMP = "2026-08-16T20:55:11-07:00"
P7_R5_AUTHORIZATION_DIGEST = "sha256:5398eff2f2b997dc048af453477a80a8b297ac984b7ca0057834c40f869c3d66"
P7_RULING_THROUGH_R5_BYTES = 51150
P7_RULING_THROUGH_R5_DIGEST = "sha256:a88bb9d3119aab3c6e2787430dc11d1cec664aa10f6b6f4393760d1a761476f4"
P7_R5_RAW_BYTES = 12551
P7_R5_RAW_DIGEST = "sha256:8a3528851850133620a85087fe83cb9588205ed3394706ab516e56c719f436ef"
P7_R5_AUTHORIZATION_ENVELOPE_BYTES = 12378
P7_R6_APPROVAL_DIGEST = "utf8-sha256:13b0c24f1b2ebd34591e504a18a99e8dfe6ce965198ec9d218c21fccbec46b52"
# R-0006 freezes this template.  The authorized finalization ceremony replaces
# these two literals exactly once with the archived R-0006 heading timestamp
# and recursive-NFC canonical parsed-envelope SHA-256.
P7_R6_TIMESTAMP = "2026-08-16T22:44:00-07:00"
P7_R6_AUTHORIZATION_DIGEST = "sha256:ef230be1afe837171977840cafe259288a56ca201aea3ccaa3c8b40fa42ab338"
P7_PRESERVED_THROUGH_S0052_BYTES = 281319
P7_PRESERVED_THROUGH_S0052_DIGEST = "sha256:0fed6177aaa2b3bf27126dfdaaf1dac3d3c9a9b88ba1d9d63decf198ae843432"
P7_CANONICAL_THROUGH_S0052_BYTES = 271890
P7_CANONICAL_THROUGH_S0052_DIGEST = "sha256:41da7be64a4789379a103b64211b24991a29933dee1262d3e4d88b0834e73724"
P7_EVENT_BINDINGS = {
    "S-0051": (923, "sha256:5f43d8596dbeb9ab4df7c74794d95f8ee1d44e3fadde6fe5bd7e0355369c75f2"),
    "S-0052": (3384, "sha256:63b0d65a3b611bd13789e78c7c01ae944ba872d0c4a9734caec8786e28f12e29"),
    "S-0053": (1808, "sha256:a68cdb216b788340b88b2f04c0ede7158d3a6883ef8b4dc422b5435b61957d01"),
    "S-0054": (6589, "sha256:aba126149f64e0205ea8f7a4261a39e52fee3d68cd80b51f892457097bc24dea"),
}
P7_S0053_TIMESTAMP = "2026-08-16T18:04:32-07:00"
P7_POST_S0053_RECORD_BYTES = 283127
P7_POST_S0053_RECORD_DIGEST = "sha256:2f00f033c97deda801085736a6fb9270a7190ecb3ab0b7603f0964002efd5054"
P7_POST_S0053_COMPOSED_BYTES = 273698
P7_POST_S0053_COMPOSED_DIGEST = "sha256:c0766372d42ea1680fc049b6fc38edc71228f5c24a84f2eebd8d2507488dee50"
P7_S0054_TIMESTAMP = "2026-08-16T21:18:06-07:00"
P7_S0054_RAW_BYTES = 6589
P7_S0054_RAW_DIGEST = "sha256:aba126149f64e0205ea8f7a4261a39e52fee3d68cd80b51f892457097bc24dea"
P7_S0054_AUTHORIZATION_ENVELOPE_BYTES = 6545
P7_S0054_AUTHORIZATION_DIGEST = "sha256:ea7c95a8f3101dc63082190fbb673268bb784985328e794317d8b2344ca83912"
P7_POST_S0054_RECORD_BYTES = 289717
P7_POST_S0054_RECORD_DIGEST = "sha256:54997fc7b006260830c2b935eecdfa0d4f202770a328d25ed9c50f9297f31e21"
P7_POST_S0054_COMPOSED_BYTES = 280288
P7_POST_S0054_COMPOSED_DIGEST = "sha256:deb90dd1f9dd7cde80c945c4fd2fe8dc68bb157c0db6e0d3cf309de58fd498ef"
P7_R5_INITIAL_ACTIVE_GATE_STATE = (
    "GATE_BLOCKED_PENDING_PS_008 | successor record errata overlay ACTIVE under R-0005 / S-0053; "
    "S-0051 remains INVALID; S-0052 controlling invalidation preserved; S-0028 / S-0040 canonical "
    "projections active only for lint; PS-008 / RS-003 NOT_YET_CREATED; production authority NONE"
)
P7_INITIAL_ACTIVE_GATE_STATE = (
    "GATE_BLOCKED_PENDING_PS_008 | successor record errata overlay ACTIVE under R-0006 / S-0053; "
    "R-0005 activation consumed/failed and non-reactivatable; S-0054 and later structurally valid "
    "append-only record events preserved; S-0051 remains INVALID; S-0052 controlling invalidation "
    "preserved; S-0028 / S-0040 canonical projections active only for lint; PS-008 / RS-003 "
    "NOT_YET_CREATED; production authority NONE"
)
P7_R5_EXACT_BINDINGS = {
    "ruling identity": "Chief Judge",
    "record type": "PROCEDURAL_RULING",
    "discussion type / procedure mode": "proposal | collaboration",
    "approval quote binding": (
        "exact UTF-8 text 批准 R-0005 | bytes:13 | "
        "utf8-sha256:4f61d04cb0c4b59ec432dc09a0dce71a3abfe697883710ff57667f5c018be58a"
    ),
    "prior approval disposition": (
        "R-0004 approval remains historical authority for the exact R-0004 package only; "
        "it is not reused or retroactively expanded for R-0005"
    ),
    "authority basis": (
        "Chief Judge 依宪法第一条直接处置未消费的 R-0004 activation defect，并授权一套新的 "
        "exact-envelope-bound successor activation；不是 PLAN_RULING、CLOSURE_COMMIT 或生产 action 授权"
    ),
    "procedural question": (
        "R-0004 在 tooling、pointer 或 case mutation 均未发生前暴露持续 gate-state admission "
        "生命周期缺陷时，如何以 append-only successor ruling 将其明确设为不可消费，并授权能跨合法 "
        "PS-008 / RS-003 生命周期继续工作的最终 activation"
    ),
    "result": "REMEDY_REQUIRED",
    "observed r0004 heading timestamp": P7_R4_TIMESTAMP,
    "observed r0004 raw block": (
        "bytes:9256 | sha256:c94d4c52d48b7397d54ff8308bc6a7843299a0832bf5b7eb26a23adf61b8c56c"
    ),
    "observed r0004 authorization envelope": (
        "canonical JSON over parsed {fields,id,timestamp} | bytes:9122 | "
        "sha256:74e81eef5591c7b7eaa01f1af165f13e45c2bb493fe2ebd73e5f4032b7990eb4"
    ),
    "observed ruling through r0004": (
        "ruling.md | bytes:38598 | sha256:3a5143ccbb484134bea0d2b63bc843d435811fa805144ea154d117342d6f3ae3"
    ),
    "r0004 defect": (
        "its exact active gate-state was made a persistent overlay admission predicate even though "
        "legitimate PS-008 / RS-003 and later case lifecycle transitions must replace that state; "
        "consuming it would make the overlay reject an authorized future lifecycle transition"
    ),
    "r0004 consumption evidence": (
        "case.md remains bytes:15894 / sha256:0420af5fc0957393db03d8e68a5da6c0f4e59889fcf558aef439e6a40014ef81 "
        "with pointer ABSENT; quarantine_lint.py remains bytes:39588 / "
        "sha256:3a60658007fe27cae0df946a8581bd5efc63f17665946163e48e0ecf4628a5e6; "
        "boundary_gate_selftest.py remains bytes:41888 / "
        "sha256:b9c5903d21325d5ca55818189234059660b550fe55385a75c3564c84cd334d9b; "
        "record.md remains unchanged"
    ),
    "r0004 disposition": "INELIGIBLE_FOR_ACTIVATION; UNCONSUMED",
    "r0004 tooling template disposition": "NEVER_INSTALL",
    "r0004 pointer authority": "NONE_AFTER_R0005",
    "r0004 preservation rule": (
        "R-0004 raw bytes and parsed envelope remain immutable historical record; "
        "R-0005 supersedes only its unconsumed activation authority"
    ),
    "activation decision": "SUCCESSOR_POINTER_ACTIVATION_AUTHORIZED_UNDER_R0005_ONLY",
    "record errata schema": RECORD_SCHEMA,
    "activation profile": (
        "P-0000-0007-2026-0815 | chief_authorization:R-0003 | candidate:S-0053 | "
        "pointer_authorization:R-0005"
    ),
    "immutable raw baseline": (
        "record.md through S-0052 | bytes:281319 | "
        "sha256:0fed6177aaa2b3bf27126dfdaaf1dac3d3c9a9b88ba1d9d63decf198ae843432"
    ),
    "successor preserved source prefix": (
        "record.preserved.through-S-0052.md | bytes:281319 | "
        "sha256:0fed6177aaa2b3bf27126dfdaaf1dac3d3c9a9b88ba1d9d63decf198ae843432"
    ),
    "successor canonical prefix": (
        "record.canonical.through-S-0052.md | bytes:271890 | "
        "sha256:41da7be64a4789379a103b64211b24991a29933dee1262d3e4d88b0834e73724"
    ),
    "successor errata manifest": (
        "record-errata.S-0052.json | bytes:1796 | "
        "sha256:64f7d3af8a8642442e2aebd8eff266ca8863d7b0c4375b2a0c7e23ab99057df5"
    ),
    "r0003 authorization envelope": (
        "canonical JSON over parsed {fields,id,timestamp} | bytes:9985 | "
        "sha256:2baa8246ae72031014e3478416c74c690eaec85de2b3a251a47264c051242149"
    ),
    "observed s0053 heading timestamp": P7_S0053_TIMESTAMP,
    "observed s0053 event payload": (
        "bytes:1633 | sha256:1a88b746fcbd6c2521f898b2dd8475a1c51123f091a0b4869c936c7d566a6bfe"
    ),
    "observed s0053 markdown body": (
        "bytes:1770 | sha256:1462dde569d43975803bfd704fbd29b1ad7e7e527e709e9e629d1f48145477b0"
    ),
    "observed s0053 full event": (
        "bytes:1808 | sha256:a68cdb216b788340b88b2f04c0ede7158d3a6883ef8b4dc422b5435b61957d01"
    ),
    "observed post-s0053 record": (
        "record.md | bytes:283127 | sha256:2f00f033c97deda801085736a6fb9270a7190ecb3ab0b7603f0964002efd5054"
    ),
    "observed post-s0053 composed record": (
        "canonical through S-0052 + exact S-0053 suffix | bytes:273698 | "
        "sha256:c0766372d42ea1680fc049b6fc38edc71228f5c24a84f2eebd8d2507488dee50"
    ),
    "predecessor activation disposition": (
        "S-0051 INVALID; record-errata.S-0050.json pointer ineligible whenever controlling "
        "S-0052 / S-0053 lineage is present"
    ),
    "controlling invalidation": "S-0052 CONTROLLING_AND_PRESERVED",
    "candidate notice": "S-0053 CANDIDATE_ONLY; unique first post-cutoff event",
    "tooling preimage": (
        "quarantine_lint.py | bytes:39588 | sha256:3a60658007fe27cae0df946a8581bd5efc63f17665946163e48e0ecf4628a5e6; "
        "boundary_gate_selftest.py | bytes:41888 | "
        "sha256:b9c5903d21325d5ca55818189234059660b550fe55385a75c3564c84cd334d9b"
    ),
    "r0005 authorization envelope algorithm": (
        "recursive NFC canonical JSON of parsed {fields,id,timestamp}; ensure_ascii=false; "
        "separators=(comma,colon); sort_keys=true; UTF-8; lowercase SHA-256 rendered as sha256:<64 hex>"
    ),
    "tooling derivation": (
        "only after R-0005 append and independent prefix audit, replace only the two exact placeholders "
        "with the archived R-0005 timestamp and computed R-0005 authorization envelope digest; "
        "no other template byte may differ"
    ),
    "derived tooling hashes": (
        "POST_R0005_PROVENANCE_ONLY; each installed target must equal the deterministic "
        "R-0005 template-substitution output"
    ),
    "manifest pointer": "record_errata_manifest: record-errata.S-0052.json",
    "manifest pointer placement": "one unique frontmatter line immediately after boundary_protocol: v1",
    "initial active case gate-state": P7_R5_INITIAL_ACTIVE_GATE_STATE,
    "initial gate-state scope": (
        "the exact initial active case gate-state is required only for the first 15902-byte activation "
        "candidate, first case.md write and immediate post-activation audit; it is not a persistent "
        "overlay admission predicate"
    ),
    "ongoing case admission projection": (
        "persistent overlay admission reads and constrains only case_id, boundary_protocol, the unique "
        "exact manifest pointer/path/placement, and one unique timezone-aware updated_at strictly later "
        "than archived R-0005; gate-state, status, current_owner, current_artifact_ref, "
        "review_snapshot_ref and all other lifecycle fields remain governed by later case authority and "
        "the frozen reference linter"
    ),
    "case updated_at rule": (
        "the initial value is read from real wall clock after R-0005 archive and tooling verification and "
        "must be strictly later than R-0005; later authorized lifecycle updates may replace it only with "
        "another unique timezone-aware value still later than R-0005"
    ),
    "exact initial case mutation": (
        "insert the exact pointer immediately after boundary_protocol: v1; replace only the unique "
        "updated_at; replace only the unique preactivation gate-state with the exact initial active "
        "gate-state; all other case.md bytes unchanged"
    ),
    "expected initial active case shape": (
        "bytes:15902 | full SHA-256 is post-write provenance determined by actual updated_at; later "
        "authorized lifecycle mutations may change size/hash without invalidating overlay"
    ),
    "initial activation conditions": (
        "exact R-0003, R-0004 and R-0005 envelopes; R-0004 INELIGIBLE/UNCONSUMED disposition; "
        "through-S-0052 three-piece set; S-0053 first/unique/full bytes; post-record/composed bytes; exact "
        "R-0005-derived tooling; exact initial case candidate/gate-state; pointer and updated_at > R-0005 "
        "must all pass before first write"
    ),
    "persistent activation conditions": (
        "immutable ruling/event/data/tooling lineage plus ongoing case admission projection; a "
        "pointer-present invalid admission fails closed and never falls back to raw; pointer removal "
        "alone immediately makes overlay INACTIVE"
    ),
    "post-activation gate expectation": (
        "direct P7 ruling lint reports exactly two remaining non-record blockers—boundary_revision_set exact "
        "pair and absence of APPROVED ACTION PLAN_RULING—with zero record-errata, S-0028 or S-0040 format "
        "errors; global gate still reports P7 as V1_PRE_GATE status=drafting"
    ),
    "lifecycle continuation expectation": (
        "a later authorized PS-008 / RS-003/status/current-ref/gate-state transition with a valid later "
        "updated_at preserves the same composed record and does not require a new record-errata ruling"
    ),
    "rollback case gate-state": (
        "GATE_BLOCKED_RECORD_ERRATA_ACTIVATION_POSTCHECK_FAILED | R-0003 candidate preserved; R-0005 "
        "pointer authorization consumed but activation failed; manifest pointer removed; overlay INACTIVE; "
        "retry requires new Chief ruling; S-0051 remains INVALID; S-0052 / S-0053 preserved; S-0028 / "
        "S-0040 raw record defects visible; PS-008 / RS-003 NOT_YET_CREATED; production authority NONE"
    ),
    "authorization effect": "ONLY_R0005_BOUND_TOOLING_DERIVATION_AND_SUCCESSOR_CASE_POINTER_ACTIVATION",
    "affected state": (
        "drafting unchanged | overlay ACTIVE only while the exact pointer and persistent activation "
        "conditions remain valid"
    ),
    "ps-008 / rs-003": "NOT_YET_CREATED",
    "production authority": "NONE",
}
P7_R5_BASIS_REFS = ("R-0001", "R-0002", "R-0003", "R-0004", "S-0051", "S-0052", "S-0053")
P7_R5_FIELD_ORDER = (
    "ruling identity",
    "record type",
    "discussion type / procedure mode",
    "basis",
    "approval quote binding",
    "prior approval disposition",
    "authority basis",
    "procedural question",
    "result",
    "observed r0004 heading timestamp",
    "observed r0004 raw block",
    "observed r0004 authorization envelope",
    "observed ruling through r0004",
    "r0004 defect",
    "r0004 consumption evidence",
    "r0004 disposition",
    "r0004 tooling template disposition",
    "r0004 pointer authority",
    "r0004 preservation rule",
    "activation decision",
    "record errata schema",
    "activation profile",
    "immutable raw baseline",
    "successor preserved source prefix",
    "successor canonical prefix",
    "successor errata manifest",
    "r0003 authorization envelope",
    "observed s0053 heading timestamp",
    "observed s0053 event payload",
    "observed s0053 markdown body",
    "observed s0053 full event",
    "observed post-s0053 record",
    "observed post-s0053 composed record",
    "predecessor activation disposition",
    "controlling invalidation",
    "candidate notice",
    "tooling preimage",
    "tooling template",
    "tooling substitution placeholders",
    "r0005 authorization envelope algorithm",
    "tooling derivation",
    "derived tooling hashes",
    "tooling verification",
    "manifest pointer",
    "manifest pointer placement",
    "initial active case gate-state",
    "initial gate-state scope",
    "ongoing case admission projection",
    "case updated_at rule",
    "exact initial case mutation",
    "expected initial active case shape",
    "initial activation conditions",
    "persistent activation conditions",
    "exact write_set",
    "execution order",
    "post-activation gate expectation",
    "lifecycle continuation expectation",
    "rollback authority",
    "rollback case gate-state",
    "expected rollback case shape",
    "authorization effect",
    "authorization limit",
    "affected state",
    "PS-008 / RS-003",
    "production authority",
    "appeal to Chief",
    "stop condition",
)
P7_R5_PARSED_FIELD_ORDER = tuple(" ".join(name.strip().lower().split()) for name in P7_R5_FIELD_ORDER)

P7_R6_EXACT_BINDINGS = {
    "ruling identity": "Chief Judge",
    "record type": "PROCEDURAL_RULING",
    "discussion type / procedure mode": "proposal | collaboration",
    "approval quote binding": (
        "exact UTF-8 text 批准 R-0006 | bytes:13 | "
        "utf8-sha256:13b0c24f1b2ebd34591e504a18a99e8dfe6ce965198ec9d218c21fccbec46b52"
    ),
    "prior approval disposition": (
        "R-0005 approval was consumed by the attempted activation, which failed and was rolled back "
        "under R-0005; it is historical authority only and cannot be reused, reactivated or "
        "retroactively expanded for R-0006"
    ),
    "authority basis": (
        "Chief Judge 依宪法第一条直接处置已消费且失败回滚的 R-0005 activation defect，并授权一套新的 "
        "exact-envelope-bound R-0006 successor activation；不是 PLAN_RULING、CLOSURE_COMMIT 或生产 "
        "action 授权"
    ),
    "procedural question": (
        "R-0005 activation 已消费并在合法 S-0054 append 后因 successor delimiter 被错误计入 S-0053 "
        "standalone event 而失败回滚时，如何以 append-only successor ruling 允许结构合法的当前及未来 "
        "record suffix，同时保持 exact anchors、fail-closed pointer admission 与 one-call frozen lint"
    ),
    "result": "REMEDY_REQUIRED",
    "observed r0005 heading timestamp": P7_R5_TIMESTAMP,
    "observed r0005 raw block": (
        "bytes:12551 | sha256:8a3528851850133620a85087fe83cb9588205ed3394706ab516e56c719f436ef"
    ),
    "observed r0005 authorization envelope": (
        "canonical JSON over parsed {fields,id,timestamp} | bytes:12378 | "
        "sha256:5398eff2f2b997dc048af453477a80a8b297ac984b7ca0057834c40f869c3d66"
    ),
    "observed ruling through r0005": (
        "ruling.md | bytes:51150 | sha256:a88bb9d3119aab3c6e2787430dc11d1cec664aa10f6b6f4393760d1a761476f4"
    ),
    "r0005 activation disposition": "CONSUMED_AND_FAILED; POINTER_ROLLED_BACK; NOT_REACTIVATABLE",
    "r0005 failure evidence": (
        "case.md bytes:15951 / sha256:8818c5630d40e0f2d1384facce0921ebad1ca428907d3df04d0adb35b86fb9e7 "
        "/ pointer ABSENT / updated_at:2026-08-16T21:22:42-07:00; record.md bytes:289717 / "
        "sha256:54997fc7b006260830c2b935eecdfa0d4f202770a328d25ed9c50f9297f31e21; R-0005 "
        "finalized tooling remains installed"
    ),
    "r0005 defect": (
        "its S-0053 standalone-byte check used a heading-to-next-heading slice, so one legal pure "
        "empty-LF delimiter before S-0054 was counted as part of S-0053 and changed the measured item "
        "from 1808 to 1809 bytes even though zero-extra-LF and one-or-more pure empty-LF forms are all legal"
    ),
    "r0005 test gap": (
        "its future-suffix positive test covered only the zero-extra-LF form, supplied an incomplete "
        "common envelope and mocked the frozen linter, so it did not cover one-or-more pure empty-LF "
        "delimiters or a mixed-delimiter legal event chain"
    ),
    "r0005 pointer authority": "NONE_AFTER_R0006",
    "r0005 tooling disposition": (
        "HISTORICAL_FINAL_PREIMAGE_ONLY; NEVER_REACTIVATE_POINTER; "
        "REPLACE_ONLY_WITH_R0006_DERIVED_TOOLING"
    ),
    "r0005 preservation rule": (
        "R-0005 raw bytes, parsed envelope, failed activation and rollback remain immutable historical "
        "record; R-0006 supersedes only any attempted reuse of its consumed pointer authority"
    ),
    "activation decision": "SUCCESSOR_POINTER_ACTIVATION_AUTHORIZED_UNDER_R0006_ONLY",
    "record errata schema": RECORD_SCHEMA,
    "activation profile": (
        "P-0000-0007-2026-0815 | chief_authorization:R-0003 | candidate:S-0053 | "
        "first_successor:S-0054 | pointer_authorization:R-0006"
    ),
    "immutable raw baseline": (
        "record.md through S-0052 | bytes:281319 | "
        "sha256:0fed6177aaa2b3bf27126dfdaaf1dac3d3c9a9b88ba1d9d63decf198ae843432"
    ),
    "successor preserved source prefix": (
        "record.preserved.through-S-0052.md | bytes:281319 | "
        "sha256:0fed6177aaa2b3bf27126dfdaaf1dac3d3c9a9b88ba1d9d63decf198ae843432"
    ),
    "successor canonical prefix": (
        "record.canonical.through-S-0052.md | bytes:271890 | "
        "sha256:41da7be64a4789379a103b64211b24991a29933dee1262d3e4d88b0834e73724"
    ),
    "successor errata manifest": (
        "record-errata.S-0052.json | bytes:1796 | "
        "sha256:64f7d3af8a8642442e2aebd8eff266ca8863d7b0c4375b2a0c7e23ab99057df5"
    ),
    "r0003 authorization envelope": (
        "canonical JSON over parsed {fields,id,timestamp} | bytes:9985 | "
        "sha256:2baa8246ae72031014e3478416c74c690eaec85de2b3a251a47264c051242149"
    ),
    "fixed s0053 heading timestamp": P7_S0053_TIMESTAMP,
    "fixed s0053 full event": (
        "standalone bytes:1808 | sha256:a68cdb216b788340b88b2f04c0ede7158d3a6883ef8b4dc422b5435b61957d01"
    ),
    "fixed post-s0053 record prefix": (
        "record.md through standalone S-0053 | bytes:283127 | "
        "sha256:2f00f033c97deda801085736a6fb9270a7190ecb3ab0b7603f0964002efd5054"
    ),
    "fixed post-s0053 composed prefix": (
        "canonical through S-0052 + standalone S-0053 | bytes:273698 | "
        "sha256:c0766372d42ea1680fc049b6fc38edc71228f5c24a84f2eebd8d2507488dee50"
    ),
    "observed s0054 heading timestamp": P7_S0054_TIMESTAMP,
    "observed s0054 parsed envelope": (
        "canonical JSON over parsed {fields,id,timestamp} | bytes:6545 | "
        "sha256:ea7c95a8f3101dc63082190fbb673268bb784985328e794317d8b2344ca83912"
    ),
    "observed s0054 full event": (
        "standalone bytes:6589 | sha256:aba126149f64e0205ea8f7a4261a39e52fee3d68cd80b51f892457097bc24dea"
    ),
    "observed post-s0054 record": (
        "record.md | bytes:289717 | sha256:54997fc7b006260830c2b935eecdfa0d4f202770a328d25ed9c50f9297f31e21"
    ),
    "observed post-s0054 composed record": (
        "canonical through S-0052 + exact live suffix through S-0054 | bytes:280288 | "
        "sha256:deb90dd1f9dd7cde80c945c4fd2fe8dc68bb157c0db6e0d3cf309de58fd498ef"
    ),
    "future record suffix admission": (
        "exact standalone S-0053 || PURE_LF* || exact standalone S-0054 || "
        "zero-or-more(PURE_LF* || strict future S event); each PURE_LF* is zero or more literal LF "
        "bytes after the preceding event's final LF, S-0053 and S-0054 are immutable anchors, and all "
        "delimiter bytes are explicitly consumed but excluded from event raw hashes"
    ),
    "future event delimiter": (
        "every event raw ends in exactly one LF; between that final LF and the next heading zero or more "
        "additional bytes are legal only when every byte is LF; all delimiter bytes must be consumed and "
        "excluded from both adjacent event raws, while space/tab pseudo-empty lines and any trailing "
        "blank-only suffix fail closed"
    ),
    "future event identifier rule": (
        "S-0054 is the exact first successor; every later heading is exact S-[0-9]{4}, unique and strictly "
        "increasing by numeric identifier from the preceding event"
    ),
    "future event timestamp rule": (
        "S-0054 uses its exact frozen aware timestamp; every later heading timestamp is timezone-aware and "
        "strictly later than the preceding event timestamp"
    ),
    "future event common envelope": (
        "first eight fields are exactly case, discussion type, procedure mode, speaker, type, target, "
        "basis, decision effect in that order; case=P-0000-0007-2026-0815, discussion type=proposal, "
        "procedure mode is collaboration/debate/full and all eight values are concrete under frozen "
        "meaningful-value rules"
    ),
    "future event field grammar": (
        "UTF-8, Unicode NFC, LF-only, no BOM/CR/hidden text; each body item is one exact - **name**: value "
        "line or one eligible canonical-JSON attachment; normalized field names are nonempty and unique "
        "and the parsed field order/value map must exactly equal the frozen event parser result"
    ),
    "future event canonical json": (
        "only a field whose name ends with exact lowercase suffix  exact canonical JSON may use empty "
        "header + json + one canonical JSON object line + ; duplicate keys, arrays/scalars, "
        "NaN/Infinity, non-NFC, noncanonical encoding, extra lines or extra whitespace fail closed"
    ),
    "future event extension policy": (
        "extension field names remain open exactly as the frozen speech/event parser is open; each "
        "extension is structurally parsed and preserved in raw order, common-field shadowing and "
        "normalized duplicates fail closed, and type-specific legality is decided only by the one "
        "frozen linter call"
    ),
    "future event raw preservation": (
        "every admitted post-S-0052 byte, including each zero-or-more pure-LF delimiter, extension field "
        "and canonical-JSON attachment, is copied to composed record unchanged; event raw hashes exclude "
        "all preceding/following delimiter bytes and no filtering, normalization, rendering, reordering "
        "or fallback occurs"
    ),
    "overlay composition": (
        "proposal quarantine and record errata resolve first in one isolated copy, then the frozen "
        "reference linter is called exactly once on canonical-through-S-0052 plus the exact admitted live suffix"
    ),
    "invalid pointer behavior": (
        "any pointer-present manifest, ruling, anchor, suffix grammar, case projection, timestamp or "
        "tooling mismatch returns activation issues before frozen lint and never falls back to raw record"
    ),
    "pointer absent behavior": (
        "an actually absent pointer keeps the overlay inactive and calls frozen lint exactly once on the "
        "raw case; pointer text outside the one exact frontmatter field is invalid, not absence"
    ),
    "future ruling continuation": (
        "R-0006 is exact and unique immediately after exact ruling-through-R-0005 with one LF delimiter; "
        "later rulings require unique strictly increasing R ids and aware timestamps, canonical NFC field "
        "bodies, valid common ruling envelope and canonical JSON attachments, with no hidden bytes"
    ),
    "tooling preimage": (
        "quarantine_lint.py | bytes:75579 | sha256:887a1bd9b6af7b1688e5472520b3bddcebad327f388c8f2ce08cabfe8590d102; "
        "boundary_gate_selftest.py | bytes:110766 | "
        "sha256:a2299180bde9259a5b890b351afddb9a09fd9a544a7709cdffcb5741ed2ce4b0"
    ),
    "tooling substitution placeholders": (
        "quarantine_lint.py only | " + "0000-" + "00-00T00:00:00+00:00 count:1 | "
        "sha256:" + "R" * 64 + " count:1 | "
        "boundary_gate_selftest.py count:0"
    ),
    "r0006 authorization envelope algorithm": (
        "recursive NFC canonical JSON of parsed {fields,id,timestamp}; ensure_ascii=false; "
        "separators=(comma,colon); sort_keys=true; UTF-8; lowercase SHA-256 rendered as sha256: followed "
        "by exactly 64 lowercase hexadecimal characters"
    ),
    "tooling derivation": (
        "only after R-0006 append and independent exact-prefix/raw-item audit, replace only the two exact "
        "placeholders with the archived R-0006 timestamp and computed R-0006 authorization envelope "
        "digest; no other template byte may differ"
    ),
    "derived tooling hashes": (
        "POST_R0006_PROVENANCE_ONLY; each installed target must equal the deterministic R-0006 "
        "template-substitution output and reverse-normalize to the frozen template hash"
    ),
    "manifest pointer": "record_errata_manifest: record-errata.S-0052.json",
    "manifest pointer placement": "one unique frontmatter line immediately after boundary_protocol: v1",
    "observed rollback case baseline": (
        "case.md | bytes:15951 | sha256:8818c5630d40e0f2d1384facce0921ebad1ca428907d3df04d0adb35b86fb9e7 | "
        "updated_at:2026-08-16T21:22:42-07:00 | pointer ABSENT"
    ),
    "initial active case gate-state": P7_INITIAL_ACTIVE_GATE_STATE,
    "initial gate-state scope": (
        "the exact initial active case gate-state is required only for the first 16032-byte activation "
        "candidate, first case.md write and immediate post-activation audit; it is not a persistent "
        "overlay admission predicate"
    ),
    "ongoing case admission projection": (
        "persistent overlay admission constrains only case_id, boundary_protocol, the unique exact manifest "
        "pointer/path/placement and one unique timezone-aware updated_at strictly later than archived "
        "R-0006; all lifecycle fields remain governed by later case authority and the frozen reference linter"
    ),
    "case updated_at rule": (
        "the initial value is read from real wall clock after R-0006 archive and tooling verification and is "
        "strictly later than R-0006; later authorized lifecycle updates may replace it only with another "
        "unique timezone-aware value still later than R-0006"
    ),
    "exact initial case mutation": (
        "starting only from the exact 15951-byte rollback baseline, insert the exact pointer immediately "
        "after boundary_protocol: v1, replace only the unique updated_at and replace only the unique "
        "rollback gate-state with the exact initial active gate-state; all other case.md bytes unchanged"
    ),
    "expected initial active case shape": (
        "bytes:16032 | full SHA-256 is post-write provenance determined by actual updated_at; inverse "
        "removal/replacement must reconstruct bytes:15951 / "
        "sha256:8818c5630d40e0f2d1384facce0921ebad1ca428907d3df04d0adb35b86fb9e7"
    ),
    "initial activation conditions": (
        "exact R-0001..R-0006 lineage; R-0005 CONSUMED_AND_FAILED/POINTER_ROLLED_BACK; exact through-S-0052 "
        "three-piece set; exact standalone S-0053 and S-0054; exact post-S-0054 raw/composed anchors; exact "
        "R-0006-derived tooling; exact initial case candidate, pointer and updated_at > R-0006 must all pass "
        "before first write"
    ),
    "persistent activation conditions": (
        "immutable ruling/manifest/prefix/S-0053/S-0054/tooling lineage, strict lossless future ruling and "
        "record suffix admission and ongoing case projection; pointer-present invalid admission fails closed "
        "without raw fallback, while pointer removal alone makes overlay INACTIVE"
    ),
    "post-activation gate expectation": (
        "direct P7 ruling lint reports exactly two remaining non-record blockers—boundary_revision_set exact "
        "pair and absence of APPROVED ACTION PLAN_RULING—with zero record-errata, S-0028, S-0040 or "
        "suffix-admission errors; global gate still reports P7 as V1_PRE_GATE status=drafting"
    ),
    "lifecycle continuation expectation": (
        "later authorized S events, PS-008 / RS-003, status/current-ref/gate-state and case updated_at "
        "transitions preserve the same canonical prefix plus exact raw suffix without a new record-errata "
        "ruling when the strict suffix and case projection remain valid"
    ),
    "rollback case gate-state": (
        "GATE_BLOCKED_RECORD_ERRATA_ACTIVATION_POSTCHECK_FAILED | R-0003 candidate preserved; R-0005 "
        "activation consumed/failed and non-reactivatable; R-0006 pointer authorization consumed but "
        "activation failed; manifest pointer removed; overlay INACTIVE; retry requires new Chief ruling; "
        "S-0051 remains INVALID; S-0052 / S-0053 / S-0054 preserved; S-0028 / S-0040 raw record defects "
        "visible; PS-008 / RS-003 NOT_YET_CREATED; production authority NONE"
    ),
    "authorization effect": "ONLY_R0006_BOUND_TOOLING_DERIVATION_AND_SUCCESSOR_CASE_POINTER_ACTIVATION",
    "affected state": (
        "drafting unchanged | overlay ACTIVE only while the exact pointer and persistent activation "
        "conditions remain valid"
    ),
    "ps-008 / rs-003": "NOT_YET_CREATED",
    "production authority": "NONE",
}
P7_R6_BASIS_REFS = (
    "R-0001",
    "R-0002",
    "R-0003",
    "R-0004",
    "R-0005",
    "S-0051",
    "S-0052",
    "S-0053",
    "S-0054",
)
P7_R6_FIELD_ORDER = (
    "ruling identity",
    "record type",
    "discussion type / procedure mode",
    "basis",
    "approval quote binding",
    "prior approval disposition",
    "authority basis",
    "procedural question",
    "result",
    "observed r0005 heading timestamp",
    "observed r0005 raw block",
    "observed r0005 authorization envelope",
    "observed ruling through r0005",
    "r0005 activation disposition",
    "r0005 failure evidence",
    "r0005 defect",
    "r0005 test gap",
    "r0005 pointer authority",
    "r0005 tooling disposition",
    "r0005 preservation rule",
    "activation decision",
    "record errata schema",
    "activation profile",
    "immutable raw baseline",
    "successor preserved source prefix",
    "successor canonical prefix",
    "successor errata manifest",
    "r0003 authorization envelope",
    "fixed s0053 heading timestamp",
    "fixed s0053 full event",
    "fixed post-s0053 record prefix",
    "fixed post-s0053 composed prefix",
    "observed s0054 heading timestamp",
    "observed s0054 parsed envelope",
    "observed s0054 full event",
    "observed post-s0054 record",
    "observed post-s0054 composed record",
    "future record suffix admission",
    "future event delimiter",
    "future event identifier rule",
    "future event timestamp rule",
    "future event common envelope",
    "future event field grammar",
    "future event canonical json",
    "future event extension policy",
    "future event raw preservation",
    "overlay composition",
    "invalid pointer behavior",
    "pointer absent behavior",
    "future ruling continuation",
    "tooling preimage",
    "tooling template",
    "tooling substitution placeholders",
    "r0006 authorization envelope algorithm",
    "tooling derivation",
    "derived tooling hashes",
    "tooling verification",
    "manifest pointer",
    "manifest pointer placement",
    "observed rollback case baseline",
    "initial active case gate-state",
    "initial gate-state scope",
    "ongoing case admission projection",
    "case updated_at rule",
    "exact initial case mutation",
    "expected initial active case shape",
    "initial activation conditions",
    "persistent activation conditions",
    "exact write_set",
    "execution order",
    "post-activation gate expectation",
    "lifecycle continuation expectation",
    "rollback authority",
    "rollback case gate-state",
    "expected rollback case shape",
    "authorization effect",
    "authorization limit",
    "affected state",
    "PS-008 / RS-003",
    "production authority",
    "appeal to Chief",
    "stop condition",
)
P7_R6_PARSED_FIELD_ORDER = tuple(" ".join(name.strip().lower().split()) for name in P7_R6_FIELD_ORDER)


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


def _sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def _local_path(case_path: Path, value: object) -> Path | None:
    if (
        not isinstance(value, str)
        or not value
        or "\\" in value
        or re.match(r"^[A-Za-z]:", value)
    ):
        return None
    if "\x00" in value or any(part in {"", ".", ".."} for part in value.split("/")):
        return None
    try:
        relative = Path(value)
    except (OSError, ValueError):
        return None
    if relative.is_absolute() or any(part in {"", ".", ".."} for part in relative.parts):
        return None
    try:
        resolved_case = case_path.resolve()
        resolved = (case_path / relative).resolve()
        resolved.relative_to(resolved_case)
    except (OSError, RuntimeError, ValueError):
        return None
    return resolved


def _local_non_symlink_path(case_path: Path, value: object) -> Path | None:
    if (
        not isinstance(value, str)
        or not value
        or "\\" in value
        or "\x00" in value
        or re.match(r"^[A-Za-z]:", value)
    ):
        return None
    raw_parts = value.split("/")
    if any(part in {"", ".", ".."} for part in raw_parts):
        return None
    try:
        relative = Path(*raw_parts)
    except (OSError, ValueError):
        return None
    if relative.is_absolute():
        return None
    candidate = case_path / relative
    current = case_path
    try:
        for part in relative.parts:
            current = current / part
            if current.exists() or current.is_symlink():
                if stat.S_ISLNK(current.lstat().st_mode):
                    return None
        candidate.relative_to(case_path)
    except (OSError, RuntimeError, ValueError):
        return None
    return candidate


def _read_manifest(
    path: Path,
    issues: list[Issue],
    *,
    label: str = "proposal quarantine",
) -> dict[str, object] | None:
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
        issues.append(Issue(path, f"{label} manifest is invalid JSON: {error}"))
        return None
    if not isinstance(manifest, dict):
        issues.append(Issue(path, f"{label} manifest must be a JSON object"))
        return None
    if duplicates:
        issues.append(Issue(path, f"{label} manifest has duplicate keys: {sorted(set(duplicates))}"))
    canonical = _canonical_json(manifest)
    if raw not in {canonical, canonical + "\n"}:
        issues.append(Issue(path, f"{label} manifest must use canonical JSON encoding with at most one trailing newline"))
    return manifest


def _regular_file(path: Path | None) -> bool:
    if path is None:
        return False
    try:
        return stat.S_ISREG(path.lstat().st_mode) and not path.is_symlink()
    except (OSError, ValueError):
        return False


def _same_file(left: Path, right: Path) -> bool:
    try:
        left_stat = left.stat()
        right_stat = right.stat()
    except (OSError, ValueError):
        return False
    return (left_stat.st_dev, left_stat.st_ino) == (right_stat.st_dev, right_stat.st_ino)


def _byte_items(value: bytes, heading_re: re.Pattern[bytes]) -> list[tuple[str, int, int, bytes]]:
    matches = list(heading_re.finditer(value))
    result: list[tuple[str, int, int, bytes]] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(value)
        result.append((match.group("id").decode("ascii"), start, end, value[start:end]))
    return result


def _one_byte_item(
    items: list[tuple[str, int, int, bytes]],
    identifier: str,
) -> tuple[str, int, int, bytes] | None:
    matching = [item for item in items if item[0] == identifier]
    return matching[0] if len(matching) == 1 else None


def _field_lines(event: bytes) -> tuple[list[bytes], dict[str, list[int]]] | None:
    try:
        lines = event.splitlines(keepends=True)
        fields: dict[str, list[int]] = {}
        for index, line in enumerate(lines[1:], start=1):
            match = FIELD_BYTES_RE.fullmatch(line)
            if not match:
                continue
            name = match.group("name").decode("utf-8")
            fields.setdefault(name, []).append(index)
        return lines, fields
    except UnicodeError:
        return None


def _field_value(line: bytes) -> bytes | None:
    match = FIELD_BYTES_RE.fullmatch(line)
    return match.group("value") if match else None


def _binding_head(value: str | None) -> str:
    return (value or "").split(" |", 1)[0].strip().strip("`")


def _semantic_binding(value: str | None) -> str:
    return (value or "").replace("`", "")


def _ruling_envelope_bytes(ruling: object) -> bytes:
    envelope = {
        "fields": getattr(ruling, "fields", {}),
        "id": getattr(ruling, "identifier", ""),
        "timestamp": getattr(ruling, "timestamp", ""),
    }
    return _canonical_json(envelope).encode("utf-8")


def _ruling_envelope_digest(ruling: object) -> str:
    return _sha256_bytes(_ruling_envelope_bytes(ruling))


def _exact_ruling(
    rulings: list[object],
    identifier: str,
    digest: str,
) -> object | None:
    matching = [ruling for ruling in rulings if getattr(ruling, "identifier", None) == identifier]
    if (
        len(matching) != 1
        or bool(getattr(matching[0], "duplicate_fields", ()))
        or _ruling_envelope_digest(matching[0]) != digest
    ):
        return None
    return matching[0]


def _p7_predecessor_pointer_blocked(
    case_path: Path,
    manifest_ref: str,
    issues: list[Issue],
) -> bool:
    if manifest_ref != P7_PREDECESSOR_MANIFEST_REF:
        return False
    issues.append(
        Issue(
            case_path / "case.md",
            "P7 predecessor manifest pointer is permanently tombstoned by the closed R-0002/S-0052 "
            "successor lineage; record-errata.S-0050.json cannot reactivate",
        )
    )
    return True


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


def _validate_record_manifest_shape(
    manifest: dict[str, object],
    manifest_path: Path,
    case_id: str,
    issues: list[Issue],
) -> bool:
    start = len(issues)
    if set(manifest) != RECORD_EXPECTED_KEYS:
        issues.append(
            Issue(
                manifest_path,
                f"record errata manifest must use exact keys {sorted(RECORD_EXPECTED_KEYS)}",
            )
        )
    if manifest.get("schema") != RECORD_SCHEMA:
        issues.append(Issue(manifest_path, f"record errata schema must be {RECORD_SCHEMA}"))
    if manifest.get("case_id") != case_id or not CASE_ID_RE.fullmatch(case_id):
        issues.append(Issue(manifest_path, "record errata case_id must match canonical case.md"))
    if manifest.get("live_path") != "record.md":
        issues.append(Issue(manifest_path, "record errata live_path must be record.md"))
    if not isinstance(manifest.get("preserved_prefix_bytes"), int) or isinstance(
        manifest.get("preserved_prefix_bytes"), bool
    ) or manifest.get("preserved_prefix_bytes", 0) <= 0:
        issues.append(Issue(manifest_path, "record errata preserved_prefix_bytes must be a positive integer"))
    for field in ("preserved_prefix_sha256", "canonical_prefix_sha256"):
        value = manifest.get(field)
        if not isinstance(value, str) or not SHA_RE.fullmatch(value):
            issues.append(Issue(manifest_path, f"record errata {field} must be exact lowercase sha256:<64 hex>"))
    authorization = manifest.get("chief_authorization")
    if not isinstance(authorization, str) or not RULING_RE.fullmatch(authorization):
        issues.append(Issue(manifest_path, "record errata Chief authorization must be one R-####"))
    cutoff = manifest.get("cutoff_event_id")
    if not isinstance(cutoff, str) or not EVENT_ID_RE.fullmatch(cutoff):
        issues.append(Issue(manifest_path, "record errata cutoff_event_id must be one S-####"))

    allowlist = manifest.get("event_allowlist")
    patches = manifest.get("event_patches")
    if (
        not isinstance(allowlist, list)
        or not allowlist
        or any(not isinstance(item, str) or not EVENT_ID_RE.fullmatch(item) for item in allowlist)
        or len(allowlist) != len(set(allowlist))
    ):
        issues.append(Issue(manifest_path, "record errata event_allowlist must be a non-empty unique S-#### list"))
        allowlist = []
    if not isinstance(patches, list) or not patches:
        issues.append(Issue(manifest_path, "record errata event_patches must be a non-empty list"))
        patches = []

    patch_ids: list[str] = []
    for patch_index, patch in enumerate(patches):
        if not isinstance(patch, dict):
            issues.append(Issue(manifest_path, f"record errata event_patches[{patch_index}] must be an object"))
            continue
        if set(patch) != RECORD_PATCH_KEYS:
            issues.append(
                Issue(
                    manifest_path,
                    f"record errata event_patches[{patch_index}] must use exact keys {sorted(RECORD_PATCH_KEYS)}",
                )
            )
        event_id = patch.get("event_id")
        if not isinstance(event_id, str) or not EVENT_ID_RE.fullmatch(event_id):
            issues.append(Issue(manifest_path, f"record errata event_patches[{patch_index}] event_id is invalid"))
        else:
            patch_ids.append(event_id)
        for field in ("raw_event_sha256", "canonical_event_sha256"):
            value = patch.get(field)
            if not isinstance(value, str) or not SHA_RE.fullmatch(value):
                issues.append(
                    Issue(
                        manifest_path,
                        f"record errata event_patches[{patch_index}] {field} must be exact lowercase SHA-256",
                    )
                )
        changes = patch.get("changes")
        if not isinstance(changes, list) or not changes:
            issues.append(Issue(manifest_path, f"record errata event_patches[{patch_index}] changes must be non-empty"))
            continue
        for change_index, change in enumerate(changes):
            location = f"event_patches[{patch_index}].changes[{change_index}]"
            if not isinstance(change, dict):
                issues.append(Issue(manifest_path, f"record errata {location} must be an object"))
                continue
            operation = change.get("operation")
            expected_keys = RECORD_CHANGE_KEYS.get(operation) if isinstance(operation, str) else None
            if expected_keys is None:
                issues.append(Issue(manifest_path, f"record errata {location} operation is not allowed"))
                continue
            if set(change) != expected_keys:
                issues.append(
                    Issue(
                        manifest_path,
                        f"record errata {location} must use exact keys {sorted(expected_keys)}",
                    )
                )
            string_fields = expected_keys - {"operation"}
            for field in string_fields:
                value = change.get(field)
                if not isinstance(value, str) or not value or "\n" in value or "\r" in value:
                    issues.append(Issue(manifest_path, f"record errata {location}.{field} must be one non-empty line"))
            for field in (
                "raw_value_sha256",
                "canonical_value_sha256",
                "value_sha256",
            ):
                if field in expected_keys:
                    value = change.get(field)
                    if not isinstance(value, str) or not SHA_RE.fullmatch(value):
                        issues.append(Issue(manifest_path, f"record errata {location}.{field} must be exact lowercase SHA-256"))
            if "canonical_value" in expected_keys and isinstance(change.get("canonical_value"), str):
                if change.get("canonical_value_sha256") != _sha256_bytes(
                    change["canonical_value"].encode("utf-8")
                ):
                    issues.append(Issue(manifest_path, f"record errata patch exactness {location} canonical value hash mismatch"))

    if isinstance(allowlist, list) and allowlist != patch_ids:
        issues.append(
            Issue(
                manifest_path,
                "record errata event identity requires event_allowlist and event_patches IDs in the same exact order",
            )
        )
    if len(patch_ids) != len(set(patch_ids)):
        issues.append(Issue(manifest_path, "record errata event identity contains duplicate patch IDs"))
    return len(issues) == start


def _apply_record_change(
    event: bytes,
    change: dict[str, object],
    manifest_path: Path,
    issues: list[Issue],
) -> bytes | None:
    parsed = _field_lines(event)
    if parsed is None:
        issues.append(Issue(manifest_path, "record errata patch exactness requires UTF-8 event fields"))
        return None
    lines, fields = parsed
    operation = change["operation"]

    if operation == "REPLACE_FIELD_VALUE":
        field = str(change["field"])
        indexes = fields.get(field, [])
        if len(indexes) != 1:
            issues.append(Issue(manifest_path, f"record errata patch exactness requires exactly one raw field {field!r}"))
            return None
        index = indexes[0]
        value = _field_value(lines[index])
        if value is None or change["raw_value_sha256"] != _sha256_bytes(value):
            issues.append(Issue(manifest_path, f"record errata patch exactness raw value hash mismatch for {field!r}"))
            return None
        match = FIELD_BYTES_RE.fullmatch(lines[index])
        assert match is not None
        replacement = str(change["canonical_value"]).encode("utf-8")
        lines[index] = lines[index][: match.start("value")] + replacement + lines[index][match.end("value") :]

    elif operation == "INSERT_FIELD_AFTER":
        field = str(change["field"])
        after_field = str(change["after_field"])
        indexes = fields.get(after_field, [])
        if len(indexes) != 1 or fields.get(field):
            issues.append(
                Issue(
                    manifest_path,
                    f"record errata patch exactness requires one {after_field!r} and zero {field!r} fields before insertion",
                )
            )
            return None
        inserted = f"- **{field}**: {change['canonical_value']}\n".encode("utf-8")
        lines.insert(indexes[0] + 1, inserted)

    elif operation == "RENAME_FIELD":
        from_field = str(change["from_field"])
        to_field = str(change["to_field"])
        indexes = fields.get(from_field, [])
        if len(indexes) != 1 or fields.get(to_field):
            issues.append(
                Issue(
                    manifest_path,
                    f"record errata patch exactness requires one {from_field!r} and zero {to_field!r} fields before rename",
                )
            )
            return None
        index = indexes[0]
        value = _field_value(lines[index])
        if value is None or change["value_sha256"] != _sha256_bytes(value):
            issues.append(Issue(manifest_path, f"record errata patch exactness value hash mismatch for {from_field!r}"))
            return None
        match = FIELD_BYTES_RE.fullmatch(lines[index])
        assert match is not None
        lines[index] = (
            lines[index][: match.start("name")]
            + to_field.encode("utf-8")
            + lines[index][match.end("name") :]
        )
    else:
        issues.append(Issue(manifest_path, f"record errata patch exactness rejects operation {operation!r}"))
        return None
    return b"".join(lines)


def _reconstruct_record_prefix(
    raw_prefix: bytes,
    canonical_prefix: bytes,
    manifest: dict[str, object],
    manifest_path: Path,
    issues: list[Issue],
) -> bool:
    if b"\r" in raw_prefix or b"\r" in canonical_prefix:
        issues.append(Issue(manifest_path, "record errata prefix must preserve exact LF-only event bytes"))
    if not raw_prefix.endswith(b"\n") or not canonical_prefix.endswith(b"\n"):
        issues.append(Issue(manifest_path, "record errata prefix must end with one complete LF-terminated event"))

    raw_items = _byte_items(raw_prefix, EVENT_HEADING_BYTES_RE)
    canonical_items = _byte_items(canonical_prefix, EVENT_HEADING_BYTES_RE)
    raw_ids = [item[0] for item in raw_items]
    canonical_ids = [item[0] for item in canonical_items]
    if not raw_items or len(raw_ids) != len(set(raw_ids)):
        issues.append(Issue(manifest_path, "record errata event identity requires unique raw event headings"))
        return False
    if raw_ids != canonical_ids:
        issues.append(Issue(manifest_path, "record errata event identity cannot add, remove, replace, or reorder events"))

    cutoff = str(manifest["cutoff_event_id"])
    if raw_ids[-1] != cutoff or raw_ids.count(cutoff) != 1:
        issues.append(Issue(manifest_path, "record errata cutoff must be the unique last complete preserved event"))

    allowlist = list(manifest["event_allowlist"])
    positions = [raw_ids.index(event_id) for event_id in allowlist if event_id in raw_ids]
    if len(positions) != len(allowlist) or positions != sorted(positions):
        issues.append(Issue(manifest_path, "record errata event identity requires allowlisted events once in raw order"))

    replacements: dict[str, bytes] = {}
    for patch in manifest["event_patches"]:
        event_id = str(patch["event_id"])
        raw_item = _one_byte_item(raw_items, event_id)
        if raw_item is None:
            issues.append(Issue(manifest_path, f"record errata event identity requires exactly one {event_id}"))
            continue
        transformed = raw_item[3]
        if patch["raw_event_sha256"] != _sha256_bytes(transformed):
            issues.append(Issue(manifest_path, f"record errata event identity raw hash mismatch for {event_id}"))
            continue
        for change in patch["changes"]:
            changed = _apply_record_change(transformed, change, manifest_path, issues)
            if changed is None:
                transformed = b""
                break
            transformed = changed
        if not transformed:
            continue
        if patch["canonical_event_sha256"] != _sha256_bytes(transformed):
            issues.append(Issue(manifest_path, f"record errata patch exactness canonical event hash mismatch for {event_id}"))
            continue
        replacements[event_id] = transformed

    rebuilt = bytearray(raw_prefix[: raw_items[0][1]])
    for item in raw_items:
        rebuilt.extend(replacements.get(item[0], item[3]))
    if bytes(rebuilt) != canonical_prefix:
        issues.append(
            Issue(
                manifest_path,
                "record errata patch exactness must reconstruct the entire canonical prefix from raw bytes and only allowlisted changes",
            )
        )
        return False
    return True


def _record_ruling_authorized(
    case_path: Path,
    manifest_ref: str,
    manifest_path: Path,
    manifest: dict[str, object],
    issues: list[Issue],
) -> tuple[object | None, str]:
    ruling_path = case_path / "ruling.md"
    try:
        ruling_bytes = ruling_path.read_bytes()
        ruling_text = ruling_bytes.decode("utf-8")
    except (OSError, UnicodeError) as error:
        issues.append(Issue(ruling_path, f"record errata Chief authorization cannot be read: {error}"))
        return None, ""
    authorization = str(manifest["chief_authorization"])
    matching = [ruling for ruling in _rulings(ruling_text) if ruling.identifier == authorization]
    if len(matching) != 1:
        issues.append(Issue(ruling_path, "record errata Chief authorization must resolve to exactly one ruling"))
        return None, ""
    ruling = matching[0]
    fields = ruling.fields
    manifest_digest = _sha256(manifest_path)
    if manifest.get("case_id") == P7_CASE_ID and manifest_ref == P7_SUCCESSOR_MANIFEST_REF:
        rulings = _rulings(ruling_text)
        lineage = {
            identifier: _exact_ruling(rulings, identifier, digest)
            for identifier, digest in P7_RULING_ENVELOPE_DIGESTS.items()
        }
        invalid = (
            manifest_digest != P7_SUCCESSOR_MANIFEST_DIGEST
            or authorization != "R-0003"
            or any(item is None for item in lineage.values())
            or _ruling_envelope_digest(ruling) != P7_RULING_ENVELOPE_DIGESTS["R-0003"]
        )
        if invalid:
            issues.append(
                Issue(
                    ruling_path,
                    "P7 successor record errata authorization must bind the exact R-0001/R-0002/R-0003 parsed envelopes and S-0052 manifest",
                )
            )
        return ruling, manifest_digest

    expected = {
        "ruling identity": "Chief Judge",
        "record type": "PROCEDURAL_RULING",
        "result": "REMEDY_REQUIRED",
        "record errata schema": RECORD_SCHEMA,
        "errata manifest": f"{manifest_ref} | {manifest_digest}",
        "preserved source prefix": (
            f"{manifest['preserved_prefix_path']} | bytes:{manifest['preserved_prefix_bytes']} | "
            f"{manifest['preserved_prefix_sha256']}"
        ),
        "canonical prefix": f"{manifest['canonical_prefix_path']} | {manifest['canonical_prefix_sha256']}",
    }
    invalid = bool(ruling.duplicate_fields) or any(
        _semantic_binding(fields.get(name)) != value for name, value in expected.items()
    )
    invalid = invalid or APPROVAL_DIGEST not in fields.get("basis", "")
    invalid = invalid or _binding_head(fields.get("cutoff event")) != manifest["cutoff_event_id"]
    allowlist = ", ".join(manifest["event_allowlist"])
    invalid = invalid or _binding_head(fields.get("event allowlist")) != allowlist

    for patch in manifest["event_patches"]:
        event_id = str(patch["event_id"])
        hash_field = f"{event_id.lower()} raw / canonical event hashes"
        if fields.get(hash_field) != (
            f"{patch['raw_event_sha256']} / {patch['canonical_event_sha256']}"
        ):
            invalid = True
        changes = patch["changes"]
        for index, change in enumerate(changes, start=1):
            base = f"{event_id.lower()} exact patch"
            field_name = base if len(changes) == 1 and base in fields else f"{base} {index}"
            description = fields.get(field_name, "")
            tokens = [str(change["operation"])]
            for key in (
                "field",
                "after_field",
                "from_field",
                "to_field",
                "raw_value_sha256",
                "canonical_value",
                "canonical_value_sha256",
                "value_sha256",
            ):
                if key in change:
                    tokens.append(str(change[key]))
            if not description or any(token not in description for token in tokens):
                invalid = True

    authorization_limit = fields.get("authorization limit", "")
    if not authorization_limit or (
        "永不修改" not in authorization_limit
        and re.search(r"\bimmutable\b", authorization_limit) is None
    ):
        invalid = True

    if manifest.get("case_id") == P7_CASE_ID:
        if (
            manifest_ref != P7_PREDECESSOR_MANIFEST_REF
            or manifest_digest != P7_PREDECESSOR_MANIFEST_DIGEST
            or _ruling_envelope_digest(ruling) != P7_RULING_ENVELOPE_DIGESTS["R-0001"]
        ):
            invalid = True

    if invalid:
        issues.append(
            Issue(
                ruling_path,
                "record errata Chief authorization must match the exact manifest, prefix, allowlist, event, patch, and authorization bindings",
            )
        )
    return ruling, manifest_digest


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        return None
    return timestamp


def _reject_noncanonical_json_constant(value: str) -> object:
    raise ValueError(f"non-canonical JSON constant: {value}")


def _p7_unique_json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _p7_json_is_nfc(value: object) -> bool:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value) == value and not any(
            ord(character) in {0, 0xFEFF}
            or 0xD800 <= ord(character) <= 0xDFFF
            for character in value
        )
    if isinstance(value, list):
        return all(_p7_json_is_nfc(item) for item in value)
    if isinstance(value, dict):
        return all(
            isinstance(key, str)
            and _p7_json_is_nfc(key)
            and _p7_json_is_nfc(item)
            for key, item in value.items()
        )
    return True


def _p7_normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().split())


def _p7_meaningful(value: str | None) -> bool:
    if value is None:
        return False
    normalized = value.strip()
    return bool(normalized) and normalized.upper() not in {
        "...",
        "…",
        "TODO",
        "TBD",
        "NONE",
        "NOT_APPLICABLE",
        "STATELESS",
    }


def _p7_delimited_event_items(
    value: bytes,
) -> list[tuple[str, str, int, int, bytes, bytes]] | None:
    """Split strict S events while keeping inter-event LF delimiters separate."""

    matches = list(EVENT_HEADING_BYTES_RE.finditer(value))
    if not matches or matches[0].start() != 0:
        return None
    result: list[tuple[str, str, int, int, bytes, bytes]] = []
    for position, match in enumerate(matches):
        start = match.start()
        stop = matches[position + 1].start() if position + 1 < len(matches) else len(value)
        segment = value[start:stop]
        trailing_lfs = len(segment) - len(segment.rstrip(b"\n"))
        if trailing_lfs < 1:
            return None
        delimiter_bytes = trailing_lfs - 1
        if position + 1 == len(matches) and delimiter_bytes:
            return None
        raw_event = segment[:-delimiter_bytes] if delimiter_bytes else segment
        delimiter = segment[len(raw_event) :]
        try:
            identifier = match.group("id").decode("ascii")
            timestamp = match.group("timestamp").decode("utf-8")
        except UnicodeError:
            return None
        result.append(
            (
                identifier,
                timestamp,
                start,
                start + len(raw_event),
                raw_event,
                delimiter,
            )
        )
    return result


def _p7_strict_event_projection(raw_event: bytes) -> object | None:
    """Parse one lossless S event and prove equivalence to the frozen parser."""

    if (
        not raw_event.endswith(b"\n")
        or raw_event.endswith(b"\n\n")
        or b"\r" in raw_event
        or b"\x00" in raw_event
        or b"\xef\xbb\xbf" in raw_event
    ):
        return None
    heading = EVENT_HEADING_BYTES_RE.match(raw_event)
    if heading is None or heading.start() != 0:
        return None
    try:
        raw_text = raw_event.decode("utf-8")
        identifier = heading.group("id").decode("ascii")
        timestamp = heading.group("timestamp").decode("utf-8")
    except UnicodeError:
        return None
    if unicodedata.normalize("NFC", raw_text) != raw_text:
        return None

    lines = raw_event[heading.end() :].splitlines(keepends=True)
    if not lines:
        return None
    fields: dict[str, str] = {}
    raw_field_names: list[str] = []
    line_index = 0
    while line_index < len(lines):
        line = lines[line_index]
        field_match = FIELD_BYTES_RE.fullmatch(line)
        json_match = EMPTY_CANONICAL_JSON_FIELD_BYTES_RE.fullmatch(line)
        if field_match is not None:
            try:
                raw_name = field_match.group("name").decode("utf-8")
                raw_value = field_match.group("value").decode("utf-8")
            except UnicodeError:
                return None
            if raw_name != " ".join(raw_name.split()) or raw_value != raw_value.strip():
                return None
            normalized_name = _p7_normalize_name(raw_name)
            if not normalized_name or normalized_name in fields:
                return None
            raw_field_names.append(raw_name)
            fields[normalized_name] = raw_value
            line_index += 1
            continue
        if json_match is None:
            return None
        if (
            line_index + 3 >= len(lines)
            or lines[line_index + 1] != b"```json\n"
            or lines[line_index + 3] != b"```\n"
        ):
            return None
        try:
            raw_name = json_match.group("name").decode("utf-8")
            canonical_json_line = lines[line_index + 2]
            parsed_json = json.loads(
                canonical_json_line.decode("utf-8"),
                object_pairs_hook=_p7_unique_json_object,
                parse_constant=_reject_noncanonical_json_constant,
            )
            canonical_json = (_canonical_json(parsed_json) + "\n").encode("utf-8")
        except (UnicodeError, UnicodeEncodeError, ValueError, json.JSONDecodeError):
            return None
        normalized_name = _p7_normalize_name(raw_name)
        if (
            raw_name != " ".join(raw_name.split())
            or not normalized_name
            or normalized_name in fields
            or not isinstance(parsed_json, dict)
            or not _p7_json_is_nfc(parsed_json)
            or canonical_json_line != canonical_json
        ):
            return None
        raw_field_names.append(raw_name)
        fields[normalized_name] = ""
        line_index += 4
    if tuple(raw_field_names[: len(P7_COMMON_EVENT_FIELD_ORDER)]) != P7_COMMON_EVENT_FIELD_ORDER:
        return None
    if len(raw_field_names) < len(P7_COMMON_EVENT_FIELD_ORDER):
        return None
    if (
        fields.get("case") != P7_CASE_ID
        or fields.get("discussion type") != "proposal"
        or fields.get("procedure mode") not in P7_EVENT_PROCEDURE_MODES
        or any(not _p7_meaningful(fields.get(name)) for name in P7_COMMON_EVENT_FIELD_ORDER)
    ):
        return None

    parsed_events = _events(raw_text)
    if len(parsed_events) != 1:
        return None
    parsed = parsed_events[0]
    if (
        parsed.identifier != identifier
        or parsed.timestamp != timestamp
        or tuple(parsed.fields.items()) != tuple(fields.items())
        or bool(parsed.duplicate_fields)
    ):
        return None
    return parsed


def _p7_strict_record_suffix(
    value: bytes,
) -> tuple[list[tuple[str, str, int, int, bytes, bytes]], list[object]] | None:
    if b"\r" in value or b"\x00" in value or value.startswith(b"\xef\xbb\xbf"):
        return None
    try:
        text = value.decode("utf-8")
    except UnicodeError:
        return None
    if unicodedata.normalize("NFC", text) != text:
        return None
    items = _p7_delimited_event_items(value)
    if not items:
        return None
    projections: list[object] = []
    previous_id = -1
    previous_timestamp: datetime | None = None
    for identifier, timestamp_text, _, _, raw_event, delimiter in items:
        if delimiter.strip(b"\n"):
            return None
        parsed_timestamp = _parse_timestamp(timestamp_text)
        parsed_event = _p7_strict_event_projection(raw_event)
        if (
            re.fullmatch(r"S-\d{4}", identifier) is None
            or int(identifier[2:]) <= previous_id
            or parsed_timestamp is None
            or (previous_timestamp is not None and parsed_timestamp <= previous_timestamp)
            or parsed_event is None
        ):
            return None
        previous_id = int(identifier[2:])
        previous_timestamp = parsed_timestamp
        projections.append(parsed_event)

    frozen_events = _events(text)
    if len(frozen_events) != len(projections):
        return None
    for strict, frozen in zip(projections, frozen_events):
        if (
            getattr(strict, "identifier", None) != frozen.identifier
            or getattr(strict, "timestamp", None) != frozen.timestamp
            or tuple(getattr(strict, "fields", {}).items()) != tuple(frozen.fields.items())
            or set(getattr(strict, "duplicate_fields", ())) != set(frozen.duplicate_fields)
        ):
            return None
    return items, projections


def _p7_future_ruling_chain_valid(
    rulings: list[object],
    ruling_items: list[tuple[str, int, int, bytes]],
    anchor_position: int,
    anchor: object,
) -> bool:
    future_items = ruling_items[anchor_position + 1 :]
    anchor_identifier = getattr(anchor, "identifier", "")
    previous_timestamp = _parse_timestamp(getattr(anchor, "timestamp", None))
    if previous_timestamp is None or re.fullmatch(r"R-\d{4}", anchor_identifier) is None:
        return False
    previous_id = int(anchor_identifier[2:])
    for position, item in enumerate(future_items):
        identifier, _, _, raw_item = item
        if b"\x00" in raw_item or b"\xef\xbb\xbf" in raw_item:
            return False
        heading = RULING_HEADING_BYTES_RE.match(raw_item)
        if heading is None:
            return False
        try:
            raw_text = raw_item.decode("utf-8")
            heading_timestamp = heading.group("timestamp").decode("utf-8")
        except UnicodeError:
            return False
        if unicodedata.normalize("NFC", raw_text) != raw_text:
            return False
        matching = [ruling for ruling in rulings if getattr(ruling, "identifier", None) == identifier]
        if len(matching) != 1:
            return False
        parsed = matching[0]
        timestamp = _parse_timestamp(heading_timestamp)
        if (
            not re.fullmatch(r"R-\d{4}", identifier)
            or int(identifier[2:]) <= previous_id
            or timestamp is None
            or timestamp <= previous_timestamp
            or getattr(parsed, "timestamp", None) != heading_timestamp
            or bool(getattr(parsed, "duplicate_fields", ()))
        ):
            return False
        fields = getattr(parsed, "fields", {})
        if any(
            unicodedata.normalize("NFC", value) != value
            for value in (identifier, heading_timestamp, *fields.keys(), *fields.values())
        ):
            return False
        required = ("ruling identity", "record type", "discussion type / procedure mode", "basis")
        if (
            tuple(fields)[: len(required)] != required
            or fields.get("ruling identity") != "Chief Judge"
            or fields.get("discussion type / procedure mode")
            not in P7_FUTURE_DISCUSSION_PROCEDURE_MODES
            or fields.get("record type") not in P7_FUTURE_RULING_RECORD_TYPES
            or any(not _p7_meaningful(fields.get(name)) for name in required)
        ):
            return False

        body = raw_item[heading.end() :]
        if position + 1 < len(future_items):
            if not body.endswith(b"\n\n"):
                return False
            body = body[:-1]
        elif body.endswith(b"\n\n"):
            return False
        lines = body.splitlines(keepends=True)
        field_line_count = 0
        seen_field_names: set[str] = set()
        line_index = 0
        structural_body_valid = bool(lines)
        while structural_body_valid and line_index < len(lines):
            line = lines[line_index]
            field_match = FIELD_BYTES_RE.fullmatch(line)
            if field_match is not None:
                try:
                    raw_name = field_match.group("name").decode("utf-8")
                    raw_value = field_match.group("value").decode("utf-8")
                except UnicodeError:
                    structural_body_valid = False
                    break
                normalized_name = _p7_normalize_name(raw_name)
                if (
                    raw_name != " ".join(raw_name.split())
                    or raw_value != raw_value.strip()
                    or not normalized_name
                    or normalized_name in seen_field_names
                ):
                    structural_body_valid = False
                    break
                seen_field_names.add(normalized_name)
                field_line_count += 1
                line_index += 1
                continue
            json_match = EMPTY_CANONICAL_JSON_FIELD_BYTES_RE.fullmatch(line)
            if (
                json_match is None
                or line_index + 3 >= len(lines)
                or lines[line_index + 1] != b"```json\n"
                or lines[line_index + 3] != b"```\n"
            ):
                structural_body_valid = False
                break
            canonical_json_line = lines[line_index + 2]
            try:
                raw_name = json_match.group("name").decode("utf-8")
                parsed_json = json.loads(
                    canonical_json_line.decode("utf-8"),
                    object_pairs_hook=_p7_unique_json_object,
                    parse_constant=_reject_noncanonical_json_constant,
                )
                canonical_json_bytes = (_canonical_json(parsed_json) + "\n").encode("utf-8")
            except (UnicodeError, UnicodeEncodeError, ValueError, json.JSONDecodeError):
                structural_body_valid = False
                break
            normalized_name = _p7_normalize_name(raw_name)
            if (
                raw_name != " ".join(raw_name.split())
                or not normalized_name
                or normalized_name in seen_field_names
                or not isinstance(parsed_json, dict)
                or not _p7_json_is_nfc(parsed_json)
                or canonical_json_line != canonical_json_bytes
            ):
                structural_body_valid = False
                break
            seen_field_names.add(normalized_name)
            field_line_count += 1
            line_index += 4
        if not structural_body_valid or field_line_count != len(fields):
            return False
        previous_id = int(identifier[2:])
        previous_timestamp = timestamp
    return True


def _activation_notice_valid(
    suffix: bytes,
    manifest_ref: str,
    manifest: dict[str, object],
    manifest_digest: str,
    ruling: object | None,
    record_path: Path,
    issues: list[Issue],
) -> bool:
    byte_events = _byte_items(suffix, EVENT_HEADING_BYTES_RE)
    if not suffix or not byte_events or byte_events[0][1] != 0:
        issues.append(Issue(record_path, "record errata activation NOTICE must be the first complete post-cutoff event"))
        return False
    try:
        events = _events(suffix.decode("utf-8"))
    except UnicodeError:
        issues.append(Issue(record_path, "record errata activation suffix must be valid UTF-8"))
        return False
    activations = [
        event
        for event in events
        if event.fields.get("notice kind") == "RECORD_ERRATA_ACTIVATED"
    ]
    if len(activations) != 1 or activations[0].identifier != byte_events[0][0]:
        issues.append(Issue(record_path, "record errata requires exactly one first post-cutoff activation NOTICE"))
        return False
    activation = activations[0]
    expected = {
        "speaker": "speaker-of-the-house",
        "type": "NOTICE",
        "target": manifest["chief_authorization"],
        "basis": manifest["chief_authorization"],
        "notice kind": "RECORD_ERRATA_ACTIVATED",
        "record errata manifest": f"{manifest_ref} | {manifest_digest}",
        "preserved source prefix": (
            f"{manifest['preserved_prefix_path']} | bytes:{manifest['preserved_prefix_bytes']} | "
            f"{manifest['preserved_prefix_sha256']}"
        ),
        "canonical prefix": f"{manifest['canonical_prefix_path']} | {manifest['canonical_prefix_sha256']}",
    }
    invalid = bool(activation.duplicate_fields) or any(
        activation.fields.get(name) != value for name, value in expected.items()
    )
    ruling_timestamp = _parse_timestamp(getattr(ruling, "timestamp", None))
    activation_timestamp = _parse_timestamp(activation.timestamp)
    if ruling_timestamp is None or activation_timestamp is None or activation_timestamp <= ruling_timestamp:
        invalid = True
    if invalid:
        issues.append(
            Issue(
                record_path,
                "record errata activation NOTICE must exactly bind Speaker, ruling, manifest, preserved prefix, canonical prefix, and post-ruling order",
            )
        )
        return False
    return True


def _p7_successor_activation_valid(
    case_path: Path,
    manifest_ref: str,
    manifest_digest: str,
    preserved_bytes: bytes,
    canonical_bytes: bytes,
    live_bytes: bytes,
    issues: list[Issue],
) -> bool:
    start = len(issues)
    case_index_path = case_path / "case.md"
    ruling_path = case_path / "ruling.md"
    record_path = case_path / "record.md"

    if manifest_ref != P7_SUCCESSOR_MANIFEST_REF or manifest_digest != P7_SUCCESSOR_MANIFEST_DIGEST:
        issues.append(Issue(case_index_path, "P7 successor activation requires the exact S-0052 manifest pointer and digest"))

    try:
        ruling_bytes = ruling_path.read_bytes()
        ruling_text = ruling_bytes.decode("utf-8")
        rulings = _rulings(ruling_text)
    except (OSError, UnicodeError) as error:
        issues.append(Issue(ruling_path, f"P7 successor activation cannot read ruling lineage: {error}"))
        return False

    for identifier, digest in P7_RULING_ENVELOPE_DIGESTS.items():
        if _exact_ruling(rulings, identifier, digest) is None:
            issues.append(Issue(ruling_path, f"P7 successor activation requires exact parsed {identifier} envelope"))

    ruling_items = _byte_items(ruling_bytes, RULING_HEADING_BYTES_RE)
    r4_items = [item for item in ruling_items if item[0] == "R-0004"]
    r5_items = [item for item in ruling_items if item[0] == "R-0005"]
    r6_items = [item for item in ruling_items if item[0] == "R-0006"]
    r4_matches = [ruling for ruling in rulings if ruling.identifier == "R-0004"]
    r5_matches = [ruling for ruling in rulings if ruling.identifier == "R-0005"]
    r6_matches = [ruling for ruling in rulings if ruling.identifier == "R-0006"]
    r4 = r4_matches[0] if len(r4_matches) == 1 else None
    r5 = r5_matches[0] if len(r5_matches) == 1 else None
    r6 = r6_matches[0] if len(r6_matches) == 1 else None

    r4_raw = ruling_bytes[P7_RULING_THROUGH_R4_BYTES - P7_R4_RAW_BYTES : P7_RULING_THROUGH_R4_BYTES]
    if (
        len(ruling_bytes) < P7_RULING_THROUGH_R4_BYTES
        or _sha256_bytes(ruling_bytes[:P7_RULING_THROUGH_R4_BYTES]) != P7_RULING_THROUGH_R4_DIGEST
        or len(r4_items) != 1
        or len(r4_raw) != P7_R4_RAW_BYTES
        or _sha256_bytes(r4_raw) != P7_R4_RAW_DIGEST
        or r4 is None
        or bool(r4.duplicate_fields)
        or r4.timestamp != P7_R4_TIMESTAMP
        or len(_ruling_envelope_bytes(r4)) != P7_R4_AUTHORIZATION_ENVELOPE_BYTES
        or _ruling_envelope_digest(r4) != P7_R4_AUTHORIZATION_DIGEST
    ):
        issues.append(
            Issue(
                ruling_path,
                "P7 successor activation requires the exact immutable R-0004 raw block and parsed envelope, preserved as INELIGIBLE_FOR_ACTIVATION and UNCONSUMED",
            )
        )

    expected_r5_start = P7_RULING_THROUGH_R4_BYTES + 1
    if (
        len(r5_items) != 1
        or r5_items[0][1] != expected_r5_start
        or ruling_bytes[P7_RULING_THROUGH_R4_BYTES:expected_r5_start] != b"\n"
    ):
        issues.append(
            Issue(
                ruling_path,
                "P7 successor activation requires exactly one R-0005 immediately after the exact ruling-through-R-0004 anchor and one LF delimiter",
            )
        )

    r5_timestamp = None
    if r5 is None:
        issues.append(Issue(ruling_path, "P7 successor activation requires exactly one R-0005 pointer ruling; R-0004 has no pointer authority"))
    else:
        fields = r5.fields
        invalid_bindings = bool(r5.duplicate_fields) or any(
            _semantic_binding(fields.get(name)) != value
            for name, value in P7_R5_EXACT_BINDINGS.items()
        )
        basis = _semantic_binding(fields.get("basis"))
        invalid_bindings = invalid_bindings or P7_R5_APPROVAL_DIGEST not in basis
        invalid_bindings = invalid_bindings or any(ref not in basis for ref in P7_R5_BASIS_REFS)
        invalid_bindings = invalid_bindings or r5.timestamp != P7_R5_TIMESTAMP
        invalid_bindings = invalid_bindings or _ruling_envelope_digest(r5) != P7_R5_AUTHORIZATION_DIGEST
        if invalid_bindings:
            issues.append(
                Issue(
                    ruling_path,
                    "P7 R-0005 pointer ruling must match the exact R5-only activation bindings, approval digest, archived timestamp, and parsed envelope digest",
                )
            )

        r5_timestamp = _parse_timestamp(r5.timestamp)
        r4_timestamp = _parse_timestamp(P7_R4_TIMESTAMP)
        if r5_timestamp is None or r4_timestamp is None or r5_timestamp <= r4_timestamp:
            issues.append(Issue(ruling_path, "P7 R-0005 timestamp must be timezone-aware and strictly later than R-0004"))

    if r5 is not None and len(r5_items) == 1:
        expected_item = (
            f"## R-0005 | {r5.timestamp}\n"
            + "".join(
                f"- **{raw_name}**: {r5.fields.get(parsed_name, '')}\n"
                for raw_name, parsed_name in zip(P7_R5_FIELD_ORDER, P7_R5_PARSED_FIELD_ORDER)
            )
        ).encode("utf-8")
        r5_position = next(
            index for index, item in enumerate(ruling_items) if item[1] == r5_items[0][1]
        )
        r5_raw_text = r5_items[0][3].decode("utf-8")
        r5_nfc = all(
            unicodedata.normalize("NFC", value) == value
            for value in (
                getattr(r5, "identifier", ""),
                getattr(r5, "timestamp", ""),
                *r5.fields.keys(),
                *r5.fields.values(),
            )
        ) and unicodedata.normalize("NFC", r5_raw_text) == r5_raw_text
        has_successor = r5_position + 1 < len(ruling_items)
        successor_valid = True
        expected_raw_item = expected_item
        if has_successor:
            successor_valid = _p7_future_ruling_chain_valid(
                rulings,
                ruling_items,
                r5_position,
                r5,
            )
            expected_raw_item += b"\n"
        if (
            tuple(r5.fields) != P7_R5_PARSED_FIELD_ORDER
            or not r5_nfc
            or not successor_valid
            or r5_items[0][3] != expected_raw_item
        ):
            issues.append(
                Issue(
                    ruling_path,
                    "P7 R-0005 raw item must exactly match the frozen 67-field canonical rendering; a future unique aware ruling requires exactly one LF delimiter",
                )
            )

    r5_raw = ruling_bytes[
        P7_RULING_THROUGH_R5_BYTES - P7_R5_RAW_BYTES : P7_RULING_THROUGH_R5_BYTES
    ]
    if (
        len(ruling_bytes) < P7_RULING_THROUGH_R5_BYTES
        or _sha256_bytes(ruling_bytes[:P7_RULING_THROUGH_R5_BYTES]) != P7_RULING_THROUGH_R5_DIGEST
        or len(r5_raw) != P7_R5_RAW_BYTES
        or _sha256_bytes(r5_raw) != P7_R5_RAW_DIGEST
        or r5 is None
        or len(_ruling_envelope_bytes(r5)) != P7_R5_AUTHORIZATION_ENVELOPE_BYTES
        or _ruling_envelope_digest(r5) != P7_R5_AUTHORIZATION_DIGEST
    ):
        issues.append(
            Issue(
                ruling_path,
                "P7 R-0006 activation requires the exact immutable ruling-through-R-0005 raw and parsed lineage; R-0005 is consumed, failed, rolled back and non-reactivatable",
            )
        )

    expected_r6_start = P7_RULING_THROUGH_R5_BYTES + 1
    if (
        len(r6_items) != 1
        or r6_items[0][1] != expected_r6_start
        or ruling_bytes[P7_RULING_THROUGH_R5_BYTES:expected_r6_start] != b"\n"
    ):
        issues.append(
            Issue(
                ruling_path,
                "P7 successor activation requires exactly one R-0006 immediately after the exact ruling-through-R-0005 anchor and one LF delimiter; R-0005 has no remaining pointer authority",
            )
        )

    r6_timestamp = None
    if r6 is None:
        issues.append(
            Issue(
                ruling_path,
                "P7 successor activation requires exactly one R-0006 pointer ruling; R-0005 is consumed and cannot reactivate",
            )
        )
    else:
        fields = r6.fields
        invalid_bindings = bool(r6.duplicate_fields) or any(
            _semantic_binding(fields.get(name)) != value
            for name, value in P7_R6_EXACT_BINDINGS.items()
        )
        basis = _semantic_binding(fields.get("basis"))
        invalid_bindings = invalid_bindings or P7_R6_APPROVAL_DIGEST not in basis
        invalid_bindings = invalid_bindings or any(ref not in basis for ref in P7_R6_BASIS_REFS)
        invalid_bindings = invalid_bindings or r6.timestamp != P7_R6_TIMESTAMP
        invalid_bindings = invalid_bindings or _ruling_envelope_digest(r6) != P7_R6_AUTHORIZATION_DIGEST
        if invalid_bindings:
            issues.append(
                Issue(
                    ruling_path,
                    "P7 R-0006 pointer ruling must match the exact R6-only activation bindings, approval digest, archived timestamp, and parsed envelope digest",
                )
            )
        r6_timestamp = _parse_timestamp(r6.timestamp)
        observed_r5_timestamp = _parse_timestamp(P7_R5_TIMESTAMP)
        if (
            r6_timestamp is None
            or observed_r5_timestamp is None
            or r6_timestamp <= observed_r5_timestamp
        ):
            issues.append(Issue(ruling_path, "P7 R-0006 timestamp must be timezone-aware and strictly later than R-0005"))

    if r6 is not None and len(r6_items) == 1:
        expected_item = (
            f"## R-0006 | {r6.timestamp}\n"
            + "".join(
                f"- **{raw_name}**: {r6.fields.get(parsed_name, '')}\n"
                for raw_name, parsed_name in zip(P7_R6_FIELD_ORDER, P7_R6_PARSED_FIELD_ORDER)
            )
        ).encode("utf-8")
        r6_position = next(
            index for index, item in enumerate(ruling_items) if item[1] == r6_items[0][1]
        )
        r6_raw_text = r6_items[0][3].decode("utf-8")
        r6_nfc = all(
            unicodedata.normalize("NFC", value) == value
            for value in (
                getattr(r6, "identifier", ""),
                getattr(r6, "timestamp", ""),
                *r6.fields.keys(),
                *r6.fields.values(),
            )
        ) and unicodedata.normalize("NFC", r6_raw_text) == r6_raw_text
        has_successor = r6_position + 1 < len(ruling_items)
        successor_valid = True
        expected_raw_item = expected_item
        if has_successor:
            successor_valid = _p7_future_ruling_chain_valid(
                rulings,
                ruling_items,
                r6_position,
                r6,
            )
            expected_raw_item += b"\n"
        if (
            tuple(r6.fields) != P7_R6_PARSED_FIELD_ORDER
            or not r6_nfc
            or not successor_valid
            or r6_items[0][3] != expected_raw_item
        ):
            issues.append(
                Issue(
                    ruling_path,
                    "P7 R-0006 raw item must exactly match the frozen 82-field canonical rendering; future rulings begin at R-0007 and require exactly one LF delimiter",
                )
            )

    try:
        case_text = case_index_path.read_text(encoding="utf-8")
        metadata, duplicate_fields = _frontmatter(case_text)
    except (OSError, UnicodeError) as error:
        issues.append(Issue(case_index_path, f"P7 successor activation cannot read case index: {error}"))
    else:
        pointer_line = f"{RECORD_MANIFEST_FIELD}: {P7_SUCCESSOR_MANIFEST_REF}"
        lines = case_text.splitlines()
        protocol_positions = [index for index, line in enumerate(lines) if line == "boundary_protocol: v1"]
        pointer_positions = [index for index, line in enumerate(lines) if line == pointer_line]
        exact_placement = (
            len(protocol_positions) == 1
            and len(pointer_positions) == 1
            and pointer_positions[0] == protocol_positions[0] + 1
        )
        if metadata.get("case_id") != P7_CASE_ID or metadata.get("boundary_protocol") != "v1":
            issues.append(Issue(case_index_path, "P7 ongoing case admission requires exact case_id and boundary_protocol v1"))
        if not exact_placement:
            issues.append(
                Issue(
                    case_index_path,
                    "P7 successor manifest pointer must be one exact frontmatter line immediately after boundary_protocol: v1",
                )
            )
        if any(
            field in duplicate_fields
            for field in ("case_id", "boundary_protocol", RECORD_MANIFEST_FIELD, "updated_at")
        ):
            issues.append(Issue(case_index_path, "P7 successor activation rejects duplicate persistent admission frontmatter fields"))
        case_timestamp = _parse_timestamp(metadata.get("updated_at"))
        if case_timestamp is None or r6_timestamp is None or case_timestamp <= r6_timestamp:
            issues.append(Issue(case_index_path, "P7 case updated_at must be timezone-aware and strictly later than R-0006"))

    for label, value, expected_bytes, expected_digest in (
        (
            "preserved through S-0052",
            preserved_bytes,
            P7_PRESERVED_THROUGH_S0052_BYTES,
            P7_PRESERVED_THROUGH_S0052_DIGEST,
        ),
        (
            "canonical through S-0052",
            canonical_bytes,
            P7_CANONICAL_THROUGH_S0052_BYTES,
            P7_CANONICAL_THROUGH_S0052_DIGEST,
        ),
    ):
        if len(value) != expected_bytes or _sha256_bytes(value) != expected_digest:
            issues.append(Issue(record_path, f"P7 successor activation requires exact {label} bytes"))

    preserved_items = _byte_items(preserved_bytes, EVENT_HEADING_BYTES_RE)
    canonical_items = _byte_items(canonical_bytes, EVENT_HEADING_BYTES_RE)
    live_items = _byte_items(live_bytes, EVENT_HEADING_BYTES_RE)
    for event_id in ("S-0051", "S-0052"):
        expected_bytes, expected_digest = P7_EVENT_BINDINGS[event_id]
        for label, items in (("preserved", preserved_items), ("canonical", canonical_items)):
            item = _one_byte_item(items, event_id)
            if item is None or len(item[3]) != expected_bytes or _sha256_bytes(item[3]) != expected_digest:
                issues.append(Issue(record_path, f"P7 {label} lineage must preserve exact {event_id} full event bytes"))

    for event_id in P7_EVENT_BINDINGS:
        if len([item for item in live_items if item[0] == event_id]) != 1:
            issues.append(Issue(record_path, f"P7 successor activation requires exactly one live {event_id}"))

    suffix = live_bytes[P7_PRESERVED_THROUGH_S0052_BYTES :]
    strict_suffix = _p7_strict_record_suffix(suffix)
    if strict_suffix is None:
        issues.append(
            Issue(
                record_path,
                "P7 successor record suffix must be fully consumed as strict NFC/LF S events with pure-LF delimiters, increasing unique IDs/timestamps, exact common envelopes, exact fields/eligible canonical JSON, and frozen-parser-equivalent projections",
            )
        )
        suffix_items: list[tuple[str, str, int, int, bytes, bytes]] = []
        suffix_events: list[object] = []
    else:
        suffix_items, suffix_events = strict_suffix

    expected_s0053_bytes, expected_s0053_digest = P7_EVENT_BINDINGS["S-0053"]
    s0053_item = suffix_items[0] if suffix_items else None
    if (
        s0053_item is None
        or s0053_item[0] != "S-0053"
        or s0053_item[1] != P7_S0053_TIMESTAMP
        or s0053_item[2] != 0
        or len(s0053_item[4]) != expected_s0053_bytes
        or _sha256_bytes(s0053_item[4]) != expected_s0053_digest
    ):
        issues.append(
            Issue(
                record_path,
                "P7 successor activation requires exact standalone S-0053 as the unique first post-cutoff event; delimiter bytes are excluded from its raw hash",
            )
        )

    s0054_item = suffix_items[1] if len(suffix_items) > 1 else None
    s0054_event = suffix_events[1] if len(suffix_events) > 1 else None
    if (
        s0054_item is None
        or s0054_item[0] != "S-0054"
        or s0054_item[1] != P7_S0054_TIMESTAMP
        or len(s0054_item[4]) != P7_S0054_RAW_BYTES
        or _sha256_bytes(s0054_item[4]) != P7_S0054_RAW_DIGEST
        or s0054_event is None
        or len(_ruling_envelope_bytes(s0054_event)) != P7_S0054_AUTHORIZATION_ENVELOPE_BYTES
        or _ruling_envelope_digest(s0054_event) != P7_S0054_AUTHORIZATION_DIGEST
    ):
        issues.append(
            Issue(
                record_path,
                "P7 successor activation requires exact standalone S-0054 raw bytes, aware timestamp, and parsed envelope as the first successor after S-0053",
            )
        )

    candidates = [
        event
        for event in suffix_events
        if getattr(event, "fields", {}).get("notice kind")
        == "RECORD_ERRATA_ACTIVATION_CANDIDATE"
    ]
    if len(candidates) != 1 or getattr(candidates[0], "identifier", None) != "S-0053":
        issues.append(
            Issue(
                record_path,
                "P7 successor activation requires one exact S-0053 candidate notice and never falls back to S-0051",
            )
        )

    if (
        len(live_bytes) < P7_POST_S0053_RECORD_BYTES
        or _sha256_bytes(live_bytes[:P7_POST_S0053_RECORD_BYTES]) != P7_POST_S0053_RECORD_DIGEST
    ):
        issues.append(Issue(record_path, "P7 successor activation requires the exact post-S-0053 live record anchor"))
    composed = canonical_bytes + suffix
    if (
        len(composed) < P7_POST_S0053_COMPOSED_BYTES
        or _sha256_bytes(composed[:P7_POST_S0053_COMPOSED_BYTES]) != P7_POST_S0053_COMPOSED_DIGEST
    ):
        issues.append(Issue(record_path, "P7 successor activation requires the exact post-S-0053 composed record anchor"))
    if (
        len(live_bytes) < P7_POST_S0054_RECORD_BYTES
        or _sha256_bytes(live_bytes[:P7_POST_S0054_RECORD_BYTES]) != P7_POST_S0054_RECORD_DIGEST
    ):
        issues.append(Issue(record_path, "P7 successor activation requires the exact post-S-0054 live record anchor"))
    if (
        len(composed) < P7_POST_S0054_COMPOSED_BYTES
        or _sha256_bytes(composed[:P7_POST_S0054_COMPOSED_BYTES]) != P7_POST_S0054_COMPOSED_DIGEST
    ):
        issues.append(Issue(record_path, "P7 successor activation requires the exact post-S-0054 composed record anchor"))
    return len(issues) == start


def _resolve_record_overlay(case_path: Path) -> tuple[bytes | None, Path | None, list[Issue]]:
    issues: list[Issue] = []
    case_index_path = case_path / "case.md"
    if not case_index_path.is_file():
        return None, None, issues
    try:
        case_text = case_index_path.read_text(encoding="utf-8")
        metadata, duplicate_fields = _frontmatter(case_text)
    except (OSError, UnicodeError) as error:
        issues.append(Issue(case_index_path, f"record errata cannot read case index: {error}"))
        return None, None, issues
    if RECORD_MANIFEST_FIELD in duplicate_fields:
        issues.append(Issue(case_index_path, f"duplicate {RECORD_MANIFEST_FIELD} is not allowed"))
        return None, None, issues
    manifest_ref = metadata.get(RECORD_MANIFEST_FIELD)
    if not manifest_ref:
        if (
            (case_path.name == P7_CASE_ID or metadata.get("case_id") == P7_CASE_ID)
            and f"{RECORD_MANIFEST_FIELD}:" in case_text
        ):
            issues.append(
                Issue(
                    case_index_path,
                    "P7 record errata pointer text outside the unique frontmatter field/placement is an invalid admission, not pointer absence",
                )
            )
        return None, None, issues

    manifest_path = _local_non_symlink_path(case_path, manifest_ref)
    if manifest_path is None:
        issues.append(Issue(case_index_path, f"{RECORD_MANIFEST_FIELD} must be a local non-symlink case-relative path"))
        return None, None, issues
    if not _regular_file(manifest_path):
        issues.append(Issue(manifest_path, "record errata manifest must be a local non-symlink regular file"))
        return None, None, issues
    manifest = _read_manifest(manifest_path, issues, label="record errata")
    if manifest is None:
        return None, None, issues
    case_id = metadata.get("case_id", "")
    if not _validate_record_manifest_shape(manifest, manifest_path, case_id, issues):
        return None, None, issues
    if case_id == P7_CASE_ID:
        manifest_name = str(manifest_ref)
        if manifest_name not in {
            P7_PREDECESSOR_MANIFEST_REF,
            P7_SUCCESSOR_MANIFEST_REF,
        }:
            issues.append(Issue(case_index_path, "P7 record errata pointer must use one closed lineage manifest name"))
            return None, None, issues
        if _p7_predecessor_pointer_blocked(case_path, manifest_name, issues):
            return None, None, issues

    path_fields = {
        "live": manifest.get("live_path"),
        "preserved": manifest.get("preserved_prefix_path"),
        "canonical": manifest.get("canonical_prefix_path"),
    }
    paths = {
        label: _local_non_symlink_path(case_path, value)
        for label, value in path_fields.items()
    }
    for label, path in paths.items():
        if path is None or not _regular_file(path):
            issues.append(
                Issue(
                    path or manifest_path,
                    f"record errata {label} path must be a local non-symlink regular file",
                )
            )
    if issues:
        return None, paths.get("live"), issues
    live_path = paths["live"]
    preserved_path = paths["preserved"]
    canonical_path = paths["canonical"]
    assert live_path is not None and preserved_path is not None and canonical_path is not None
    path_pairs = (
        (live_path, preserved_path),
        (live_path, canonical_path),
        (preserved_path, canonical_path),
    )
    if any(_same_file(left, right) for left, right in path_pairs):
        issues.append(Issue(manifest_path, "record errata live, preserved, and canonical inputs must be distinct regular files"))
        return None, live_path, issues

    try:
        live_bytes = live_path.read_bytes()
        preserved_bytes = preserved_path.read_bytes()
        canonical_bytes = canonical_path.read_bytes()
    except OSError as error:
        issues.append(Issue(manifest_path, f"record errata inputs cannot be read: {error}"))
        return None, live_path, issues
    prefix_bytes = int(manifest["preserved_prefix_bytes"])
    if len(preserved_bytes) != prefix_bytes:
        issues.append(Issue(preserved_path, "record errata preserved prefix byte length mismatch"))
    if _sha256_bytes(preserved_bytes) != manifest["preserved_prefix_sha256"]:
        issues.append(Issue(preserved_path, "record errata preserved prefix SHA-256 mismatch"))
    if _sha256_bytes(canonical_bytes) != manifest["canonical_prefix_sha256"]:
        issues.append(Issue(canonical_path, "record errata canonical prefix SHA-256 mismatch"))
    if len(live_bytes) < prefix_bytes or live_bytes[:prefix_bytes] != preserved_bytes:
        issues.append(Issue(live_path, "record errata live record prefix does not match the preserved bytes"))
    if issues:
        return None, live_path, issues

    _reconstruct_record_prefix(
        preserved_bytes,
        canonical_bytes,
        manifest,
        manifest_path,
        issues,
    )
    ruling, manifest_digest = _record_ruling_authorized(
        case_path,
        str(manifest_ref),
        manifest_path,
        manifest,
        issues,
    )
    suffix = live_bytes[prefix_bytes:]
    if case_id == P7_CASE_ID and str(manifest_ref) == P7_SUCCESSOR_MANIFEST_REF:
        _p7_successor_activation_valid(
            case_path,
            str(manifest_ref),
            manifest_digest,
            preserved_bytes,
            canonical_bytes,
            live_bytes,
            issues,
        )
    else:
        _activation_notice_valid(
            suffix,
            str(manifest_ref),
            manifest,
            manifest_digest,
            ruling,
            live_path,
            issues,
        )
    if issues:
        return None, live_path, issues
    return canonical_bytes + suffix, live_path, issues


def lint_case(path: str | Path, *, phase: str = "ruling") -> list[Issue]:
    requested = Path(path)
    case_path = requested.parent if requested.name == "proposal.md" else requested
    snapshot, proposal_issues = _resolve_snapshot(case_path)
    composed_record, live_record, record_issues = _resolve_record_overlay(case_path)
    issues = proposal_issues + record_issues
    if issues:
        return issues
    if snapshot is None and composed_record is None:
        return _lint_case(case_path, phase=phase)
    with tempfile.TemporaryDirectory(prefix="quorum-case-overlay-") as directory:
        isolated = Path(directory) / case_path.name
        shutil.copytree(case_path, isolated)
        if snapshot is not None:
            shutil.copyfile(snapshot, isolated / "proposal.md")
        if composed_record is not None:
            (isolated / "record.md").write_bytes(composed_record)
        isolated_issues = _lint_case(isolated, phase=phase)
        mapped: list[Issue] = []
        for issue in isolated_issues:
            try:
                relative = issue.path.relative_to(isolated)
            except ValueError:
                mapped.append(issue)
                continue
            if relative == Path("proposal.md") and snapshot is not None:
                mapped_path = snapshot
            elif relative == Path("record.md") and live_record is not None:
                mapped_path = live_record
            else:
                mapped_path = case_path / relative
            mapped.append(Issue(mapped_path, issue.message))
        return mapped
