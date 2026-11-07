"""Cold Skeleton launch admission reads must not initialize or repair storage."""
from pathlib import Path
from contextlib import closing
import json
import os
import sqlite3

import pytest
import unchain_adapter as adapter
from durable_interaction_host import DurableInteractionHostError
from skeleton_production_state import load_launch, load_active_launch
from test_skeleton_production_chat import production
from unchain.persistence import SQLiteContextV2Store
from unchain.persistence.sqlite_generation_rebase_v2 import SQLiteGenerationRebaseV2Service
from memory_v2_unchain_admission_adapter import PupuUnchainAdmissionAuthority


def _run(options):
    list(adapter.stream_chat_events(message="fixed readonly admission", history=[], options=options,
        session_id="readonly-session", attempt_id="readonly-root"))


def _bytes():
    root = Path(os.environ["UNCHAIN_DATA_DIR"])
    return {str(path.relative_to(root)): path.read_bytes() for path in root.rglob("*") if path.is_file()}


def _forbid_mutable(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("cold launch constructed a mutable store/admission/service or SDK")
    for kind in (SQLiteContextV2Store, PupuUnchainAdmissionAuthority, SQLiteGenerationRebaseV2Service):
        monkeypatch.setattr(kind, "__init__", forbidden)
    import openai
    monkeypatch.setattr(openai, "OpenAI", forbidden)


def test_verified_cold_launch_preserves_every_byte_and_uses_no_mutable_ctor(production, monkeypatch):
    _store, options, calls = production
    _run(options)
    baseline = _bytes()
    _forbid_mutable(monkeypatch)
    restored = load_launch("readonly-session", "readonly-root", expected_owner_chat_id="production-chat")
    assert restored.store.load().state["root_committed"] is True
    assert load_active_launch("readonly-session").descriptor == restored.descriptor
    assert _bytes() == baseline
    assert len(calls) == 1


@pytest.mark.parametrize("mutation", ["owner_manifest_missing", "sticky_schema", "provenance_receipt", "generation_heads", "root_binding_missing"])
def test_corrupt_actual_admission_rejects_without_repair_or_mutable_ctor(production, monkeypatch, mutation):
    _store, options, calls = production
    _run(options)
    root = Path(os.environ["UNCHAIN_DATA_DIR"]) / "memory_v2"
    if mutation == "owner_manifest_missing":
        (root / "context_v2.owner.json").unlink()
    else:
        with closing(sqlite3.connect(root / "context_v2.sqlite3")) as connection:
            if mutation == "sticky_schema":
                connection.execute("UPDATE pupu_context_v2_admissions SET schema_version=999 WHERE owner_chat_id=?", ("production-chat",))
            elif mutation == "provenance_receipt":
                row = connection.execute("SELECT bootstrap_provenance_json FROM pupu_context_v2_admissions WHERE owner_chat_id=?", ("production-chat",)).fetchone()
                provenance = json.loads(row[0])
                provenance["atomic_bootstrap"]["manifest_sha256"] = "0" * 64
                connection.execute("UPDATE pupu_context_v2_admissions SET bootstrap_provenance_json=? WHERE owner_chat_id=?", (json.dumps(provenance), "production-chat"))
            elif mutation == "generation_heads":
                connection.execute("UPDATE legacy_bootstrap_chat_heads SET head_revision=head_revision+1 WHERE owner_chat_id=?", ("production-chat",))
            else:
                connection.execute("DELETE FROM host_generation_attempt_bindings WHERE owner_chat_id=? AND attempt_id=?", ("production-chat", "readonly-root"))
            connection.commit()
    baseline = _bytes()
    _forbid_mutable(monkeypatch)
    with pytest.raises(DurableInteractionHostError) as rejected:
        load_launch("readonly-session", "readonly-root", allow_terminal_stale=True)
    assert rejected.value.code == ("skeleton_launch_generation_mismatch" if mutation == "root_binding_missing" else "skeleton_launch_admission_missing")
    assert _bytes() == baseline
    assert len(calls) == 1


def test_verified_terminal_launch_after_genuine_rebase_is_opt_in_and_read_only(production, monkeypatch):
    from memory_v2_unchain_generation_api import open_pupu_unchain_generation_api
    _store, options, calls = production
    _run(options)
    original = load_launch("readonly-session", "readonly-root")
    api = open_pupu_unchain_generation_api(root_dir=Path(os.environ["UNCHAIN_DATA_DIR"]) / "memory_v2",
        owner_chat_id="production-chat")
    head = api.get_session_head(owner_chat_id="production-chat", session_id="readonly-session")
    changed = api.rebase_session(owner_chat_id="production-chat", session_id="readonly-session",
        replacement_history=[{"role": "user", "content": "edited root history"}],
        source_generation_id=head["current_generation_id"], expected_session_revision=head["session_revision"],
        operation_id="readonly-real-edit", reason="edit")
    assert changed["generation_id"] != original.descriptor["binding"]["generation_id"]
    baseline = _bytes()
    _forbid_mutable(monkeypatch)
    with pytest.raises(DurableInteractionHostError) as strict:
        load_active_launch("readonly-session")
    assert strict.value.code == "skeleton_launch_generation_mismatch"
    restored = load_active_launch("readonly-session", allow_terminal_stale=True)
    assert restored.descriptor == original.descriptor
    assert restored.store.load().state["status"] == "completed"
    assert _bytes() == baseline
    assert len(calls) == 1


def test_terminal_stale_opt_in_does_not_skip_owner_or_admission(production, monkeypatch):
    _store, options, _calls = production
    _run(options)
    baseline = _bytes()
    _forbid_mutable(monkeypatch)
    with pytest.raises(DurableInteractionHostError) as rejected:
        load_launch("readonly-session", "readonly-root", expected_owner_chat_id="foreign-chat", allow_terminal_stale=True)
    assert rejected.value.code == "skeleton_launch_owner_mismatch"
    assert _bytes() == baseline
