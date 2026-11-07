"""Production launch consumer: exact bytes, binding, input and cold authority."""
from copy import deepcopy
import json
import pytest
from test_skeleton_production_chat import production
import unchain_adapter as adapter
from skeleton_production_state import load_launch, validate_launch_descriptor, _path
from durable_interaction_host import DurableInteractionHostError


def test_launch_closed_consumer_rejects_changed_identity_inputs_and_capabilities(production):
    _, options, calls = production
    list(adapter.stream_chat_events(message="fixed input", history=[], options=options,
        session_id="state-session", attempt_id="state-root"))
    launch = load_launch("state-session", "state-root")
    baseline = launch.descriptor
    validate_launch_descriptor(baseline, session_id="state-session", root_run_id="state-root")
    mutants = []
    for field, value in (("schema", "future.v9"), ("root_run_id", "other"), ("session_id", "other"),
                         ("unexpected", True), ("workspace_root", "relative"), ("inputs", {}), ("attachments", [{}])):
        changed = deepcopy(baseline); changed[field] = value; mutants.append(changed)
    for field, value in (("message", "changed input"), ("files", [{"unknown": True}]), ("extra", True)):
        changed = deepcopy(baseline); changed["inputs"][field] = value; mutants.append(changed)
    for field, value in (("toolkits", ["core", "core"]), ("include_user_dirs", "yes"), ("extra", True)):
        changed = deepcopy(baseline); changed["capabilities"][field] = value; mutants.append(changed)
    changed = deepcopy(baseline); changed["binding"]["identity"]["run_id"] = "other"; mutants.append(changed)
    for changed in mutants:
        with pytest.raises((DurableInteractionHostError, TypeError, ValueError)):
            validate_launch_descriptor(changed, session_id="state-session", root_run_id="state-root")
    with pytest.raises(DurableInteractionHostError):
        load_launch("state-session", "state-root", expected_owner_chat_id="another-chat")
    assert len(calls) == 1


def test_local_pointer_is_locator_and_cannot_replace_journal_authority(production):
    _, options, calls = production
    list(adapter.stream_chat_events(message="fixed input", history=[], options=options,
        session_id="pointer-session", attempt_id="pointer-root"))
    path = _path("pointer-session", "pointer-root")
    original = path.read_bytes()
    pointer = json.loads(original)
    pointer["launch_sha256"] = "0" * 64
    path.write_text(json.dumps(pointer))
    with pytest.raises(DurableInteractionHostError): load_launch("pointer-session", "pointer-root")
    path.write_bytes(original)
    launch = load_launch("pointer-session", "pointer-root")
    assert launch.store.load().state["root_committed"] is True and len(calls) == 1
