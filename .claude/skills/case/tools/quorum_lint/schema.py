"""Executable projection of boundary protocol v1.

The normative source remains ``docs/quorum/``.  These constants describe the
normalized in-memory shape used by the reference linter; they are not a
persistent case manifest and do not supersede the Markdown protocol.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class ProtocolSchema:
    version: str
    boundary_fields: tuple[str, ...]
    sequence_fields: tuple[str, ...]
    sequence_cells: tuple[str, ...]
    admission_policies: frozenset[str]
    acceptance_statuses: frozenset[str]


BOUNDARY_V1 = ProtocolSchema(
    version="v1",
    boundary_fields=(
        "producer",
        "producer owner",
        "consumer",
        "consumer owner",
        "canonical representation",
        "consumer projection",
        "admission policy",
        "admission details",
        "unknown input behavior",
        "failure semantics",
        "identity/version binding",
        "producer owner confirmation",
        "consumer owner confirmation",
        "positive acceptance",
        "negative acceptance",
    ),
    sequence_fields=(
        "owner",
        "owner confirmation",
        "identity key",
        "initial state",
        "ordered events",
        "expected observations",
        "persistence boundary",
        "boundary contracts",
        "positive acceptance",
        "negative acceptance",
    ),
    sequence_cells=(
        "first use",
        "repeat",
        "retry",
        "resume",
        "restart",
        "reset",
        "rollback",
    ),
    admission_policies=frozenset({"CLOSED", "OPEN", "VERSIONED"}),
    acceptance_statuses=frozenset({"PASS", "FAIL", "NOT_RUN", "PENDING"}),
)
