"""Thin PuPu host adapter for Unchain-owned Context/Memory V2 deletion.

The host resolves immutable lifecycle rows into one exact Unchain deletion
scope.  Unchain owns the transaction, tombstone, resurrection guards, and
durable receipt.  PuPu never performs CAS garbage collection in this path.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2OwnershipError,
    list_pupu_unchain_ownership_lifecycles,
)
from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    inspect_context_v2_database,
)


_MAX_LIFECYCLES = 10_000
_ADMISSION_TABLES = (
    "pupu_context_v2_admission_operations",
    "pupu_context_v2_admissions",
)
_RETAINED_SCOPE_TABLES = {
    "pupu_unchain_ownership_schema": (),
    "pupu_unchain_ownership_bindings": (
        "owner_chat_id",
        "execution_id",
        "binding_id",
        "chat_space_id",
    ),
}
_RETAINED_OWNER_CHILD_TABLES = {
    "pupu_unchain_ownership_operations": (
        "pupu_unchain_ownership_bindings",
        "lifecycle_key",
    ),
}
_DIRECT_OWNER_COLUMNS = ("owner_chat_id", "source_owner_chat_id")
_NO_STORE_RECEIPT_SCHEMA = "pupu.context_v2_no_store_chat_deletion.v1"


class PupuUnchainChatDeletionError(RuntimeError):
    """The host could not prove or transactionally delete one exact chat."""

    def __init__(
        self,
        message: str,
        *,
        code: str = "context_v2_unchain_delete_failed",
        status_code: int = 503,
        retryable: bool = True,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.retryable = retryable


def _result_dict(receipt: Any) -> dict[str, Any]:
    return {
        "schema": "pupu.unchain_chat_deletion.v1",
        "deleted": True,
        "owner_chat_id": receipt.owner_chat_id,
        "tombstone_revision": receipt.tombstone_revision,
        "replayed": receipt.replayed,
        "deleted_rows": dict(receipt.deleted_rows),
        "gc_status": "pending_unreferenced_scan",
    }


def _no_store_result(owner_chat_id: str) -> dict[str, Any]:
    return {
        "schema": _NO_STORE_RECEIPT_SCHEMA,
        "deleted": True,
        "owner_chat_id": owner_chat_id,
        "outcome": "not_present",
    }


def _canonical_request_identifiers(
    *,
    owner_chat_id: str,
    operation_id: str,
) -> tuple[str, str]:
    """Use Core's identifier boundary before accepting a no-store delete."""

    try:
        from unchain.persistence.sqlite_chat_deletion_v2 import ChatDeletionScope
    except ImportError as error:
        raise PupuUnchainChatDeletionError(
            "durable Unchain deletion support is unavailable",
            code="context_v2_unchain_delete_unavailable",
        ) from error

    try:
        owner = ChatDeletionScope(owner_chat_id=owner_chat_id).owner_chat_id
        operation = ChatDeletionScope(owner_chat_id=operation_id).owner_chat_id
    except (TypeError, ValueError) as error:
        raise PupuUnchainChatDeletionError(
            "Unchain chat deletion request is invalid",
            code="context_v2_invalid_request",
            status_code=400,
            retryable=False,
        ) from error
    return owner, operation


def _is_no_store(database_path: Path) -> bool:
    """Classify only the harmless no-state cases before Core opens SQLite."""

    try:
        inspection = inspect_context_v2_database(database_path)
    except ContextV2StoreBoundaryError as error:
        raise PupuUnchainChatDeletionError(
            "durable Unchain deletion schema is unavailable",
            code=error.code,
            retryable=False,
        ) from error
    if inspection.schema_family in {"absent", "blank"}:
        return True
    if inspection.schema_family == STORE_OWNER_UNCHAIN:
        return False
    code = (
        "context_v2_store_owner_conflict"
        if inspection.schema_family == "pupu_legacy"
        else "context_v2_store_schema_incompatible"
    )
    raise PupuUnchainChatDeletionError(
        "durable Unchain deletion schema is not safely owned",
        code=code,
        retryable=False,
    )


def _quoted_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _sqlite_tables(database_path: Path) -> frozenset[str]:
    try:
        with sqlite3.connect(database_path) as connection:
            return frozenset(
                str(row[0])
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            )
    except sqlite3.Error as error:
        raise PupuUnchainChatDeletionError(
            "durable Unchain deletion schema is unavailable"
        ) from error


def _owner_scoped_deletion_tables(database_path: Path) -> tuple[str, ...]:
    tables = _sqlite_tables(database_path)
    present = frozenset(_ADMISSION_TABLES) & tables
    if present and present != frozenset(_ADMISSION_TABLES):
        raise PupuUnchainChatDeletionError(
            "durable admission deletion schema is incomplete"
        )
    return _ADMISSION_TABLES if present else ()


def _direct_owner_evidence(
    *,
    database_path: Path,
    owner_chat_id: str,
) -> tuple[str, ...]:
    """Return every directly attributable row before accepting an empty scope."""

    try:
        with sqlite3.connect(database_path) as connection:
            evidence: list[str] = []
            for table_name in sorted(_sqlite_tables(database_path)):
                quoted_table = _quoted_identifier(table_name)
                columns = {
                    str(row[1])
                    for row in connection.execute(
                        f"PRAGMA table_info({quoted_table})"
                    )
                }
                for column_name in _DIRECT_OWNER_COLUMNS:
                    if column_name not in columns:
                        continue
                    quoted_column = _quoted_identifier(column_name)
                    row = connection.execute(
                        f"SELECT 1 FROM {quoted_table} "
                        f"WHERE {quoted_column} = ? LIMIT 1",
                        (owner_chat_id,),
                    ).fetchone()
                    if row is not None:
                        evidence.append(f"{table_name}.{column_name}")
            return tuple(evidence)
    except sqlite3.Error as error:
        raise PupuUnchainChatDeletionError(
            "durable Unchain owner evidence is unavailable"
        ) from error


def _resolve_scope(*, database_path: Path, owner_chat_id: str):
    from unchain.persistence.sqlite_chat_deletion_v2 import (
        ChatDeletionScope,
        read_chat_deletion_tombstone,
    )

    tombstone = read_chat_deletion_tombstone(
        database_path=database_path,
        owner_chat_id=owner_chat_id,
    )
    if tombstone is not None:
        return tombstone.scope
    lifecycles = list_pupu_unchain_ownership_lifecycles(
        database_path=database_path,
        owner_chat_id=owner_chat_id,
        limit=_MAX_LIFECYCLES,
    )
    if not lifecycles:
        evidence = _direct_owner_evidence(
            database_path=database_path,
            owner_chat_id=owner_chat_id,
        )
        if evidence:
            raise PupuUnchainChatDeletionError(
                "durable Unchain ownership lifecycle is unavailable while owner "
                "evidence remains: " + ", ".join(evidence)
            )
        return ChatDeletionScope(owner_chat_id=owner_chat_id)
    if len(lifecycles) >= _MAX_LIFECYCLES:
        raise PupuUnchainChatDeletionError(
            "durable Unchain ownership lifecycle scope exceeds the P0 limit"
        )
    return ChatDeletionScope(
        owner_chat_id=owner_chat_id,
        execution_ids=tuple(
            sorted({lifecycle.execution_id for lifecycle in lifecycles})
        ),
        space_ids=tuple(sorted({lifecycle.chat_space_id for lifecycle in lifecycles})),
        binding_ids=tuple(sorted({lifecycle.binding_id for lifecycle in lifecycles})),
    )


def delete_pupu_unchain_chat(
    *,
    database_path: str | Path,
    owner_chat_id: str,
    operation_id: str,
) -> dict[str, Any]:
    """Resolve lifecycle ownership and execute Unchain's atomic deletion."""

    from unchain.persistence.sqlite_chat_deletion_v2 import (
        ChatDeletionError,
        SQLiteChatDeletionV2Service,
    )

    owner, operation = _canonical_request_identifiers(
        owner_chat_id=owner_chat_id,
        operation_id=operation_id,
    )
    path = Path(database_path).expanduser().resolve()
    if _is_no_store(path):
        return _no_store_result(owner)
    try:
        scope = _resolve_scope(
            database_path=path,
            owner_chat_id=owner,
        )
        receipt = SQLiteChatDeletionV2Service(
            database_path=path,
            retained_scope_tables=_RETAINED_SCOPE_TABLES,
            retained_owner_child_tables=_RETAINED_OWNER_CHILD_TABLES,
            owner_scoped_deletion_tables=_owner_scoped_deletion_tables(path),
        ).delete_chat(
            scope=scope,
            operation_id=operation,
        )
        return _result_dict(receipt)
    except PupuUnchainChatDeletionError:
        raise
    except ContextV2StoreBoundaryError as error:
        raise PupuUnchainChatDeletionError(
            "durable Unchain deletion schema is unavailable",
            code=error.code,
            retryable=False,
        ) from error
    except (ChatDeletionError, PupuUnchainMemoryV2OwnershipError) as error:
        raise PupuUnchainChatDeletionError(
            f"Unchain chat deletion scope or durable state is unavailable: {error}"
        ) from error
    except (TypeError, ValueError) as error:
        raise PupuUnchainChatDeletionError(
            f"Unchain chat deletion request is invalid: {error}",
            code="context_v2_invalid_request",
            status_code=400,
            retryable=False,
        ) from error


def read_pupu_unchain_chat_deletion(
    *,
    database_path: str | Path,
    owner_chat_id: str,
) -> dict[str, Any] | None:
    """Cold-read the verified Unchain tombstone for outbox recovery."""

    from unchain.persistence.sqlite_chat_deletion_v2 import (
        ChatDeletionError,
        read_chat_deletion_tombstone,
    )

    try:
        tombstone = read_chat_deletion_tombstone(
            database_path=database_path,
            owner_chat_id=owner_chat_id,
        )
        if tombstone is None:
            return None
        return _result_dict(tombstone.receipt)
    except (ChatDeletionError, TypeError, ValueError) as error:
        raise PupuUnchainChatDeletionError(
            f"Unchain chat deletion receipt is unavailable: {error}"
        ) from error


__all__ = [
    "PupuUnchainChatDeletionError",
    "delete_pupu_unchain_chat",
    "read_pupu_unchain_chat_deletion",
]
