from __future__ import annotations

import copy
from types import SimpleNamespace

import pytest

from memory_v2_unchain_active_bridge import preflight_pupu_unchain_active_host
from memory_v2_unchain_admission_adapter import (
    PupuUnchainAdmissionError,
    open_pupu_unchain_admission_authority,
)
from memory_v2_unchain_atomic_bootstrap import (
    ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA,
)
from memory_v2_unchain_lazy_bootstrap import (
    PupuUnchainActiveLazyBootstrapError,
    bootstrap_pupu_unchain_active_chat,
)
from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
from unchain.memory import (
    MEMORY_CANDIDATE_PROPOSE,
    MEMORY_CONTEXT_READ,
    MEMORY_EXECUTION_COMPLETE,
    MEMORY_V2_MODULE_KEY,
    MEMORY_WORKSPACE_READ,
)
from unchain.runtime import ExecutionIdentity, ModuleGrant


def _setup(tmp_path, monkeypatch, *, history=()):
    monkeypatch.setenv("UNCHAIN_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("PUPU_CONTEXT_V2_STORE_OWNER", "unchain")
    run = PupuUnchainShadowRunDraft(
        session_id="session-a",
        identity=ExecutionIdentity(
            execution_id="execution-a",
            attempt_id="attempt-a",
            run_id="attempt-a",
            run_lineage=("attempt-a",),
        ),
        grant=ModuleGrant(
            module_key=MEMORY_V2_MODULE_KEY,
            capabilities=frozenset(
                {
                    MEMORY_CONTEXT_READ,
                    MEMORY_WORKSPACE_READ,
                    MEMORY_CANDIDATE_PROPOSE,
                    MEMORY_EXECUTION_COMPLETE,
                }
            ),
            delegable_capabilities=frozenset(
                {
                    MEMORY_CONTEXT_READ,
                    MEMORY_WORKSPACE_READ,
                    MEMORY_CANDIDATE_PROPOSE,
                }
            ),
            authority="completion-authority-a",
        ),
    )
    preflight = preflight_pupu_unchain_active_host(
        owner_chat_id="chat-a",
        run=run,
        bootstrap_history=history,
        no_unfinished_durable_checkpoint=True,
        no_pending_interaction=True,
        model_window_fallback=lambda _provider, _model: 16_384,
        partial_attempt_sink=lambda _value, _error: None,
    )
    authority = open_pupu_unchain_admission_authority(
        owner_chat_id="chat-a",
        preflight_complete=True,
    )
    record = authority.resolve_chat_admission(
        owner_chat_id="chat-a",
        session_id="session-a",
        requested_rollout_mode="all",
        effective_rollout_mode="all",
        cohort="all_active",
        target_mode="active",
        decision_reason="active_cutover",
        canary_selected=False,
        canary_percent=100,
        canary_bucket=1,
        hash_strategy="sha256_owner_v1",
        provenance={"source": "focused_test"},
        operation_id="admit-chat-a",
    )
    admission = SimpleNamespace(
        is_active=True,
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
        admission_id=record["admission_id"],
        admission_revision=record["revision"],
        v2_bootstrapped=record["v2_bootstrapped"],
        admission_authority=authority,
    )
    return preflight, admission, authority


def _bootstrap(preflight, admission):
    return bootstrap_pupu_unchain_active_chat(
        preflight=preflight,
        admission=admission,
    )


def _events(preflight):
    binding = preflight.preparation.binding
    return preflight.preparation.host_factory.context_store.bind_execution(
        binding.execution_id
    ).capture_snapshot().events


def test_atomic_history_is_only_verified_and_sticky_replay_adds_no_events(
    tmp_path,
    monkeypatch,
) -> None:
    history = (
        {"id": "message-a", "role": "user", "content": "Remember alpha"},
        {"id": "message-b", "role": "assistant", "content": "Alpha saved"},
    )
    preflight, admission, authority = _setup(
        tmp_path,
        monkeypatch,
        history=history,
    )
    before = _events(preflight)

    first = _bootstrap(preflight, admission)
    replay = _bootstrap(preflight, admission)

    after = _events(preflight)
    bootstrap = preflight.atomic_bootstrap
    assert first["status"] == "completed"
    assert first["message_count"] == 2
    assert first["bootstrap_generation_id"] == bootstrap.generation_id
    assert first["bootstrap_attempt_id"] == bootstrap.bootstrap_attempt_id
    assert first["attempt_id"] == "attempt-a"
    assert replay["status"] == "already_bootstrapped"
    assert replay["skipped"] is True
    assert after == before
    assert [event.payload["message"]["content"] for event in after] == [
        "Remember alpha",
        "Alpha saved",
    ]
    current = authority.get_chat_admission(owner_chat_id="chat-a")
    assert current["v2_bootstrapped"] is True
    assert current["bootstrap_status"] == "complete"
    assert current["bootstrap_provenance"] == bootstrap.provenance(
        runtime_attempt_id="attempt-a"
    )


def test_empty_atomic_bootstrap_marks_exact_provenance_without_lazy_writes(
    tmp_path,
    monkeypatch,
) -> None:
    preflight, admission, authority = _setup(tmp_path, monkeypatch)
    before = _events(preflight)

    result = _bootstrap(preflight, admission)

    after = _events(preflight)
    bootstrap = preflight.atomic_bootstrap
    current = authority.get_chat_admission(owner_chat_id="chat-a")
    assert result["status"] == "completed"
    assert result["history_state"] == "empty"
    assert result["message_count"] == 0
    assert result["atomic_bootstrap"]["manifest_sha256"] == (
        bootstrap.bootstrap_receipt.manifest_sha256
    )
    assert after == before
    assert current["bootstrap_provenance"] == bootstrap.provenance(
        runtime_attempt_id="attempt-a"
    )
    assert current["bootstrap_provenance"]["schema"] == (
        ATOMIC_BOOTSTRAP_PROVENANCE_SCHEMA
    )
    assert "legacy_bootstrap" not in current["bootstrap_provenance"]


@pytest.mark.parametrize(
    "changed",
    ("session_id", "attempt_id", "owner_chat_id"),
)
def test_admission_scope_mismatch_fails_without_lazy_writes(
    tmp_path,
    monkeypatch,
    changed,
) -> None:
    preflight, admission, authority = _setup(
        tmp_path,
        monkeypatch,
        history=({"role": "user", "content": "already atomic"},),
    )
    before = _events(preflight)
    setattr(admission, changed, f"wrong-{changed}")

    with pytest.raises(PupuUnchainActiveLazyBootstrapError, match="match"):
        _bootstrap(preflight, admission)

    assert _events(preflight) == before
    assert authority.get_chat_admission(owner_chat_id="chat-a")[
        "v2_bootstrapped"
    ] is False


def test_stale_atomic_preflight_fails_before_admission_cas(
    tmp_path,
    monkeypatch,
) -> None:
    preflight, admission, authority = _setup(tmp_path, monkeypatch)
    bootstrap = preflight.atomic_bootstrap
    service = preflight.preparation.host_factory.context_store
    with service._connect() as connection:
        connection.execute(
            "UPDATE host_generation_records SET revision=revision + 1 "
            "WHERE owner_chat_id=? AND execution_id=? AND session_id=?",
            ("chat-a", "execution-a", "session-a"),
        )

    with pytest.raises(PupuUnchainActiveLazyBootstrapError) as caught:
        _bootstrap(preflight, admission)

    assert caught.value.code == "context_v2_lazy_bootstrap_atomic_preflight_invalid"
    assert bootstrap.current_head.revision == 1
    assert authority.get_chat_admission(owner_chat_id="chat-a")[
        "v2_bootstrapped"
    ] is False


def test_admission_cas_failure_is_fail_closed_without_reimport(
    tmp_path,
    monkeypatch,
) -> None:
    preflight, admission, authority = _setup(
        tmp_path,
        monkeypatch,
        history=({"role": "user", "content": "durable atomically"},),
    )
    before = _events(preflight)
    real_mark = authority.mark_chat_bootstrap

    def fail_mark(**_kwargs):
        raise PupuUnchainAdmissionError(
            "context_v2_test_failure",
            "injected durable admission failure",
        )

    monkeypatch.setattr(authority, "mark_chat_bootstrap", fail_mark)
    with pytest.raises(PupuUnchainActiveLazyBootstrapError) as caught:
        _bootstrap(preflight, admission)

    assert caught.value.code == (
        "context_v2_lazy_bootstrap_admission_persistence_failed"
    )
    assert _events(preflight) == before
    assert authority.get_chat_admission(owner_chat_id="chat-a")[
        "v2_bootstrapped"
    ] is False

    monkeypatch.setattr(authority, "mark_chat_bootstrap", real_mark)
    recovered = _bootstrap(preflight, admission)
    assert recovered["status"] == "completed"
    assert _events(preflight) == before


def test_already_sticky_path_rejects_changed_atomic_provenance(
    tmp_path,
    monkeypatch,
) -> None:
    preflight, admission, authority = _setup(tmp_path, monkeypatch)
    _bootstrap(preflight, admission)
    current = authority.get_chat_admission(owner_chat_id="chat-a")
    tampered = copy.deepcopy(current)
    tampered["bootstrap_provenance"]["atomic_bootstrap"][
        "manifest_sha256"
    ] = "f" * 64
    monkeypatch.setattr(
        authority,
        "get_chat_admission",
        lambda **_kwargs: copy.deepcopy(tampered),
    )

    with pytest.raises(PupuUnchainActiveLazyBootstrapError) as caught:
        _bootstrap(preflight, admission)

    assert caught.value.code == "context_v2_lazy_bootstrap_provenance_invalid"
