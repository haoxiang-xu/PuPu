"""Cold-open PuPu's fixed long-term recall capability from Unchain storage.

This host adapter resolves only sticky store ownership and the durable chat
lifecycle.  It never reads Memory V2 or promotion SQLite tables; namespace and
physical-space resolution remain inside Unchain's public persistence service.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_ownership_adapter import (
    PupuUnchainMemoryV2Lifecycle,
    PupuUnchainMemoryV2OwnershipError,
    list_pupu_unchain_ownership_lifecycles,
)
from unchain.memory.long_term_recall_v2 import (
    LongTermFirstMessageRecall,
    LongTermRecallDisposition,
    LongTermRecallEnvelope,
)
from unchain.memory.workspace.ports import (
    RepositoryNotFoundError,
    WorkspaceRepositoryError,
)
from unchain.memory.workspace.search import VectorIndex
from unchain.persistence.sqlite_chat_deletion_v2 import (
    ChatDeletionError,
    is_chat_deleted,
)
from unchain.persistence.sqlite_long_term_memory_v2 import (
    SQLiteLongTermMemoryV2ReadError,
    SQLiteLongTermMemoryV2ReadScope,
    open_sqlite_long_term_memory_v2,
)


PUPU_LONG_TERM_RECALL_NAMESPACE = "user:local"
_MAX_LIFECYCLES = 10_000


class PupuUnchainLongTermRecallError(RuntimeError):
    """The host could not prove one exact long-term recall scope."""

    def __init__(self, code: str, message: str, *, status_code: int = 409) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class PupuUnchainLongTermRecall:
    """Owner-bound first-message recall over one fixed user namespace."""

    owner_chat_id: str
    binding_id: str
    _recall: LongTermFirstMessageRecall | None = field(repr=False)
    _lifecycles: tuple[PupuUnchainMemoryV2Lifecycle, ...] = field(repr=False)
    namespace: str = field(default=PUPU_LONG_TERM_RECALL_NAMESPACE, init=False)

    def __post_init__(self) -> None:
        if not isinstance(self.owner_chat_id, str) or not self.owner_chat_id.strip():
            raise TypeError("owner_chat_id must be non-empty text")
        if not isinstance(self.binding_id, str) or not self.binding_id.strip():
            raise TypeError("binding_id must be non-empty text")
        if self._recall is not None:
            if not isinstance(self._recall, LongTermFirstMessageRecall):
                raise TypeError("recall must be a LongTermFirstMessageRecall")
            if (
                self._recall.namespace != self.namespace
                or self._recall.binding_id != self.binding_id
            ):
                raise PupuUnchainLongTermRecallError(
                    "context_v2_long_term_recall_binding_changed",
                    "The Unchain long-term recall binding changed",
                )
        if not self._lifecycles or any(
            not isinstance(item, PupuUnchainMemoryV2Lifecycle)
            for item in self._lifecycles
        ):
            raise TypeError("lifecycles must contain durable lifecycle records")
        if any(
            item.owner_chat_id != self.owner_chat_id
            or item.binding_id != self.binding_id
            for item in self._lifecycles
        ):
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_lifecycle_changed",
                "The durable lifecycle recall scope changed",
            )

    @property
    def memory_available(self) -> bool:
        return self._recall is not None

    def recall_first_message(
        self,
        *,
        owner_chat_id: str,
        first_user_message: str,
        limit: int = 5,
    ) -> LongTermRecallEnvelope:
        if owner_chat_id != self.owner_chat_id:
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_owner_mismatch",
                "The requested chat is outside the durable recall scope",
                status_code=404,
            )
        if self._recall is None:
            if not isinstance(first_user_message, str):
                raise TypeError("first_user_message must be text")
            normalized = unicodedata.normalize("NFC", first_user_message.strip())
            if (
                not normalized
                or len(normalized) > 4096
                or "\x00" in normalized
                or any(ord(character) < 32 for character in normalized)
            ):
                raise ValueError("first_user_message is invalid")
            if (
                isinstance(limit, bool)
                or not isinstance(limit, int)
                or not 1 <= limit <= 5
            ):
                raise ValueError("limit must be between 1 and 5")
            return LongTermRecallEnvelope(
                disposition=LongTermRecallDisposition.NONE,
                namespace=self.namespace,
            )
        envelope = self._recall.recall_first_message(
            first_user_message,
            limit=limit,
        )
        if envelope.namespace != self.namespace:
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_namespace_changed",
                "The Unchain long-term recall namespace changed",
            )
        return envelope


def open_pupu_unchain_long_term_recall(
    *,
    root_dir: str | Path,
    owner_chat_id: str,
    vector_index: VectorIndex | None = None,
) -> PupuUnchainLongTermRecall:
    """Cold-open first-message recall for one durable PuPu chat owner."""

    try:
        admission = admit_context_v2_store_owner(
            root_dir=root_dir,
            requested_owner=STORE_OWNER_UNCHAIN,
        )
        if (
            admission.owner != STORE_OWNER_UNCHAIN
            or admission.database_state != STORE_OWNER_UNCHAIN
        ):
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_store_unavailable",
                "Unchain Context V2 long-term storage is unavailable",
                status_code=503,
            )
        if is_chat_deleted(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
        ):
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_chat_deleted",
                "A durably deleted chat cannot open long-term recall",
                status_code=410,
            )
        lifecycles = list_pupu_unchain_ownership_lifecycles(
            database_path=admission.database_path,
            owner_chat_id=owner_chat_id,
            limit=_MAX_LIFECYCLES,
        )
        if not lifecycles:
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_lifecycle_unavailable",
                "The durable Unchain chat lifecycle is unavailable",
            )
        if len(lifecycles) >= _MAX_LIFECYCLES:
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_lifecycle_limit_exceeded",
                "The durable Unchain chat lifecycle exceeds the P0 limit",
            )
        binding_ids = {item.binding_id for item in lifecycles}
        space_ids = {item.chat_space_id for item in lifecycles}
        if len(binding_ids) != 1 or len(space_ids) != 1:
            raise PupuUnchainLongTermRecallError(
                "context_v2_long_term_recall_lifecycle_ambiguous",
                "The durable Unchain long-term recall scope is ambiguous",
            )
        binding_id = next(iter(binding_ids))
        try:
            memory = open_sqlite_long_term_memory_v2(
                database_path=admission.database_path,
                object_directory=admission.root_dir / "objects",
                scope=SQLiteLongTermMemoryV2ReadScope(
                    namespace=PUPU_LONG_TERM_RECALL_NAMESPACE,
                    binding_id=binding_id,
                ),
                vector_index=vector_index,
            )
        except RepositoryNotFoundError:
            recall = None
        else:
            recall = LongTermFirstMessageRecall(memory=memory)
        return PupuUnchainLongTermRecall(
            owner_chat_id=owner_chat_id,
            binding_id=binding_id,
            _recall=recall,
            _lifecycles=lifecycles,
        )
    except PupuUnchainLongTermRecallError:
        raise
    except (
        ChatDeletionError,
        ContextV2StoreBoundaryError,
        PupuUnchainMemoryV2OwnershipError,
        SQLiteLongTermMemoryV2ReadError,
        WorkspaceRepositoryError,
        TypeError,
        ValueError,
    ) as error:
        raise PupuUnchainLongTermRecallError(
            "context_v2_long_term_recall_open_failed",
            "The durable Unchain long-term recall capability is unavailable",
            status_code=503,
        ) from error


__all__ = [
    "PUPU_LONG_TERM_RECALL_NAMESPACE",
    "PupuUnchainLongTermRecall",
    "PupuUnchainLongTermRecallError",
    "open_pupu_unchain_long_term_recall",
]
