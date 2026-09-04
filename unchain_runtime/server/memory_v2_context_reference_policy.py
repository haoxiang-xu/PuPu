"""Strict PuPu authorization for Unchain semantic journal references.

Unchain owns the provider-neutral declaration of which event payload paths are
reference slots.  This product boundary decodes values found only at those
exact slots, requires an equal same-event declaration, and delegates scope and
existence checks to the already-bound workspace reference authorizer.
"""

from __future__ import annotations

import copy
from collections.abc import Callable, Mapping, Sequence
from threading import Lock
from typing import Any

from context_memory_v2_repository import (
    PupuExecutionCapabilities,
    PupuExecutionJournal,
    PupuRefCodec,
)
from memory_v2_workspace_adapter import PupuWorkspaceReferenceAuthorizer
from unchain.context.semantic_refs import SemanticRefGroup, semantic_ref_contract
from unchain.journal import ArtifactRef, JournalAppendRequest, JournalEvent, ResourceRef
from unchain.journal.ports import JournalScopeError
from unchain.memory.workspace.ports import (
    RepositoryNotFoundError,
    WorkspaceRepositoryError,
)


PartialAttemptSink = Callable[[str, object, Exception], None]
_MISSING = object()
_POLICY_ERROR_CODES = frozenset(
    {"contract_invalid", "unauthorized", "authorizer_unavailable"}
)
_MAX_REF_DESCRIPTOR_DEPTH = 16
_MAX_REF_IDENTITY_NODES = 32


class PupuContextReferencePolicyError(JournalScopeError):
    """A semantic reference was malformed, undeclared, or outside authority."""

    def __init__(self, message: str, *, code: str) -> None:
        if code not in _POLICY_ERROR_CODES:
            raise ValueError("unsupported context reference policy error code")
        super().__init__(message)
        self.code = code


def _path_value(payload: Mapping[str, Any], path: tuple[str, ...]) -> Any:
    current: Any = payload
    for segment in path:
        if not isinstance(current, Mapping) or segment not in current:
            return _MISSING
        current = current[segment]
    return current


def _decode_ref(value: Any, *, path: tuple[str, ...]) -> ResourceRef:
    identity_nodes = 0

    def claim_identity_nodes(count: int = 1) -> None:
        nonlocal identity_nodes
        identity_nodes += count
        if identity_nodes > _MAX_REF_IDENTITY_NODES:
            raise PupuContextReferencePolicyError(
                "semantic reference descriptor exceeds the identity node limit",
                code="contract_invalid",
            )

    def decode(candidate: Any, *, depth: int) -> ResourceRef:
        if depth > _MAX_REF_DESCRIPTOR_DEPTH:
            raise PupuContextReferencePolicyError(
                "semantic reference descriptor exceeds the nesting limit",
                code="contract_invalid",
            )
        if isinstance(candidate, ResourceRef):
            claim_identity_nodes()
            return candidate
        if isinstance(candidate, str):
            claim_identity_nodes()
            return PupuRefCodec.decode(candidate)
        if not isinstance(candidate, Mapping):
            raise TypeError("reference value must be an object or canonical URI")

        claim_identity_nodes()
        candidates: list[tuple[str, ResourceRef]] = []
        schema = candidate.get("schema")
        if schema == ArtifactRef.SCHEMA:
            claim_identity_nodes()
            candidates.append(
                ("artifact descriptor", ArtifactRef.from_dict(candidate).ref)
            )
        elif schema == ResourceRef.SCHEMA:
            claim_identity_nodes()
            candidates.append(
                ("resource descriptor", ResourceRef.from_dict(candidate))
            )

        if "uri" in candidate:
            uri = candidate.get("uri")
            if not isinstance(uri, str):
                raise TypeError("reference descriptor uri must be text")
            claim_identity_nodes()
            candidates.append(("uri", PupuRefCodec.decode(uri)))
        if "ref" in candidate:
            candidates.append(
                ("ref", decode(candidate["ref"], depth=depth + 1))
            )

        id_values = [
            (field_name, candidate[field_name])
            for field_name in ("id", "resource_id")
            if field_name in candidate
        ]
        if len(id_values) == 2 and id_values[0][1] != id_values[1][1]:
            raise ValueError("reference descriptor identities disagree")
        has_inline_identity = "kind" in candidate or bool(id_values)
        if has_inline_identity:
            if "kind" not in candidate or not id_values or "revision" not in candidate:
                raise ValueError("inline reference identity is incomplete")
            claim_identity_nodes()
            candidates.append(
                (
                    "inline identity",
                    ResourceRef(
                        kind=candidate["kind"],
                        resource_id=id_values[0][1],
                        revision=candidate["revision"],
                        fragment=candidate.get("fragment", ""),
                    ),
                )
            )

        if not candidates:
            raise ValueError("reference descriptor has no identity")
        expected = candidates[0][1]
        if any(item != expected for _name, item in candidates[1:]):
            raise ValueError("reference descriptor identities disagree")

        scalar_identity = {
            "kind": expected.kind,
            "revision": expected.revision,
            "fragment": expected.fragment,
        }
        for field_name, expected_value in scalar_identity.items():
            if field_name in candidate and candidate[field_name] != expected_value:
                raise ValueError("reference descriptor identities disagree")
        for _field_name, identifier in id_values:
            if identifier != expected.resource_id:
                raise ValueError("reference descriptor identities disagree")
        return expected

    try:
        return decode(value, depth=0)
    except PupuContextReferencePolicyError:
        raise
    except (RecursionError, TypeError, ValueError) as exc:
        rendered = ".".join(path)
        raise PupuContextReferencePolicyError(
            "semantic reference at "
            f"{rendered} is malformed or has disagreeing identities",
            code="contract_invalid",
        ) from exc


def _group_refs(
    payload: Mapping[str, Any],
    group: SemanticRefGroup,
) -> tuple[ResourceRef, ...]:
    aliases: list[tuple[tuple[str, ...], tuple[ResourceRef, ...]]] = []
    for path in group.paths:
        value = _path_value(payload, path)
        if value is _MISSING:
            continue
        if group.repeated:
            if not isinstance(value, Sequence) or isinstance(
                value,
                (str, bytes, bytearray),
            ):
                raise PupuContextReferencePolicyError(
                    f"semantic reference group {group.name} must be an array",
                    code="contract_invalid",
                )
            refs = tuple(_decode_ref(item, path=path) for item in value)
            if len(set(refs)) != len(refs):
                raise PupuContextReferencePolicyError(
                    f"semantic reference group {group.name} contains duplicates",
                    code="contract_invalid",
                )
        else:
            refs = (_decode_ref(value, path=path),)
        if any(ref.kind not in group.allowed_kinds for ref in refs):
            raise PupuContextReferencePolicyError(
                f"semantic reference group {group.name} has a disallowed kind",
                code="contract_invalid",
            )
        aliases.append((path, refs))
    if not aliases:
        if group.required:
            raise PupuContextReferencePolicyError(
                f"required semantic reference group {group.name} is missing",
                code="contract_invalid",
            )
        return ()
    expected = aliases[0][1]
    if any(refs != expected for _path, refs in aliases[1:]):
        raise PupuContextReferencePolicyError(
            f"semantic reference aliases for {group.name} disagree",
            code="contract_invalid",
        )
    return expected


def _semantic_refs(
    event_type: str,
    payload: Mapping[str, Any],
) -> tuple[ResourceRef, ...]:
    contract = semantic_ref_contract(event_type)
    if contract is None:
        return ()
    selected: list[ResourceRef] = []
    for group in contract.groups:
        for ref in _group_refs(payload, group):
            if ref not in selected:
                selected.append(ref)
    return tuple(selected)


def _stored_declared_refs(stored_event: object) -> tuple[ResourceRef, ...]:
    if not isinstance(stored_event, Mapping):
        raise PupuContextReferencePolicyError(
            "stored event is malformed",
            code="contract_invalid",
        )
    links = stored_event.get("links")
    if links is None:
        return ()
    if not isinstance(links, Mapping):
        raise PupuContextReferencePolicyError(
            "stored event links are malformed",
            code="contract_invalid",
        )
    if "resource_refs" not in links:
        return ()
    raw_refs = links.get("resource_refs")
    if not isinstance(raw_refs, Sequence) or isinstance(
        raw_refs,
        (str, bytes, bytearray),
    ):
        raise PupuContextReferencePolicyError(
            "stored resource reference declaration is malformed",
            code="contract_invalid",
        )
    decoded: list[ResourceRef] = []
    for item in raw_refs:
        if not isinstance(item, str):
            raise PupuContextReferencePolicyError(
                "stored resource reference declaration is malformed",
                code="contract_invalid",
            )
        try:
            ref = PupuRefCodec.decode(item)
        except ValueError as exc:
            raise PupuContextReferencePolicyError(
                "stored resource reference declaration is malformed",
                code="contract_invalid",
            ) from exc
        if ref in decoded:
            raise PupuContextReferencePolicyError(
                "stored resource reference declaration contains duplicates",
                code="contract_invalid",
            )
        decoded.append(ref)
    return tuple(decoded)


def _projected_ref_value(value: Any, *, path: tuple[str, ...]) -> Any:
    ref = _decode_ref(value, path=path)
    if isinstance(value, Mapping) and "uri" in value:
        projected = copy.deepcopy(dict(value))
        projected["ref"] = ref.to_dict()
        return projected
    if (
        isinstance(value, Mapping)
        and value.get("schema") != ResourceRef.SCHEMA
        and "ref" in value
    ):
        projected = copy.deepcopy(dict(value))
        projected["ref"] = ref.to_dict()
        return projected
    return ref.to_dict()


def _replace_path(
    payload: dict[str, Any],
    path: tuple[str, ...],
    value: Any,
) -> None:
    current = payload
    for segment in path[:-1]:
        nested = current.get(segment)
        if not isinstance(nested, dict):
            return
        current = nested
    current[path[-1]] = value


def normalize_semantic_refs_for_context(
    event_type: str,
    payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Decode only declared semantic slots for provider-neutral compilation."""

    if not isinstance(event_type, str):
        raise TypeError("event_type must be text")
    if not isinstance(payload, Mapping):
        raise TypeError("payload must be an object")
    projected = copy.deepcopy(dict(payload))
    contract = semantic_ref_contract(event_type)
    if contract is None:
        return projected
    for group in contract.groups:
        for path in group.paths:
            value = _path_value(projected, path)
            if value is _MISSING:
                continue
            if group.repeated:
                if not isinstance(value, Sequence) or isinstance(
                    value,
                    (str, bytes, bytearray),
                ):
                    raise PupuContextReferencePolicyError(
                        f"semantic reference group {group.name} must be an array",
                        code="contract_invalid",
                    )
                normalized = [
                    _projected_ref_value(item, path=path) for item in value
                ]
            else:
                normalized = _projected_ref_value(value, path=path)
            _replace_path(projected, path, normalized)
    return projected


class PupuContextReferencePolicy:
    """Double gate for one exact execution and chat-workspace authority."""

    def __init__(
        self,
        *,
        execution: PupuExecutionCapabilities,
        authorizer: PupuWorkspaceReferenceAuthorizer,
        partial_attempt_sink: PartialAttemptSink,
    ) -> None:
        if not isinstance(execution, PupuExecutionCapabilities):
            raise TypeError("execution must be PupuExecutionCapabilities")
        if type(authorizer) is not PupuWorkspaceReferenceAuthorizer:
            raise TypeError(
                "authorizer must be an exact PupuWorkspaceReferenceAuthorizer"
            )
        if not authorizer.is_bound_to_execution(execution):
            raise PupuContextReferencePolicyError(
                "reference authorizer is not bound to the same execution",
                code="unauthorized",
            )
        if not callable(partial_attempt_sink):
            raise TypeError("partial_attempt_sink must be callable")
        self._execution = execution
        self._authorizer = authorizer
        self._partial_attempt_sink = partial_attempt_sink
        self._read_partial_lock = Lock()
        self._read_partial_reported = False

    @property
    def authorizer(self) -> PupuWorkspaceReferenceAuthorizer:
        return self._authorizer

    def is_bound_to_journal(self, journal: object) -> bool:
        return (
            type(journal) is PupuExecutionJournal
            and self._execution.journal is journal
            and self._authorizer.is_bound_to_execution(self._execution)
        )

    def _validate(
        self,
        *,
        event_type: str,
        payload: Mapping[str, Any],
        declared_refs: tuple[ResourceRef, ...],
    ) -> None:
        if not isinstance(payload, Mapping):
            raise PupuContextReferencePolicyError(
                "journal payload is malformed",
                code="contract_invalid",
            )
        if len(set(declared_refs)) != len(declared_refs):
            raise PupuContextReferencePolicyError(
                "same-event resource reference declarations contain duplicates",
                code="contract_invalid",
            )
        semantic_refs = _semantic_refs(event_type, payload)
        semantic_set = frozenset(semantic_refs)
        declared_set = frozenset(declared_refs)
        for ref in declared_refs:
            try:
                authorized = self._authorizer.authorize(ref=ref)
            except RepositoryNotFoundError as exc:
                raise PupuContextReferencePolicyError(
                    "semantic reference could not be authorized",
                    code="unauthorized",
                ) from exc
            except WorkspaceRepositoryError as exc:
                raise PupuContextReferencePolicyError(
                    "semantic reference authorizer is unavailable",
                    code="authorizer_unavailable",
                ) from exc
            except Exception as exc:
                raise PupuContextReferencePolicyError(
                    "semantic reference authorizer is unavailable",
                    code="authorizer_unavailable",
                ) from exc
            if authorized != ref:
                raise PupuContextReferencePolicyError(
                    "reference authorizer changed reference identity",
                    code="unauthorized",
                )
        if semantic_set - declared_set:
            raise PupuContextReferencePolicyError(
                "every semantic reference must be declared by the same event",
                code="contract_invalid",
            )
        if declared_set - semantic_set:
            raise PupuContextReferencePolicyError(
                "resource reference declaration has no semantic slot in this event",
                code="contract_invalid",
            )

    def _report_read_partial_once(
        self,
        event: object,
        error: PupuContextReferencePolicyError,
    ) -> None:
        with self._read_partial_lock:
            if self._read_partial_reported:
                return
            self._read_partial_reported = True
        try:
            self._partial_attempt_sink("context_reference", event, error)
        except Exception:
            pass

    def authorize_append(self, request: JournalAppendRequest) -> None:
        """Validate declarations and authority before a storage mutation."""

        if not isinstance(request, JournalAppendRequest):
            raise TypeError("request must be a JournalAppendRequest")
        self._validate(
            event_type=request.event_type,
            payload=request.payload,
            declared_refs=request.resource_refs,
        )

    def revalidate_read(
        self,
        event: JournalEvent,
        *,
        stored_event: object,
    ) -> None:
        """Revalidate persisted and legacy rows, marking Partial on failure."""

        try:
            if not isinstance(event, JournalEvent):
                raise PupuContextReferencePolicyError(
                    "journal read returned a malformed event",
                    code="contract_invalid",
                )
            stored_refs = _stored_declared_refs(stored_event)
            if stored_refs != event.resource_refs:
                raise PupuContextReferencePolicyError(
                    "stored resource reference projection diverged",
                    code="contract_invalid",
                )
            self._validate(
                event_type=event.event_type,
                payload=event.payload,
                declared_refs=stored_refs,
            )
        except PupuContextReferencePolicyError as exc:
            self._report_read_partial_once(event, exc)
            raise


__all__ = [
    "PupuContextReferencePolicy",
    "PupuContextReferencePolicyError",
    "normalize_semantic_refs_for_context",
]
