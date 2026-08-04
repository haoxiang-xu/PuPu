"""Finish sticky active admission over an existing atomic bootstrap.

The canonical initial generation is created before active host construction by
Unchain's atomic generation service.  This adapter never imports chat history
and never appends journal events.  It only verifies that the active runtime is
bound to the latest durable generation head, then advances the separate PuPu
sticky-admission row with compare-and-swap.
"""

from __future__ import annotations

import copy
import hashlib
import json
from collections.abc import Mapping
from typing import Any

from memory_v2_unchain_active_bridge import PupuUnchainActiveHostPreflight
from memory_v2_unchain_admission_adapter import (
    PupuUnchainAdmissionAuthority,
    PupuUnchainAdmissionError,
)
from memory_v2_unchain_atomic_bootstrap import (
    ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
    PupuUnchainAtomicBootstrap,
    PupuUnchainAtomicBootstrapError,
    verify_pupu_unchain_atomic_bootstrap,
)
from unchain.context import SemanticEventProjectionMode
from unchain.journal.models import _required_text
from unchain.run_identity import MemoryV2RunRole


class PupuUnchainActiveLazyBootstrapError(RuntimeError):
    """The active chat could not durably complete sticky admission."""

    def __init__(self, code: str, message: str) -> None:
        self.code = str(code or "context_v2_lazy_bootstrap_failed")
        super().__init__(message)


def _canonical_bytes(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (RecursionError, TypeError, ValueError, UnicodeError) as error:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_input_invalid",
            "lazy bootstrap input is not canonical JSON",
        ) from error


def _stable_id(prefix: str, value: Mapping[str, Any]) -> str:
    return f"{prefix}:{hashlib.sha256(_canonical_bytes(dict(value))).hexdigest()}"


def _verify_atomic_scope(
    *,
    preflight: PupuUnchainActiveHostPreflight,
    binding: Any,
    factory: Any,
) -> PupuUnchainAtomicBootstrap:
    bootstrap = getattr(preflight, "atomic_bootstrap", None)
    if not isinstance(bootstrap, PupuUnchainAtomicBootstrap):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_atomic_preflight_invalid",
            "active preflight has no verified atomic bootstrap",
        )
    try:
        current_head = verify_pupu_unchain_atomic_bootstrap(
            bootstrap=bootstrap,
            database_path=factory.database_path,
            object_directory=factory.object_directory,
            owner_chat_id=binding.owner_chat_id,
            session_id=binding.session_id,
            execution_id=binding.execution_id,
        )
    except (PupuUnchainAtomicBootstrapError, OSError, RuntimeError) as error:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_atomic_preflight_invalid",
            "atomic bootstrap could not be verified before sticky admission",
        ) from error
    if (
        current_head.owner_chat_id != binding.owner_chat_id
        or current_head.session_id != binding.session_id
        or current_head.execution_id != binding.execution_id
        or current_head.current_generation_id != binding.generation_id
        or current_head.revision != binding.head_revision
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_generation_mismatch",
            "active runtime is not bound to the latest durable generation head",
        )
    return bootstrap


def _active_scope(
    *,
    preflight: PupuUnchainActiveHostPreflight,
    admission: Any,
) -> tuple[
    Any,
    PupuUnchainAtomicBootstrap,
    PupuUnchainAdmissionAuthority,
    dict[str, Any],
]:
    if not isinstance(preflight, PupuUnchainActiveHostPreflight):
        raise TypeError("preflight must be a PupuUnchainActiveHostPreflight")
    binding = preflight.preparation.binding
    factory = preflight.preparation.host_factory
    if (
        binding.role is not MemoryV2RunRole.ROOT
        or binding.run_id != binding.root_run_id
        or preflight.execution_id != binding.execution_id
        or factory.owner_chat_id != binding.owner_chat_id
        or factory.root_run_id != binding.root_run_id
        or factory.production_enabled is not True
        or factory.projection_mode is not SemanticEventProjectionMode.CANONICAL
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_preflight_scope_mismatch",
            "active preflight does not own the exact canonical root scope",
        )
    bootstrap = _verify_atomic_scope(
        preflight=preflight,
        binding=binding,
        factory=factory,
    )
    if type(getattr(admission, "is_active", None)) is not bool or not admission.is_active:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_invalid",
            "lazy bootstrap requires an active sticky admission",
        )
    supplied_scope = (
        _required_text(
            getattr(admission, "owner_chat_id", None),
            "owner_chat_id",
            identifier=True,
        ),
        _required_text(
            getattr(admission, "session_id", None),
            "session_id",
            identifier=True,
        ),
        _required_text(
            getattr(admission, "attempt_id", None),
            "attempt_id",
            identifier=True,
        ),
    )
    if supplied_scope != (
        binding.owner_chat_id,
        binding.session_id,
        binding.attempt_id,
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_identity_mismatch",
            "sticky admission does not match the active generation attempt",
        )
    authority = getattr(admission, "admission_authority", None)
    if not isinstance(authority, PupuUnchainAdmissionAuthority):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_authority_unavailable",
            "sticky admission authority is unavailable",
        )
    if (
        authority.owner_chat_id != binding.owner_chat_id
        or authority.database_path != factory.database_path
        or authority.object_directory != factory.object_directory
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_store_scope_mismatch",
            "sticky admission authority does not match the active store",
        )
    admission_id = _required_text(
        getattr(admission, "admission_id", None),
        "admission_id",
        identifier=True,
    )
    admission_revision = getattr(admission, "admission_revision", None)
    if (
        isinstance(admission_revision, bool)
        or not isinstance(admission_revision, int)
        or admission_revision < 1
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_invalid",
            "sticky admission revision is invalid",
        )
    if type(getattr(admission, "v2_bootstrapped", None)) is not bool:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_invalid",
            "sticky bootstrap state is invalid",
        )
    try:
        current = authority.get_chat_admission(owner_chat_id=binding.owner_chat_id)
    except Exception as error:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_unavailable",
            "sticky admission could not be read",
        ) from error
    if (
        not isinstance(current, dict)
        or current.get("admission_id") != admission_id
        or current.get("owner_chat_id") != binding.owner_chat_id
        or current.get("first_session_id") != binding.session_id
        or current.get("target_mode") != "active"
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_scope_mismatch",
            "persisted sticky admission does not match the active chat",
        )
    if admission.v2_bootstrapped and current.get("v2_bootstrapped") is not True:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_state_mismatch",
            "supplied sticky bootstrap state is not durable",
        )
    if not current.get("v2_bootstrapped") and current.get("revision") != (
        admission_revision
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_stale",
            "pending sticky admission revision changed before bootstrap",
        )
    return binding, bootstrap, authority, current


def _verified_sticky_provenance(
    *,
    bootstrap: PupuUnchainAtomicBootstrap,
    current: Mapping[str, Any],
) -> dict[str, Any]:
    provenance = current.get("bootstrap_provenance")
    if not isinstance(provenance, Mapping):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_provenance_invalid",
            "sticky admission has no atomic bootstrap provenance",
        )
    runtime_attempt_id = provenance.get("runtime_attempt_id")
    try:
        expected = bootstrap.provenance(runtime_attempt_id=runtime_attempt_id)
    except (PupuUnchainAtomicBootstrapError, TypeError, ValueError) as error:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_provenance_invalid",
            "sticky atomic bootstrap provenance is invalid",
        ) from error
    if provenance.get("schema") != ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA or dict(
        provenance
    ) != expected:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_provenance_invalid",
            "sticky atomic bootstrap provenance changed",
        )
    return copy.deepcopy(expected)


def _already_bootstrapped_receipt(
    *,
    binding: Any,
    bootstrap: PupuUnchainAtomicBootstrap,
    current: Mapping[str, Any],
) -> dict[str, Any]:
    provenance = _verified_sticky_provenance(
        bootstrap=bootstrap,
        current=current,
    )
    return {
        "status": "already_bootstrapped",
        "skipped": True,
        "owner_chat_id": binding.owner_chat_id,
        "session_id": binding.session_id,
        "execution_id": binding.execution_id,
        "generation_id": binding.generation_id,
        "attempt_id": binding.attempt_id,
        "bootstrap_generation_id": bootstrap.generation_id,
        "bootstrap_attempt_id": bootstrap.bootstrap_attempt_id,
        "source_revision": bootstrap.source_revision,
        "history_state": bootstrap.history_state,
        "message_count": bootstrap.message_count,
        "admission": copy.deepcopy(dict(current)),
        "atomic_bootstrap": provenance["atomic_bootstrap"],
    }


def bootstrap_pupu_unchain_active_chat(
    *,
    preflight: PupuUnchainActiveHostPreflight,
    admission: Any,
) -> dict[str, Any]:
    """Verify atomic state and CAS the exact chat's sticky active admission."""

    binding, bootstrap, authority, current = _active_scope(
        preflight=preflight,
        admission=admission,
    )
    if current.get("v2_bootstrapped") is True:
        return _already_bootstrapped_receipt(
            binding=binding,
            bootstrap=bootstrap,
            current=current,
        )

    provenance = bootstrap.provenance(runtime_attempt_id=binding.attempt_id)
    mark_semantic = {
        "operation": "mark_active_atomic_bootstrap_complete",
        "admission_id": current["admission_id"],
        "expected_revision": current["revision"],
        "provenance": provenance,
    }
    try:
        marked = authority.mark_chat_bootstrap(
            owner_chat_id=binding.owner_chat_id,
            admission_id=current["admission_id"],
            expected_revision=current["revision"],
            succeeded=True,
            provenance=provenance,
            error_code="",
            operation_id=_stable_id(
                "active-atomic-bootstrap-admission",
                mark_semantic,
            ),
        )
    except PupuUnchainAdmissionError as error:
        if error.code == "context_v2_revision_conflict":
            try:
                raced = authority.get_chat_admission(
                    owner_chat_id=binding.owner_chat_id
                )
            except Exception:
                raced = None
            if (
                isinstance(raced, dict)
                and raced.get("admission_id") == current["admission_id"]
                and raced.get("v2_bootstrapped") is True
            ):
                return _already_bootstrapped_receipt(
                    binding=binding,
                    bootstrap=bootstrap,
                    current=raced,
                )
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_persistence_failed",
            "sticky admission was not durably advanced after atomic bootstrap",
        ) from error
    except Exception as error:
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_persistence_failed",
            "sticky admission was not durably advanced after atomic bootstrap",
        ) from error
    if (
        not isinstance(marked, dict)
        or marked.get("admission_id") != current["admission_id"]
        or marked.get("owner_chat_id") != binding.owner_chat_id
        or marked.get("revision") != current["revision"] + 1
        or marked.get("v2_bootstrapped") is not True
        or marked.get("bootstrap_status") != "complete"
        or marked.get("effective_mode") != "active"
        or marked.get("bootstrap_provenance") != provenance
    ):
        raise PupuUnchainActiveLazyBootstrapError(
            "context_v2_lazy_bootstrap_admission_receipt_mismatch",
            "sticky bootstrap receipt changed the active host scope",
        )
    return {
        "status": "completed",
        "skipped": False,
        "owner_chat_id": binding.owner_chat_id,
        "session_id": binding.session_id,
        "execution_id": binding.execution_id,
        "generation_id": binding.generation_id,
        "attempt_id": binding.attempt_id,
        "bootstrap_generation_id": bootstrap.generation_id,
        "bootstrap_attempt_id": bootstrap.bootstrap_attempt_id,
        "source_revision": bootstrap.source_revision,
        "history_state": bootstrap.history_state,
        "message_count": bootstrap.message_count,
        "admission": copy.deepcopy(marked),
        "atomic_bootstrap": copy.deepcopy(provenance["atomic_bootstrap"]),
    }


__all__ = [
    "PupuUnchainActiveLazyBootstrapError",
    "bootstrap_pupu_unchain_active_chat",
]
