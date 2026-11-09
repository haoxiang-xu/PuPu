"""Child input contract for native and upgraded legacy Start outputs."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import sys

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from skeleton_agent_runtime import PupuSkeletonAgentExecution
from test_skeleton_legacy_upgrade_save import apply, migrate, recipe
from skeleton_resource_store import SkeletonResourceStore


class _Plan:
    def __init__(self, document):
        self.document = document

    def snapshot(self):
        return {"nodes": self.document["nodes"]}


def _document(outputs):
    return {"nodes": [{"id": "start", "type": "start", "config": {
        "execution": {"outputs": outputs},
    }}]}


def _output(name, kind="result", path=None):
    return {"name": name, "source": {"kind": kind, "path": [name] if path is None else path}}


def _inputs(outputs, messages="delegated"):
    return PupuSkeletonAgentExecution._child_inputs(_Plan(_document(outputs)), messages)


def test_named_outputs_keep_the_shared_delegated_text_for_strings_and_message_lists():
    assert _inputs([_output("question"), _output("notes")], "plain text") == {
        "question": "plain text", "notes": "plain text",
    }
    assert _inputs([_output("question"), _output("notes")], [
        {"role": "user", "content": "first"}, {"role": "assistant", "content": "second"},
    ]) == {"question": "first\nsecond", "notes": "first\nsecond"}


def test_adds_one_message_alias_for_explicit_result_message_path():
    outputs = [_output("question", path=["message", "content"]), _output("notes")]
    assert _inputs(outputs, "delegated") == {
        "question": "delegated", "notes": "delegated", "message": "delegated",
    }


def test_existing_named_message_is_never_overwritten_and_alias_is_not_duplicated():
    outputs = [
        _output("message", path=["message"]),
        _output("question", path=["message", "text"]),
        _output("other", path=["message", "content"]),
    ]
    assert _inputs(outputs, "delegated") == {
        "message": "delegated", "question": "delegated", "other": "delegated",
    }


@pytest.mark.parametrize("outputs", [
    [_output("message", kind="input", path=["message"])],
    [_output("answer", path=[])],
    [_output("answer", path=["answer"])],
    [_output("answer", path=["result", "message"])],
    [_output("answer", path=[None, "message"])],
    [_output("answer", path="message")],
    [{"name": "answer", "source": {"kind": "result", "path": "message"}}],
])
def test_whole_result_nonmessage_and_nonlist_paths_keep_the_old_shape(outputs):
    assert _inputs(outputs, "delegated") == {item["name"]: "delegated" for item in outputs}


def test_multiple_explicit_message_aliases_still_add_only_the_single_message_key():
    outputs = [
        _output("first", path=["message"]),
        _output("second", path=["message", "text"]),
        _output("third", path=["message", "content"]),
    ]
    assert _inputs(outputs, "delegated") == {
        "first": "delegated", "second": "delegated", "third": "delegated", "message": "delegated",
    }


def test_upgraded_store_child_exports_message_without_changing_name_mapped_inputs(tmp_path):
    store = SkeletonResourceStore(tmp_path / "resources")
    legacy_child = recipe("Child")
    resource, choices = migrate(store, legacy_child)
    upgraded, _preview = apply(store, resource, choices)
    start = next(node for node in upgraded["document"]["nodes"] if node["type"] == "start")
    outputs = start["config"]["execution"]["outputs"]
    assert outputs[0] == {
        "name": "text", "source": {"kind": "result", "path": ["message"]},
    }
    expected = {row["name"]: "delegated" for row in outputs}
    expected["message"] = "delegated"
    assert PupuSkeletonAgentExecution._child_inputs(_Plan(upgraded["document"]), "delegated") == expected


def test_message_and_plan_data_are_not_mutated():
    outputs = [_output("question", path=["message"]), _output("notes")]
    document = _document(outputs)
    messages = [{"role": "user", "content": "first"}, {"role": "user", "content": "second"}]
    before_document = deepcopy(document)
    before_messages = deepcopy(messages)
    assert PupuSkeletonAgentExecution._child_inputs(_Plan(document), messages) == {
        "question": "first\nsecond", "notes": "first\nsecond", "message": "first\nsecond",
    }
    assert document == before_document
    assert messages == before_messages
