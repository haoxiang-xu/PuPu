"""Default-closed PuPu attachment for Unchain-owned Context/Memory V2.

This module is the product-host seam only.  It verifies and joins the official
Unchain ContextModule, semantic projector, artifact/handoff adapter, SQLite
normal-memory attachment factory, and SQLite consolidation factory.  It does
not mount any module into a running Agent: the P0 production gate remains
closed and shadow preparation has no model/tool surface.

The lifecycle relationship needed by later chat deletion is persisted in the
same ``context_v2.sqlite3`` database before a prepared attachment is returned.
"""

from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping


_LIFECYCLE_SCHEMA = "pupu.unchain_memory_v2_lifecycle.v1"
_LIFECYCLE_TABLE_VERSION = 1
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$")
class PupuUnchainMemoryV2OwnershipError(RuntimeError):
    """One host-owned lifecycle or Unchain component changed scope."""


def _identifier(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise TypeError(f"{field_name} must be text")
    normalized = value.strip()
    if _IDENTIFIER_RE.fullmatch(normalized) is None:
        raise ValueError(f"{field_name} is invalid")
    return normalized


def _exact_non_negative_integer(value: object, field_name: str) -> int:
    if type(value) is not int or value < 0:
        raise TypeError(f"{field_name} must be a non-negative integer")
    return value


def _canonical_json_bytes(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


@dataclass(frozen=True, slots=True)
class PupuUnchainMemoryV2Lifecycle:
    """Exact deletion/recovery mapping for one immutable attempt binding."""

    owner_chat_id: str
    execution_id: str
    generation_id: str
    attempt_id: str
    root_run_id: str
    binding_id: str
    chat_space_id: str

    def __post_init__(self) -> None:
        for field_name in (
            "owner_chat_id",
            "execution_id",
            "generation_id",
            "attempt_id",
            "root_run_id",
            "binding_id",
            "chat_space_id",
        ):
            object.__setattr__(
                self,
                field_name,
                _identifier(getattr(self, field_name), field_name),
            )

    @property
    def session_id(self) -> str:
        return self.execution_id

    @property
    def lifecycle_key(self) -> str:
        identity = "\0".join(
            (
                self.owner_chat_id,
                self.execution_id,
                self.generation_id,
                self.attempt_id,
            )
        )
        return "ownership-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict[str, str]:
        return {
            "owner_chat_id": self.owner_chat_id,
            "execution_id": self.execution_id,
            "session_id": self.session_id,
            "generation_id": self.generation_id,
            "attempt_id": self.attempt_id,
            "root_run_id": self.root_run_id,
            "binding_id": self.binding_id,
            "chat_space_id": self.chat_space_id,
        }

    def _durable_dict(self) -> dict[str, str]:
        return {
            "schema": _LIFECYCLE_SCHEMA,
            **self.to_dict(),
        }

    @classmethod
    def _from_durable_dict(
        cls,
        value: Mapping[str, Any],
    ) -> PupuUnchainMemoryV2Lifecycle:
        raw = dict(value)
        if raw.pop("schema", None) != _LIFECYCLE_SCHEMA:
            raise PupuUnchainMemoryV2OwnershipError("lifecycle schema is unsupported")
        session_id = raw.pop("session_id", None)
        expected = {
            "owner_chat_id",
            "execution_id",
            "generation_id",
            "attempt_id",
            "root_run_id",
            "binding_id",
            "chat_space_id",
        }
        if set(raw) != expected or session_id != raw.get("execution_id"):
            raise PupuUnchainMemoryV2OwnershipError("lifecycle record shape changed")
        try:
            return cls(**raw)
        except (TypeError, ValueError) as error:
            raise PupuUnchainMemoryV2OwnershipError(
                "lifecycle record is invalid"
            ) from error


@dataclass(frozen=True, slots=True)
class _LifecycleReceipt:
    lifecycle: PupuUnchainMemoryV2Lifecycle
    revision: int
    replayed: bool


def _connect(database_path: Path) -> sqlite3.Connection:
    from memory_v2_store_boundary import (
        STORE_OWNER_UNCHAIN,
        admit_context_v2_store_owner,
    )

    resolved = database_path.expanduser().resolve()
    admission = admit_context_v2_store_owner(
        root_dir=resolved.parent,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    if admission.database_path != resolved:
        raise PupuUnchainMemoryV2OwnershipError(
            "single-store admission returned a different database path"
        )
    connection = sqlite3.connect(
        resolved,
        timeout=30.0,
        isolation_level=None,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA synchronous = FULL")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def _initialize_lifecycle_schema(database_path: Path) -> None:
    connection = _connect(database_path)
    try:
        mode = connection.execute("PRAGMA journal_mode = WAL").fetchone()[0]
        if str(mode).casefold() != "wal":
            raise PupuUnchainMemoryV2OwnershipError("sqlite WAL is unavailable")
        connection.executescript(
            """
            BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS pupu_unchain_ownership_schema (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT OR IGNORE INTO pupu_unchain_ownership_schema(version)
            VALUES (1);

            CREATE TABLE IF NOT EXISTS pupu_unchain_ownership_bindings (
                lifecycle_key TEXT PRIMARY KEY,
                owner_chat_id TEXT NOT NULL,
                execution_id TEXT NOT NULL,
                generation_id TEXT NOT NULL,
                attempt_id TEXT NOT NULL,
                binding_id TEXT NOT NULL,
                chat_space_id TEXT NOT NULL,
                revision INTEGER NOT NULL CHECK(revision = 1),
                lifecycle_json BLOB NOT NULL,
                lifecycle_sha256 TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(owner_chat_id, execution_id, generation_id, attempt_id)
            );
            CREATE INDEX IF NOT EXISTS idx_pupu_unchain_ownership_owner
            ON pupu_unchain_ownership_bindings(
                owner_chat_id, execution_id, generation_id, attempt_id
            );

            CREATE TABLE IF NOT EXISTS pupu_unchain_ownership_operations (
                lifecycle_key TEXT NOT NULL,
                operation_id TEXT NOT NULL,
                payload_sha256 TEXT NOT NULL,
                expected_revision INTEGER NOT NULL CHECK(expected_revision >= 0),
                resulting_revision INTEGER NOT NULL CHECK(resulting_revision = 1),
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY(lifecycle_key, operation_id),
                FOREIGN KEY(lifecycle_key)
                    REFERENCES pupu_unchain_ownership_bindings(lifecycle_key)
            );
            COMMIT;
            """
        )
        versions = {
            int(row[0])
            for row in connection.execute(
                "SELECT version FROM pupu_unchain_ownership_schema"
            )
        }
        if versions != {_LIFECYCLE_TABLE_VERSION}:
            raise PupuUnchainMemoryV2OwnershipError(
                "lifecycle schema version is unsupported"
            )
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


def _decode_lifecycle_row(row: sqlite3.Row) -> PupuUnchainMemoryV2Lifecycle:
    try:
        encoded = bytes(row["lifecycle_json"])
    except (TypeError, ValueError) as error:
        raise PupuUnchainMemoryV2OwnershipError(
            "lifecycle record bytes are invalid"
        ) from error
    if _sha256(encoded) != row["lifecycle_sha256"]:
        raise PupuUnchainMemoryV2OwnershipError("lifecycle record digest changed")
    try:
        decoded = json.loads(encoded.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise PupuUnchainMemoryV2OwnershipError(
            "lifecycle record is not valid JSON"
        ) from error
    if not isinstance(decoded, Mapping) or _canonical_json_bytes(decoded) != encoded:
        raise PupuUnchainMemoryV2OwnershipError("lifecycle record is not canonical")
    lifecycle = PupuUnchainMemoryV2Lifecycle._from_durable_dict(decoded)
    if (
        row["lifecycle_key"] != lifecycle.lifecycle_key
        or row["owner_chat_id"] != lifecycle.owner_chat_id
        or row["execution_id"] != lifecycle.execution_id
        or row["generation_id"] != lifecycle.generation_id
        or row["attempt_id"] != lifecycle.attempt_id
        or row["binding_id"] != lifecycle.binding_id
        or row["chat_space_id"] != lifecycle.chat_space_id
        or int(row["revision"]) != 1
    ):
        raise PupuUnchainMemoryV2OwnershipError("lifecycle indexed fields changed")
    return lifecycle


def _persist_lifecycle(
    *,
    database_path: Path,
    lifecycle: PupuUnchainMemoryV2Lifecycle,
    operation_id: str,
    expected_revision: int,
) -> _LifecycleReceipt:
    normalized_operation = _identifier(operation_id, "operation_id")
    expected = _exact_non_negative_integer(
        expected_revision,
        "expected_revision",
    )
    encoded = _canonical_json_bytes(lifecycle._durable_dict())
    digest = _sha256(encoded)
    key = lifecycle.lifecycle_key
    connection = _connect(database_path)
    try:
        connection.execute("BEGIN IMMEDIATE")
        operation = connection.execute(
            """
            SELECT payload_sha256, expected_revision, resulting_revision
            FROM pupu_unchain_ownership_operations
            WHERE lifecycle_key = ? AND operation_id = ?
            """,
            (key, normalized_operation),
        ).fetchone()
        if operation is not None:
            if (
                operation["payload_sha256"] != digest
                or int(operation["expected_revision"]) != expected
                or int(operation["resulting_revision"]) != 1
            ):
                raise PupuUnchainMemoryV2OwnershipError(
                    "lifecycle operation payload changed"
                )
            row = connection.execute(
                "SELECT * FROM pupu_unchain_ownership_bindings "
                "WHERE lifecycle_key = ?",
                (key,),
            ).fetchone()
            if row is None or _decode_lifecycle_row(row) != lifecycle:
                raise PupuUnchainMemoryV2OwnershipError(
                    "lifecycle operation has no exact binding"
                )
            connection.commit()
            return _LifecycleReceipt(lifecycle, 1, True)

        row = connection.execute(
            "SELECT * FROM pupu_unchain_ownership_bindings " "WHERE lifecycle_key = ?",
            (key,),
        ).fetchone()
        if row is not None:
            _decode_lifecycle_row(row)
            raise PupuUnchainMemoryV2OwnershipError(
                "lifecycle expected revision changed"
            )
        if expected != 0:
            raise PupuUnchainMemoryV2OwnershipError(
                "new lifecycle expected revision must be zero"
            )
        connection.execute(
            """
            INSERT INTO pupu_unchain_ownership_bindings(
                lifecycle_key, owner_chat_id, execution_id, generation_id,
                attempt_id, binding_id, chat_space_id, revision,
                lifecycle_json, lifecycle_sha256
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                key,
                lifecycle.owner_chat_id,
                lifecycle.execution_id,
                lifecycle.generation_id,
                lifecycle.attempt_id,
                lifecycle.binding_id,
                lifecycle.chat_space_id,
                encoded,
                digest,
            ),
        )
        connection.execute(
            """
            INSERT INTO pupu_unchain_ownership_operations(
                lifecycle_key, operation_id, payload_sha256,
                expected_revision, resulting_revision
            ) VALUES (?, ?, ?, ?, 1)
            """,
            (key, normalized_operation, digest, expected),
        )
        connection.commit()
        return _LifecycleReceipt(lifecycle, 1, False)
    except sqlite3.IntegrityError as error:
        connection.rollback()
        raise PupuUnchainMemoryV2OwnershipError(
            "lifecycle binding conflicted"
        ) from error
    except sqlite3.Error as error:
        connection.rollback()
        raise PupuUnchainMemoryV2OwnershipError(
            "lifecycle persistence failed"
        ) from error
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


def list_pupu_unchain_ownership_lifecycles(
    *,
    database_path: str | Path,
    owner_chat_id: str,
    limit: int = 1_000,
) -> tuple[PupuUnchainMemoryV2Lifecycle, ...]:
    """Cold-read the exact mappings later deletion/recovery may enumerate."""

    path = Path(database_path)
    owner = _identifier(owner_chat_id, "owner_chat_id")
    if type(limit) is not int or not 1 <= limit <= 10_000:
        raise ValueError("limit must be between 1 and 10000")
    _initialize_lifecycle_schema(path)
    connection = _connect(path)
    try:
        connection.execute("PRAGMA query_only = ON")
        rows = list(
            connection.execute(
                """
                SELECT * FROM pupu_unchain_ownership_bindings
                WHERE owner_chat_id = ?
                ORDER BY execution_id, generation_id, attempt_id, lifecycle_key
                LIMIT ?
                """,
                (owner, limit),
            )
        )
        return tuple(_decode_lifecycle_row(row) for row in rows)
    except sqlite3.Error as error:
        raise PupuUnchainMemoryV2OwnershipError("lifecycle read failed") from error
    finally:
        connection.close()


def read_pupu_unchain_ownership_lifecycle(
    *,
    database_path: str | Path,
    owner_chat_id: str,
    execution_id: str,
    generation_id: str,
    attempt_id: str,
) -> PupuUnchainMemoryV2Lifecycle | None:
    """Cold-read one exact official attempt ownership binding."""

    path = Path(database_path)
    scope = (
        _identifier(owner_chat_id, "owner_chat_id"),
        _identifier(execution_id, "execution_id"),
        _identifier(generation_id, "generation_id"),
        _identifier(attempt_id, "attempt_id"),
    )
    _initialize_lifecycle_schema(path)
    connection = _connect(path)
    try:
        connection.execute("PRAGMA query_only = ON")
        row = connection.execute(
            """
            SELECT * FROM pupu_unchain_ownership_bindings
            WHERE owner_chat_id = ? AND execution_id = ?
              AND generation_id = ? AND attempt_id = ?
            """,
            scope,
        ).fetchone()
        return None if row is None else _decode_lifecycle_row(row)
    except sqlite3.Error as error:
        raise PupuUnchainMemoryV2OwnershipError(
            "lifecycle read failed"
        ) from error
    finally:
        connection.close()


@dataclass(frozen=True, slots=True)
class PupuRootCompletionFactoryResolver:
    """Grant terminal Curator enqueue only to the exact bound root run."""

    lifecycle: PupuUnchainMemoryV2Lifecycle
    completion_factory: Any = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if not isinstance(self.lifecycle, PupuUnchainMemoryV2Lifecycle):
            raise TypeError("lifecycle must be a PuPu Unchain lifecycle")
        if self.completion_factory is not None and not callable(
            getattr(self.completion_factory, "build", None)
        ):
            raise TypeError("completion_factory must provide build(result=...)")

    def resolve(self, request):
        try:
            from unchain.agent.modules.memory_v2 import (
                MemoryV2AgentAttachmentRequest,
                MemoryV2RunRole,
            )
        except ImportError as error:  # pragma: no cover - guarded by readiness
            raise PupuUnchainMemoryV2OwnershipError(
                "Unchain Memory V2 attachment API is unavailable"
            ) from error
        if not isinstance(request, MemoryV2AgentAttachmentRequest):
            raise TypeError("request must be a MemoryV2AgentAttachmentRequest")
        if request.role is not MemoryV2RunRole.ROOT:
            return None
        if (
            request.session_id != self.lifecycle.session_id
            or request.attempt_id != self.lifecycle.attempt_id
            or request.root_run_id != self.lifecycle.root_run_id
        ):
            return None
        return self.completion_factory


@dataclass(frozen=True, slots=True)
class PupuUnchainMemoryV2OwnershipAttachment:
    lifecycle: PupuUnchainMemoryV2Lifecycle
    lifecycle_revision: int
    lifecycle_replayed: bool
    context_module: Any = field(repr=False)
    event_projector: Any = field(repr=False)
    artifact_handoff: Any = field(repr=False)
    normal_attachment_factory: Any = field(repr=False)
    consolidation_factory: Any = field(repr=False)
    memory_host: Any = field(repr=False)
    memory_module: Any = field(repr=False)

    @property
    def production_enabled(self) -> bool:
        return False

    def modules_for_shadow(self) -> tuple[()]:
        """Shadow readiness never changes model input or mounted toolkits."""

        return ()

    def readiness(self) -> dict[str, Any]:
        return {
            "schema": "pupu.unchain_memory_v2_ownership_readiness.v1",
            "production_gate": "closed",
            "shadow_safe": True,
            "lifecycle_revision": self.lifecycle_revision,
            "lifecycle_replayed": self.lifecycle_replayed,
            "components": (
                "ContextModule",
                "CanonicalSemanticEventProjector",
                "ContextArtifactHandoffHostAdapter",
                "SQLiteMemoryV2AgentAttachmentFactory",
                "SQLiteConsolidationCapabilityFactory",
            ),
            "lifecycle": self.lifecycle.to_dict(),
        }


def _verify_component_scope(
    *,
    lifecycle: PupuUnchainMemoryV2Lifecycle,
    database_path: Path,
    context_module: Any,
    event_projector: Any,
    handoff_recorder: Any,
    curation_repository: Any,
    workspace: Any,
) -> None:
    from unchain.agent.modules import ContextModule
    from unchain.context import ContextRuntime, DurableHandoffRecorder
    from unchain.context.projector import CanonicalSemanticEventProjector
    from unchain.memory.curator.ports import BoundCurationRepository
    from unchain.memory.workspace import MemoryWorkspaceService

    if (
        type(context_module) is not ContextModule
        or type(context_module.runtime) is not ContextRuntime
    ):
        raise PupuUnchainMemoryV2OwnershipError(
            "official ContextModule binding is required"
        )
    if type(event_projector) is not CanonicalSemanticEventProjector:
        raise PupuUnchainMemoryV2OwnershipError(
            "official semantic event projector is required"
        )
    if type(handoff_recorder) is not DurableHandoffRecorder:
        raise PupuUnchainMemoryV2OwnershipError(
            "official artifact handoff recorder is required"
        )
    attempt = event_projector.attempt
    if attempt.generation.execution_id != lifecycle.execution_id:
        raise PupuUnchainMemoryV2OwnershipError(
            "event projector execution scope changed"
        )
    if attempt.generation.generation_id != lifecycle.generation_id:
        raise PupuUnchainMemoryV2OwnershipError(
            "event projector generation scope changed"
        )
    if attempt.attempt_id != lifecycle.attempt_id:
        raise PupuUnchainMemoryV2OwnershipError("event projector attempt scope changed")
    if (
        handoff_recorder.attempt != attempt
        or handoff_recorder.projector is not event_projector
        or context_module.runtime.durable_event_sink is not handoff_recorder.sink
    ):
        raise PupuUnchainMemoryV2OwnershipError(
            "context and artifact handoff boundaries do not match"
        )
    if not isinstance(curation_repository, BoundCurationRepository):
        raise PupuUnchainMemoryV2OwnershipError(
            "official curation repository binding is required"
        )
    if curation_repository.binding_id != lifecycle.binding_id:
        raise PupuUnchainMemoryV2OwnershipError("curation binding scope changed")
    if curation_repository.owner_chat_id != lifecycle.owner_chat_id:
        raise PupuUnchainMemoryV2OwnershipError("curation owner scope changed")
    if curation_repository.target_space_id != lifecycle.chat_space_id:
        raise PupuUnchainMemoryV2OwnershipError("curation chat space scope changed")
    if not isinstance(workspace, MemoryWorkspaceService):
        raise PupuUnchainMemoryV2OwnershipError(
            "official chat workspace binding is required"
        )
    if workspace.binding_id != lifecycle.binding_id:
        raise PupuUnchainMemoryV2OwnershipError("workspace binding scope changed")
    if workspace.space.space_id != lifecycle.chat_space_id:
        raise PupuUnchainMemoryV2OwnershipError("workspace chat space scope changed")

    connection = _connect(database_path)
    try:
        connection.execute("PRAGMA query_only = ON")
        execution = connection.execute(
            "SELECT execution_id FROM executions WHERE execution_id = ?",
            (lifecycle.execution_id,),
        ).fetchone()
        space = connection.execute(
            "SELECT owner_chat_id FROM spaces WHERE space_id = ?",
            (lifecycle.chat_space_id,),
        ).fetchone()
        curation = connection.execute(
            """
            SELECT owner_chat_id, target_space_id
            FROM curation_scopes WHERE binding_id = ?
            """,
            (lifecycle.binding_id,),
        ).fetchone()
    except sqlite3.Error as error:
        raise PupuUnchainMemoryV2OwnershipError(
            "durable component scope is unavailable"
        ) from error
    finally:
        connection.close()
    if execution is None:
        raise PupuUnchainMemoryV2OwnershipError(
            "durable execution scope is unavailable"
        )
    if space is None or space["owner_chat_id"] != lifecycle.owner_chat_id:
        raise PupuUnchainMemoryV2OwnershipError("durable workspace owner scope changed")
    if (
        curation is None
        or curation["owner_chat_id"] != lifecycle.owner_chat_id
        or curation["target_space_id"] != lifecycle.chat_space_id
    ):
        raise PupuUnchainMemoryV2OwnershipError("durable curation scope changed")


def prepare_pupu_unchain_ownership_attachment(
    *,
    owner_chat_id: str,
    execution_id: str,
    generation_id: str,
    attempt_id: str,
    root_run_id: str,
    binding_id: str,
    chat_space_id: str,
    operation_id: str,
    expected_revision: int,
    database_path: str | Path,
    context_module: Any,
    event_projector: Any,
    handoff_recorder: Any,
    curation_repository: Any,
    workspace: Any,
    references: Any,
    context: Any,
    root_completion_factory: Any = None,
) -> PupuUnchainMemoryV2OwnershipAttachment:
    """Prepare the official ownership graph without mounting it in an Agent."""

    from unchain.agent.modules.memory_v2 import MemoryV2AgentModule
    from unchain.context.host_adapter import ContextArtifactHandoffHostAdapter
    from unchain.memory.curator.host import (
        MemoryAgentHostAdapter,
        MemoryAgentHostConfig,
    )
    from unchain.persistence.sqlite_memory_host_v2 import (
        SQLiteConsolidationCapabilityFactory,
        SQLiteMemoryV2AgentAttachmentFactory,
    )

    lifecycle = PupuUnchainMemoryV2Lifecycle(
        owner_chat_id=owner_chat_id,
        execution_id=execution_id,
        generation_id=generation_id,
        attempt_id=attempt_id,
        root_run_id=root_run_id,
        binding_id=binding_id,
        chat_space_id=chat_space_id,
    )
    path = Path(database_path)
    if path.name != "context_v2.sqlite3":
        raise PupuUnchainMemoryV2OwnershipError(
            "ownership must use the shared context_v2.sqlite3 database"
        )
    _verify_component_scope(
        lifecycle=lifecycle,
        database_path=path,
        context_module=context_module,
        event_projector=event_projector,
        handoff_recorder=handoff_recorder,
        curation_repository=curation_repository,
        workspace=workspace,
    )
    from unchain.persistence.sqlite_chat_deletion_v2 import is_chat_deleted

    if is_chat_deleted(
        database_path=path,
        owner_chat_id=lifecycle.owner_chat_id,
    ):
        raise PupuUnchainMemoryV2OwnershipError(
            "durably deleted chat cannot prepare a new ownership attachment"
        )
    resolver = PupuRootCompletionFactoryResolver(
        lifecycle=lifecycle,
        completion_factory=root_completion_factory,
    )
    normal_factory = SQLiteMemoryV2AgentAttachmentFactory(
        binding_id=lifecycle.binding_id,
        repository=curation_repository,
        workspace=workspace,
        references=references,
        context=context,
        completion_factory_resolver=resolver,
    )
    consolidation_factory = SQLiteConsolidationCapabilityFactory(
        binding_id=lifecycle.binding_id,
        database_path=path,
        repository=curation_repository,
        workspace=workspace,
        references=references,
        context=context,
    )
    artifact_handoff = ContextArtifactHandoffHostAdapter(
        recorder=handoff_recorder,
    )
    memory_host = MemoryAgentHostAdapter(
        curation_repository,
        capability_factory=consolidation_factory,
        config=MemoryAgentHostConfig(enabled=False),
    )
    memory_module = MemoryV2AgentModule(
        host=memory_host,
        attachment_factory=normal_factory,
    )

    _initialize_lifecycle_schema(path)
    receipt = _persist_lifecycle(
        database_path=path,
        lifecycle=lifecycle,
        operation_id=operation_id,
        expected_revision=expected_revision,
    )
    return PupuUnchainMemoryV2OwnershipAttachment(
        lifecycle=receipt.lifecycle,
        lifecycle_revision=receipt.revision,
        lifecycle_replayed=receipt.replayed,
        context_module=context_module,
        event_projector=event_projector,
        artifact_handoff=artifact_handoff,
        normal_attachment_factory=normal_factory,
        consolidation_factory=consolidation_factory,
        memory_host=memory_host,
        memory_module=memory_module,
    )


__all__ = [
    "PupuRootCompletionFactoryResolver",
    "PupuUnchainMemoryV2Lifecycle",
    "PupuUnchainMemoryV2OwnershipAttachment",
    "PupuUnchainMemoryV2OwnershipError",
    "list_pupu_unchain_ownership_lifecycles",
    "prepare_pupu_unchain_ownership_attachment",
    "read_pupu_unchain_ownership_lifecycle",
]
