"""Freeze admitted published Workflow bodies for a host-owned resolver.

This is definition admission only, not a durable run or an environment snapshot.
The returned resolver never reads the resource store after construction.
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import re
from typing import Any

from unchain.skeleton import prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.execution import _validate_all
from unchain.skeleton.workflow_runtime import PublishedWorkflow

from skeleton_chat_selection import FrozenSkeletonChatSelection, _check_preflight
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore


_SNAPSHOT_SCHEMA = "pupu.skeleton_workflow_snapshot.v1"
_VERSION_FIELDS = frozenset({
    "workflow_id", "revision_id", "ordinal", "definition_digest", "document", "dependencies",
})
_DEPENDENCY_FIELDS = frozenset({"workflow_id", "revision_id", "definition_digest"})
_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def _snapshot_invalid(path: tuple) -> None:
    raise SkeletonResourceError(
        "skeleton_dependency_snapshot_invalid", path,
        "Published Workflow snapshot has an invalid shape.", status=503,
    )


def _snapshot_conflict(path: tuple) -> None:
    raise SkeletonResourceError(
        "dependency_conflict", path,
        "Published Workflow dependencies differ from the admitted selection.", status=409,
    )


def _dependency_metadata(value: Any, path: tuple) -> dict[tuple[str, str], str]:
    if type(value) is not list or len(value) > 256:
        _snapshot_invalid(path)
    result = {}
    for index, item in enumerate(value):
        item_path = path + (index,)
        if type(item) is not dict or set(item) != _DEPENDENCY_FIELDS:
            _snapshot_invalid(item_path)
        if any(type(item[field]) is not str or not item[field]
               for field in _DEPENDENCY_FIELDS):
            _snapshot_invalid(item_path)
        if _DIGEST.fullmatch(item["definition_digest"]) is None:
            _snapshot_invalid(item_path + ("definition_digest",))
        key = (item["workflow_id"], item["revision_id"])
        if key in result:
            _snapshot_invalid(item_path)
        result[key] = item["definition_digest"]
    return result


def _workflow_references(document: dict) -> set[tuple[str, str]]:
    # Documents have already passed actual core graph/config admission. Scan the
    # bodies independently of the Store's metadata collector.
    result = set()
    for node in document["nodes"]:
        references = []
        if node["type"] == "workflow_call":
            references.append(node["config"]["workflow"])
        elif node["type"] == "hooks_pool":
            references.extend(hook["workflow"] for hook in node["config"]["hooks"])
        result.update((ref["workflow_id"], ref["revision_id"]) for ref in references)
    return result


def _selection_references(value: dict, *, execution_frames: int = 1,
                          ancestors: tuple[str, ...] = ()) -> dict[tuple[str, str], set]:
    # Every selected graph contributes a runtime frame, including embedded
    # Agent graphs whose ids need not be resource-store identities.
    owner_id = value["document"]["id"]
    placement = (execution_frames + 1, ancestors + (owner_id,))
    result = {key: {placement} for key in _workflow_references(value["document"])}
    for child in value["subagents"]:
        for key, placements in _selection_references(
                child, execution_frames=execution_frames + 1,
                ancestors=ancestors + (owner_id,)).items():
            result.setdefault(key, set()).update(placements)
    return result


@dataclass(frozen=True)
class FrozenSkeletonWorkflowDependencies:
    """Canonical bytes of admitted definitions; no store or live fallback."""

    _canonical_json: bytes

    def to_dict(self) -> dict[str, Any]:
        return json.loads(self._canonical_json)

    @property
    def dependencies(self) -> list[dict[str, str]]:
        return [{field: record[field] for field in _DEPENDENCY_FIELDS}
                for record in self.to_dict()["workflows"]]

    @property
    def snapshot_digest(self) -> str:
        return sha256(self._canonical_json).hexdigest()

    def resolve(self, workflow_id: str, revision_id: str) -> PublishedWorkflow:
        for record in self.to_dict()["workflows"]:
            if record["workflow_id"] == workflow_id and record["revision_id"] == revision_id:
                return PublishedWorkflow(workflow_id, revision_id, record["document"])
        raise SkeletonValidationError(
            "resource_unavailable", ("workflow",),
            "published Workflow revision is not in the admitted snapshot",
        )


def freeze_skeleton_workflow_dependencies(selection, *, store=None):
    """Validate exact selected metadata against retained published bodies.

    A metadata omission never expands the selection silently. Each reachable
    version is read once; every persisted dependency list must match that body's
    full transitive closure before the immutable resolver is returned.
    """
    try:
        if type(selection) is not FrozenSkeletonChatSelection:
            _snapshot_invalid(("selection",))
        selected = selection.to_dict()
        try:
            _check_preflight(selected, selection.resource_id)
        except (SkeletonResourceError, SkeletonValidationError):
            _snapshot_invalid(("selection",))
        metadata = _dependency_metadata(selected["dependencies"], ("dependencies",))
        roots = _selection_references(selected)
        if not roots.keys() <= metadata.keys():
            _snapshot_conflict(("dependencies",))
        store = SkeletonResourceStore() if store is None else store
        records: dict[tuple[str, str], dict] = {}
        descendants: dict[tuple[str, str], set[tuple[str, str]]] = {}
        heights: dict[tuple[str, str], int] = {}

        def visit(key: tuple[str, str], *, depth: int, ancestors: tuple[str, ...]) -> set:
            path = ("dependencies", key[0], key[1])
            if key not in metadata or key[0] in ancestors or depth > 32:
                _snapshot_conflict(path)
            if key in descendants:
                ids = {pair[0] for pair in descendants[key]}
                if ids.intersection(ancestors) or depth + heights[key] - 1 > 32:
                    _snapshot_conflict(path)
                return descendants[key]
            version = store.get_workflow_version(*key)
            if type(version) is not dict or set(version) != _VERSION_FIELDS:
                _snapshot_invalid(path)
            if type(version["ordinal"]) is not int or version["ordinal"] <= 0:
                _snapshot_invalid(path + ("ordinal",))
            if (version["workflow_id"] != key[0] or version["revision_id"] != key[1]
                    or version["definition_digest"] != metadata[key]):
                _snapshot_conflict(path)
            try:
                plan = prepare_workflow(version["document"])
                _validate_all(plan.snapshot())
            except SkeletonValidationError:
                _snapshot_invalid(path + ("document",))
            if (plan.document_id != key[0]
                    or execution_definition_digest(plan) != metadata[key]):
                _snapshot_conflict(path + ("document",))
            declared = _dependency_metadata(version["dependencies"], path + ("dependencies",))
            if any(metadata.get(pair) != digest for pair, digest in declared.items()):
                _snapshot_conflict(path + ("dependencies",))
            direct = _workflow_references(plan.snapshot())
            if not direct <= metadata.keys():
                _snapshot_conflict(path + ("document",))
            actual = set(direct)
            height = 1
            for pair in sorted(direct):
                actual.update(visit(pair, depth=depth + 1, ancestors=ancestors + (key[0],)))
                height = max(height, heights[pair] + 1)
            if set(declared) != actual:
                _snapshot_conflict(path + ("dependencies",))
            records[key] = {
                "workflow_id": key[0], "revision_id": key[1],
                "definition_digest": metadata[key], "document": version["document"],
            }
            descendants[key] = actual
            heights[key] = height
            return actual

        for key in sorted(roots):
            for depth, ancestors in sorted(roots[key]):
                visit(key, depth=depth, ancestors=ancestors)
        if set(records) != set(metadata):
            _snapshot_conflict(("dependencies",))
        frame = {"schema": _SNAPSHOT_SCHEMA,
                 "workflows": [records[key] for key in sorted(records)]}
        canonical = json.dumps(frame, sort_keys=True, separators=(",", ":"),
                               ensure_ascii=False, allow_nan=False).encode("utf-8", "surrogatepass")
        return FrozenSkeletonWorkflowDependencies(canonical)
    except SkeletonResourceError:
        raise
    except Exception:
        raise SkeletonResourceError(
            "skeleton_dependency_snapshot_failed", ("dependencies",),
            "Published Workflow snapshot could not be prepared.", status=503,
        ) from None
