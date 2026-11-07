"""BC-356-SHAREDQA-01: shared edits and actual retained launch artifacts.

Source host + fixed installed runtime, disposable stores and offline SDK only.
This proves closure retention, not actual child delegation, desktop, HTTP or
cross-process resumption. Dependencies is Workflow metadata, not Agent refs.
"""
from copy import deepcopy
from hashlib import sha256

import pytest
import unchain_adapter as adapter
from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_production_state import load_launch, validate_launch_descriptor
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_chat_selection import _rows
from test_skeleton_production_chat import production  # real isolated public-entry fixture
from test_skeleton_resource_store import agent
from unchain.journal import ArtifactRef


def _selection(store, resource_id):
    return prepare_skeleton_chat_selection({"skeleton_selection": {
        "schema": "pupu.skeleton_chat_selection.v1", "kind": "resource",
        "resource_id": resource_id}}, store=store)


def _prompt(document):
    return next(n for n in document["nodes"] if n["type"] == "agent")["config"]["kernel"]["prompt"]


def _with_prompt(document, text):
    changed = deepcopy(document)
    next(n for n in changed["nodes"] if n["type"] == "agent")["config"]["kernel"]["prompt"] = text
    return changed


def _launch_receipt(launch):
    events = [e for e in launch.journal.capture_snapshot().events
              if e.event_type == "pupu.skeleton.launch" and e.attempt == launch.store.attempt]
    assert len(events) == 1
    event = events[0]
    artifact = ArtifactRef.from_dict(dict(event.payload["launch_ref"]))
    raw = launch.journal.read_full_verified(artifact=artifact)
    assert sha256(raw).hexdigest() == event.payload["launch_sha256"]
    return raw, event.to_dict()


def _conflict_does_not_write(store, document, token):
    before = _rows(store)
    with pytest.raises(SkeletonResourceError) as conflict:
        store.save_draft(document, expected_edit_token=token)
    assert (conflict.value.code, conflict.value.status, conflict.value.path) == (
        "edit_conflict", 409, ("expected_edit_token",))
    assert _rows(store) == before  # every persisted table, not only child text


def test_two_parents_observe_shared_child_cas_but_real_launch_keeps_original(production, monkeypatch):
    store, options, calls = production
    child = store.save_draft(_with_prompt(agent("constructor", "Same display name"), "child before"))
    parents = {}
    for resource_id in ("parent-a", "parent-b"):
        document = agent(resource_id, "Same display name", child_source={
            "kind": "agent_ref", "agent_id": child["id"]})
        document["nodes"][-1]["config"]["subagents"][0]["name"] = resource_id + " local label"
        parents[resource_id] = store.save_draft(document)
    editor_a = SkeletonResourceStore(store.root)
    editor_b = SkeletonResourceStore(store.root)
    a, b = editor_a.get_resource(child["id"]), editor_b.get_resource(child["id"])
    assert a["edit_token"] == b["edit_token"] == child["edit_token"]
    before_selections = {key: _selection(store, key) for key in parents}
    before = {key: selection.to_dict() for key, selection in before_selections.items()}
    assert all(value["dependencies"] == [] for value in before.values())

    options["skeleton_selection"]["resource_id"] = "parent-a"
    events = list(adapter.stream_chat_events(message="retain shared closure", history=[], options=options,
        session_id="shared-cas-session", attempt_id="shared-cas-root"))
    finals = [e for e in events if e.get("type") == "final_message" and e.get("scope") == "root"]
    assert len(finals) == 1 and finals[0]["content"] == "End production reply"
    assert len(calls) == 1
    launch = load_launch("shared-cas-session", "shared-cas-root", expected_owner_chat_id="production-chat")
    assert launch.store.load().state["status"] == "completed"
    descriptor, retained = deepcopy(launch.descriptor), launch.selection.to_dict()
    artifact_bytes, receipt = _launch_receipt(launch)
    assert retained == before["parent-a"]

    accepted = editor_a.save_draft(_with_prompt(a["document"], "child saved by A"), expected_edit_token=a["edit_token"])
    _conflict_does_not_write(editor_b, _with_prompt(b["document"], "stale B must not win"), b["edit_token"])
    assert _prompt(store.get_resource(child["id"])["document"]) == "child saved by A"
    after_selections = {key: _selection(SkeletonResourceStore(store.root), key) for key in parents}
    after = {key: selection.to_dict() for key, selection in after_selections.items()}
    for key in parents:
        assert store.get_resource(key) == parents[key]
        assert after[key]["document"] == before[key]["document"]
        assert after[key]["edit_token"] == before[key]["edit_token"]
        assert after[key]["definition_digest"] == before[key]["definition_digest"]
        assert after_selections[key].snapshot_digest != before_selections[key].snapshot_digest
        assert after[key]["dependencies"] == before[key]["dependencies"] == []
        assert len(before[key]["subagents"]) == len(after[key]["subagents"]) == 1
        previous, current = before[key]["subagents"][0], after[key]["subagents"][0]
        assert previous["agent_id"] == current["agent_id"] == "constructor"
        assert current["edit_token"] == accepted["edit_token"] != previous["edit_token"]
        assert current["definition_digest"] != previous["definition_digest"]
        assert _prompt(current["document"]) == "child saved by A"

    # A strict retained launch read must not resolve the latest resource again.
    with monkeypatch.context() as context:
        def forbidden(*args, **kwargs):
            pytest.fail("retained launch looked up mutable resource state")
        for method in ("get_resource", "resolve", "preflight"):
            context.setattr(SkeletonResourceStore, method, forbidden)
        loaded = load_launch("shared-cas-session", "shared-cas-root", expected_owner_chat_id="production-chat")
        assert loaded.descriptor == descriptor and loaded.selection.to_dict() == retained
        assert _launch_receipt(loaded) == (artifact_bytes, receipt)
    assert len(calls) == 1

    # Explicitly re-read and save; no automatic token adoption/retry.
    rebased = editor_b.get_resource(child["id"])
    assert rebased["edit_token"] == accepted["edit_token"]
    editor_b.save_draft(_with_prompt(rebased["document"], "B continued on A"), expected_edit_token=rebased["edit_token"])
    assert _prompt(store.get_resource(child["id"])["document"]) == "B continued on A"
    loaded = load_launch("shared-cas-session", "shared-cas-root", expected_owner_chat_id="production-chat")
    assert loaded.descriptor == descriptor and _launch_receipt(loaded) == (artifact_bytes, receipt)
    assert len(calls) == 1

    # True strict consumer, not an assertion against our own copied object.
    for mutate in ("document", "digest"):
        forged = deepcopy(descriptor)
        entry = forged["selection"]["subagents"][0]
        if mutate == "document": entry["document"] = _with_prompt(entry["document"], "forged child")
        else:
            digest = entry["definition_digest"]
            entry["definition_digest"] = digest[:-1] + ("0" if digest[-1] != "0" else "1")
        with pytest.raises(SkeletonResourceError) as refused:
            validate_launch_descriptor(forged, session_id="shared-cas-session", root_run_id="shared-cas-root")
        assert (refused.value.code, refused.value.status, refused.value.path) == (
            "skeleton_chat_admission_failed", 503, ("preflight", "subagents", 0, "definition_digest"))


def test_embedded_edit_cas_targets_parent_without_writing_shared_child(production):
    store, _options, calls = production
    shared = store.save_draft(agent("constructor", "Shared child"))
    sibling_parent = store.save_draft(agent("unrelated-parent", child_source={"kind": "agent_ref", "agent_id": shared["id"]}))
    document = agent("embedded-parent", child_source={"kind": "embedded", "document": agent("embedded-only", "Embedded")})
    entries = document["nodes"][-1]["config"]["subagents"]
    referenced = deepcopy(entries[0]); referenced.update(id="shared", name="Shared")
    referenced["source"] = {"kind": "agent_ref", "agent_id": shared["id"]}
    entries.append(referenced)
    initial = store.save_draft(document)
    a, b = SkeletonResourceStore(store.root), SkeletonResourceStore(store.root)
    first, second = a.get_resource(initial["id"]), b.get_resource(initial["id"])
    changed = deepcopy(first["document"])
    embedded = changed["nodes"][-1]["config"]["subagents"][0]["source"]
    embedded["document"] = _with_prompt(embedded["document"], "embedded edit by A")
    accepted = a.save_draft(changed, expected_edit_token=first["edit_token"])
    _conflict_does_not_write(b, second["document"], second["edit_token"])
    assert store.get_resource(initial["id"])["document"] == changed
    assert store.get_resource(shared["id"]) == shared
    assert store.get_resource(sibling_parent["id"]) == sibling_parent
    assert changed["nodes"][-1]["config"]["subagents"][1] == document["nodes"][-1]["config"]["subagents"][1]
    with pytest.raises(SkeletonResourceError) as missing:
        store.get_resource("embedded-only")
    assert missing.value.code == "resource_missing"
    current = b.get_resource(initial["id"])
    assert current["edit_token"] == accepted["edit_token"]
    continued = deepcopy(current["document"]); continued["description"] = "B continued after explicit reload"
    b.save_draft(continued, expected_edit_token=current["edit_token"])
    assert store.get_resource(initial["id"])["document"] == continued
    assert store.get_resource(shared["id"]) == shared and store.get_resource(sibling_parent["id"]) == sibling_parent
    assert calls == []
