"""Existing-only sticky admission proof for verified Skeleton recovery.

Reuse the host's strict sticky-row reader and Unchain's canonical generation
receipt readers. Cold recovery grants no Store initialization or mutation API.
"""
from __future__ import annotations

from collections.abc import Mapping
from contextlib import contextmanager
import sqlite3

from memory_v2_store_boundary import (STORE_OWNER_UNCHAIN, ContextV2StoreBoundaryError,
    read_context_v2_store_owner_manifest)
from memory_v2_unchain_active_bridge import (PupuUnchainActiveBridgeError,
    _cold_context_paths, _read_existing_active_admission,
    _read_existing_active_session_admissions)
from memory_v2_unchain_atomic_bootstrap import ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA
from memory_v2_unchain_generation_api import (MemoryV2UnchainGenerationAPIError,
    _provenance_identifier)
from unchain.journal.models import _required_text
from unchain.persistence.sqlite_generation_rebase_v2 import (GenerationRebaseError,
    GenerationRebaseKind, SQLiteGenerationRebaseV2Service)
from unchain.persistence.sqlite_v2 import (SQLiteContextV2StoreError,
    existing_context_v2_readonly_connection)


class _ExistingGenerationAdmissionReader(SQLiteGenerationRebaseV2Service):
    """Official receipt/head validation, restricted to existing read transactions.

    The inherited read methods use only their transaction and validators. They
    never need a mutable Store; skip the service's schema-initializing constructor.
    Any attempt to use a write transaction is rejected before opening storage.
    """

    def __init__(self, database_path):
        self._database_path = database_path

    @contextmanager
    def _transaction(self, *, immediate):
        if immediate is not False:
            raise PupuUnchainActiveBridgeError("Skeleton admission is read-only")
        with existing_context_v2_readonly_connection(self._database_path) as connection:
            yield connection


def existing_skeleton_active_admission(*, owner_chat_id, session_id, execution_id):
    """Prove existing sticky/atomic admission without claiming or repairing it."""
    owner = _required_text(owner_chat_id, "owner_chat_id", identifier=True)
    session = _required_text(session_id, "session_id", identifier=True)
    execution = _required_text(execution_id, "execution_id", identifier=True)
    if session != execution:
        raise PupuUnchainActiveBridgeError("Skeleton session must match its execution")
    try:
        database_path, object_directory = _cold_context_paths()
        if (not database_path.is_file() or database_path.is_symlink()
                or not object_directory.is_dir() or object_directory.is_symlink()
                or read_context_v2_store_owner_manifest(database_path.parent) != STORE_OWNER_UNCHAIN):
            return False
        admission = _read_existing_active_admission(owner)
        if admission is None or admission.get("effective_mode") != "active":
            if _read_existing_active_session_admissions(session):
                raise PupuUnchainActiveBridgeError("Sticky admission belongs to another chat")
            return False
        if (admission.get("target_mode") != "active"
                or admission.get("first_session_id") != session
                or admission.get("bootstrap_status") != "complete"
                or admission.get("v2_bootstrapped") is not True):
            raise PupuUnchainActiveBridgeError("Sticky admission is not completely active")
        # A tombstone's presence always denies recovery, even if its evidence
        # is corrupt. No deletion constructor or repair path is needed to deny.
        with existing_context_v2_readonly_connection(database_path) as connection:
            table = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chat_deletion_tombstones'").fetchone()
            if table is not None and connection.execute(
                    "SELECT 1 FROM chat_deletion_tombstones WHERE owner_chat_id=?", (owner,)).fetchone() is not None:
                return False
        provenance = admission.get("bootstrap_provenance")
        if (not isinstance(provenance, Mapping)
                or provenance.get("schema") != ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA
                or provenance.get("owner_chat_id") != owner):
            raise PupuUnchainActiveBridgeError("Atomic bootstrap provenance changed")
        if (_provenance_identifier(provenance, "session_id") != session
                or _provenance_identifier(provenance, "execution_id") != execution):
            raise PupuUnchainActiveBridgeError("Atomic bootstrap scope changed")
        generation = _provenance_identifier(provenance, "generation_id")
        bootstrap_attempt = _provenance_identifier(provenance, "bootstrap_attempt_id")
        _provenance_identifier(provenance, "runtime_attempt_id")
        source_revision = _provenance_identifier(provenance, "source_revision")
        count = provenance.get("message_count")
        atomic = provenance.get("atomic_bootstrap")
        if type(count) is not int or not 0 <= count <= 10_000 or not isinstance(atomic, Mapping):
            raise PupuUnchainActiveBridgeError("Atomic bootstrap accounting changed")
        reader = _ExistingGenerationAdmissionReader(database_path)
        receipt = reader.receipt_for_generation(owner_chat_id=owner, execution_id=execution,
            session_id=session, generation_id=generation)
        if (receipt is None or receipt.kind is not GenerationRebaseKind.CREATE
                or receipt.previous_generation_id or receipt.head_revision != 1
                or receipt.attempt_id != bootstrap_attempt or receipt.source_revision != source_revision
                or receipt.message_count != count
                or atomic.get("manifest_sha256") != receipt.manifest_sha256
                or atomic.get("message_count") != receipt.message_count
                or atomic.get("operation_id") != receipt.operation.operation_id
                or atomic.get("payload_sha256") != receipt.operation.payload_sha256
                or atomic.get("first_cursor") != receipt.first_cursor.to_dict()
                or atomic.get("last_cursor") != receipt.last_cursor.to_dict()):
            raise PupuUnchainActiveBridgeError("Atomic bootstrap receipt changed")
        current = reader.current(owner_chat_id=owner, execution_id=execution, session_id=session)
        if (current is None or current.owner_chat_id != owner or current.session_id != session
                or current.execution_id != execution or current.revision < receipt.head_revision):
            raise PupuUnchainActiveBridgeError("Current generation is outside the admission scope")
        return True
    except PupuUnchainActiveBridgeError:
        raise
    except (ContextV2StoreBoundaryError, MemoryV2UnchainGenerationAPIError,
            GenerationRebaseError, SQLiteContextV2StoreError, sqlite3.Error,
            KeyError, OSError, TypeError, ValueError) as error:
        raise PupuUnchainActiveBridgeError("Existing Skeleton admission is unavailable or invalid") from error
