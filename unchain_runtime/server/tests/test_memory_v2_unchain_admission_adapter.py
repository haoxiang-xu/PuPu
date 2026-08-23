from __future__ import annotations

import os
from pathlib import Path
from unittest import mock

import pytest

from context_memory_v2_capability import ContextMemoryV2CapabilityVerdict
from memory_v2_context import resolve_memory_v2_admission
from memory_v2_store_boundary import (
    STORE_OWNER_UNCHAIN,
    admit_context_v2_store_owner,
)
from memory_v2_unchain_admission_adapter import (
    PupuUnchainAdmissionScopeError,
    open_pupu_unchain_admission_authority,
)
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store


def _ready_capability() -> ContextMemoryV2CapabilityVerdict:
    return ContextMemoryV2CapabilityVerdict(
        ready=True,
        reason="unchain_context_memory_ready",
        verification="exact_sha",
        immutable=True,
        unchain_revision="a" * 40,
    )


def _initialize_unchain_store(data_dir: Path) -> Path:
    root = data_dir / "memory_v2"
    admission = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_UNCHAIN,
    )
    SQLiteContextV2Store(
        database_path=admission.database_path,
        object_directory=root / "objects",
    )
    return root


def _active_environment(data_dir: Path) -> dict[str, str]:
    return {
        "UNCHAIN_DATA_DIR": str(data_dir),
        "PUPU_CONTEXT_V2_STORE_OWNER": "unchain",
        "PUPU_FEATURE_MEMORY_V2": "all",
        "PUPU_MEMORY_V2_MODE": "all",
        "PUPU_MEMORY_V2_CANARY_PERCENT": "100",
    }


def _resolve(
    owner_chat_id: str,
    *,
    preflight: object = None,
    session_id: str = "session-a",
    attempt_id: str = "attempt-a",
):
    options = {
        "_memory_v2_requested": True,
        "_memory_v2_owner_chat_id": owner_chat_id,
        "_memory_v2_attempt_id": attempt_id,
    }
    if preflight is not None:
        options["_memory_v2_unchain_active_preflight"] = preflight
    with (
        mock.patch(
            "memory_v2_context.resolve_context_memory_v2_capability",
            return_value=_ready_capability(),
        ),
        mock.patch("memory_v2_context._load_runtime", return_value=None),
    ):
        return resolve_memory_v2_admission(
            options,
            provider="openai",
            model="gpt-test",
            real_context_window_tokens=200_000,
            session_id=session_id,
        )


def test_unchain_active_admission_is_closed_without_internal_preflight(
    tmp_path: Path,
) -> None:
    with mock.patch.dict(
        os.environ,
        _active_environment(tmp_path),
        clear=False,
    ):
        root = _initialize_unchain_store(tmp_path)
        admission = _resolve("chat-a")

    assert admission.is_shadow
    assert admission.reason == "memory_v2_runtime_unavailable"
    assert admission.runtime is None
    assert admission.admission_authority is None
    assert not (root / "context_v2.sqlite3").read_bytes() == b""


def test_unchain_active_admission_uses_sticky_authority_without_legacy_runtime(
    tmp_path: Path,
) -> None:
    with mock.patch.dict(
        os.environ,
        _active_environment(tmp_path),
        clear=False,
    ):
        _initialize_unchain_store(tmp_path)
        first = _resolve("chat-a", preflight=True)
        bootstrap = first.admission_authority.mark_chat_bootstrap(
            owner_chat_id="chat-a",
            admission_id=first.admission_id,
            expected_revision=first.admission_revision,
            succeeded=True,
            provenance={"receipt": "unchain-bootstrap-a"},
            error_code="",
            operation_id="admission-bootstrap:chat-a",
        )
        # Re-open the official store as a new sidecar would before resolving
        # the persisted host admission record.
        _initialize_unchain_store(tmp_path)
        restarted = _resolve(
            "chat-a",
            preflight=True,
            session_id="session-after-restart",
            attempt_id="attempt-after-restart",
        )

    assert first.is_active
    assert first.runtime is None
    assert first.admission_authority is not None
    assert not hasattr(first.admission_authority, "append_semantic_event")
    assert first.admission_id
    assert first.admission_sticky is False
    assert bootstrap["v2_bootstrapped"] is True
    assert bootstrap["effective_mode"] == "active"

    assert restarted.is_active
    assert restarted.runtime is None
    assert restarted.admission_id == first.admission_id
    assert restarted.admission_revision == first.admission_revision + 1
    assert restarted.admission_sticky is True
    assert restarted.v2_bootstrapped is True
    assert restarted.bootstrap_status == "complete"
    assert restarted.diagnostics()["admission_reused"] is True


def test_unchain_active_preflight_marker_requires_an_exact_boolean(
    tmp_path: Path,
) -> None:
    with mock.patch.dict(
        os.environ,
        _active_environment(tmp_path),
        clear=False,
    ):
        _initialize_unchain_store(tmp_path)
        with pytest.raises(TypeError, match="exact boolean"):
            _resolve("chat-a", preflight=1)


def test_unchain_admission_authority_fails_closed_on_scope_mismatch(
    tmp_path: Path,
) -> None:
    with mock.patch.dict(
        os.environ,
        _active_environment(tmp_path),
        clear=False,
    ):
        _initialize_unchain_store(tmp_path)
        authority = open_pupu_unchain_admission_authority(
            owner_chat_id="chat-a",
            preflight_complete=True,
        )
        with pytest.raises(PupuUnchainAdmissionScopeError, match="scope"):
            authority.get_chat_admission(owner_chat_id="chat-b")
