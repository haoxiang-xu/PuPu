"""session_transcript_media — F3 (SEC-001 P2, /守 MEDIUM): keep tool-result
image base64 (computer-use screenshots) out of the on-disk session transcript.

Background. The SSE/SQLite redaction choke (``unchain_adapter._redact_tool_result_images``)
only sanitizes the *emit* event (a deepcopy) — it deliberately does not touch the
model transcript, because emit runs after the transcript message is built. But
PuPu persists that transcript verbatim: ``JsonFileSessionStore`` writes the full
session ``state`` (``state["messages"]`` and the nested ``execution_checkpoint``
transcript) as plaintext JSON on every session snapshot / checkpoint suspend /
complete. A full-screen screenshot (passwords, DMs, banking pages) would sit in
that JSON indefinitely — outside the tool_media_store 30-min TTL and outside the
fail-closed emit redaction.

Fix (least-invasive, PuPu-side only, no unchain core change). Wrap the session
store: on **save**, deep-walk the state and replace inline *tool-result* image
payloads with a reference marker (reusing the C4 ``tool_media_store``, so the
bytes live only in the TTL-bounded media dir); on **load**, re-hydrate the base64
from the media store if still present, else substitute a coherent text
placeholder so transcript replay/resume never breaks and never crashes. User
attachments deliberately remain inline: they are durable conversation input,
not ephemeral Computer screenshots.

Scope. Targets both the host-side flat tool-result image shape
``{"type":"image","data_b64":…}`` and the provider transcript shape emitted by
``AnthropicMessageBuilder``:
``{"type":"image","source":{"type":"base64","data":…}}``.  The latter is the
shape that is actually committed to an Anthropic execution transcript, so both
forms must pass through the same persistence choke. Provider ``tool_use_id``
provenance keeps images returned by unrelated rich-image tools unchanged;
ambiguous legacy tool-result images are sanitized fail-closed.
"""

from __future__ import annotations

import base64
import copy
import re
from typing import Any, Callable

# media_id shape check (mirrors tool_media_store._MEDIA_ID_RE — uuid4 hex).
_MEDIA_ID_RE = re.compile(r"^[0-9a-f]{32}$")


# ── block predicates ─────────────────────────────────────────────────────────
def _is_flat_image_with_base64(node: Any) -> bool:
    return (
        isinstance(node, dict)
        and node.get("type") == "image"
        and isinstance(node.get("data_b64"), str)
        and bool(node.get("data_b64"))
    )


def _is_nested_image_with_base64(node: Any) -> bool:
    if not isinstance(node, dict) or node.get("type") != "image":
        return False
    source = node.get("source")
    return (
        isinstance(source, dict)
        and source.get("type") == "base64"
        and isinstance(source.get("data"), str)
        and bool(source.get("data"))
    )


def _is_flat_omitted_image_marker(node: Any) -> bool:
    return (
        isinstance(node, dict)
        and node.get("type") == "image"
        and node.get("data_omitted") is True
        and "data_b64" not in node
    )


def _is_nested_omitted_image_marker(node: Any) -> bool:
    if not isinstance(node, dict) or node.get("type") != "image":
        return False
    source = node.get("source")
    return (
        isinstance(source, dict)
        and source.get("type") == "base64"
        and source.get("data_omitted") is True
        and "data" not in source
    )


def _valid_media_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_MEDIA_ID_RE.match(value))


# ── provenance-aware recursive walk ─────────────────────────────────────────
_RESULT_SCOPE_COMPUTER = "computer"
_RESULT_SCOPE_OTHER = "other"
_RESULT_SCOPE_AMBIGUOUS = "ambiguous"


def _non_empty_string(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _tool_identity_scope(node: dict) -> str | None:
    scopes: set[str] = set()
    toolkit_id = _non_empty_string(node.get("toolkit_id"))
    if toolkit_id:
        scopes.add(
            _RESULT_SCOPE_COMPUTER
            if toolkit_id == "builtin.computer"
            else _RESULT_SCOPE_OTHER
        )
    for key in ("tool_name", "name"):
        tool_name = _non_empty_string(node.get(key))
        if tool_name:
            scopes.add(
                _RESULT_SCOPE_COMPUTER
                if tool_name == "computer"
                else _RESULT_SCOPE_OTHER
            )
    if not scopes:
        return None
    if len(scopes) > 1:
        return _RESULT_SCOPE_AMBIGUOUS
    return next(iter(scopes))


def _collect_tool_call_scopes(node: Any) -> dict[str, str]:
    """Map provider/tool-event call ids to Computer, other, or ambiguous.

    Anthropic result blocks carry only ``tool_use_id``. Their corresponding
    assistant ``tool_use`` block is therefore the durable source of tool
    identity used to avoid sanitizing unrelated rich-image tools.
    """
    scopes: dict[str, str] = {}

    def collect(value: Any, *, in_assistant_message: bool = False) -> None:
        if isinstance(value, dict):
            node_type = value.get("type")
            role = value.get("role")

            # Tool-result payloads and tool-role messages are untrusted data.
            # Never let a result body forge a call envelope that changes whether
            # an image is sanitized.
            if node_type == "tool_result" or role == "tool":
                return

            child_in_assistant_message = in_assistant_message
            if isinstance(role, str):
                child_in_assistant_message = role == "assistant"

            if isinstance(node_type, str) and node_type in {
                "tool_use",
                "tool_call",
                "function_call",
            }:
                if child_in_assistant_message:
                    call_id = _non_empty_string(value.get("id")) or _non_empty_string(
                        value.get("call_id")
                    )
                    scope = _tool_identity_scope(value)
                    if call_id and scope:
                        existing = scopes.get(call_id)
                        scopes[call_id] = (
                            scope
                            if existing is None or existing == scope
                            else _RESULT_SCOPE_AMBIGUOUS
                        )
                # A call envelope's input/arguments are arbitrary payloads, not
                # additional trusted call envelopes.
                return
            for child in value.values():
                collect(
                    child,
                    in_assistant_message=child_in_assistant_message,
                )
        elif isinstance(value, list):
            for child in value:
                collect(child, in_assistant_message=in_assistant_message)

    collect(node)
    return scopes


def _result_container_scope(
    node: dict,
    call_scopes: dict[str, str],
) -> str | None:
    is_result = node.get("type") == "tool_result" or node.get("role") == "tool"
    if not is_result:
        return None
    explicit_scope = _tool_identity_scope(node)
    call_ids = {
        call_id
        for call_id in (
            _non_empty_string(node.get("tool_use_id")),
            _non_empty_string(node.get("tool_call_id")),
            _non_empty_string(node.get("call_id")),
        )
        if call_id
    }
    mapped_scope = None
    if len(call_ids) > 1:
        mapped_scope = _RESULT_SCOPE_AMBIGUOUS
    elif call_ids:
        mapped_scope = call_scopes.get(next(iter(call_ids)))
    if explicit_scope and mapped_scope:
        return (
            explicit_scope
            if explicit_scope == mapped_scope
            else _RESULT_SCOPE_AMBIGUOUS
        )
    return explicit_scope or mapped_scope or _RESULT_SCOPE_AMBIGUOUS


def _walk(
    node: Any,
    visit: Callable[[dict, bool, str | None], None],
    *,
    call_scopes: dict[str, str],
    in_any_tool_result: bool = False,
    result_scope: str | None = None,
) -> None:
    """Depth-first walk that tracks tool-result ancestry and provenance.

    Anthropic user image attachments and Computer screenshot result blocks share
    the exact same ``type=image/source=base64`` shape. The parent context is the
    only reliable discriminator: a provider result references the preceding
    tool call id, while host-native output may carry tool identity directly.
    """
    if isinstance(node, dict):
        # The first result envelope owns provenance for its entire payload.
        # Nested result-shaped dictionaries are arbitrary tool output and must
        # never override an outer Computer or ambiguous scope.
        container_scope = (
            None
            if in_any_tool_result
            else _result_container_scope(node, call_scopes)
        )
        is_result_container = container_scope is not None
        child_scope = result_scope
        if container_scope is not None:
            child_scope = (
                result_scope
                if container_scope == _RESULT_SCOPE_AMBIGUOUS and result_scope
                else container_scope
            )
        child_in_any_tool_result = in_any_tool_result or is_result_container
        visit(node, child_in_any_tool_result, child_scope)
        for value in list(node.values()):
            _walk(
                value,
                visit,
                call_scopes=call_scopes,
                in_any_tool_result=child_in_any_tool_result,
                result_scope=child_scope,
            )
    elif isinstance(node, list):
        for value in node:
            _walk(
                value,
                visit,
                call_scopes=call_scopes,
                in_any_tool_result=in_any_tool_result,
                result_scope=result_scope,
            )


def _contains_inline_image(state: Any) -> bool:
    found = {"hit": False}
    call_scopes = _collect_tool_call_scopes(state)

    def visit(
        node: dict,
        _in_any_tool_result: bool,
        result_scope: str | None,
    ) -> None:
        if not found["hit"] and (
            (
                _is_flat_image_with_base64(node)
                and result_scope != _RESULT_SCOPE_OTHER
            )
            or (
                result_scope in {_RESULT_SCOPE_COMPUTER, _RESULT_SCOPE_AMBIGUOUS}
                and _is_nested_image_with_base64(node)
            )
        ):
            found["hit"] = True

    _walk(state, visit, call_scopes=call_scopes)
    return found["hit"]


# ── strip (save path) ────────────────────────────────────────────────────────
def _strip_image_block(block: dict, session_id: str) -> None:
    from tool_media_store import store_media  # lazy: avoid import cost at module load

    data_b64 = block["data_b64"]
    media_type = str(block.get("media_type") or "image/png")
    try:
        byte_len = len(base64.b64decode(data_b64, validate=False))
    except Exception:
        byte_len = 0

    # Best-effort stash to the TTL-bounded media dir so replay/resume can recover
    # it within the window. Storage MUST NOT gate stripping — if it fails we still
    # drop the base64 (fail-closed: base64 never survives to disk).
    try:
        media_id = store_media(session_id, data_b64, media_type)
    except Exception:
        media_id = None

    block.pop("data_b64", None)
    block["data_omitted"] = True
    block["byte_len"] = byte_len
    if _valid_media_id(media_id):
        block["media_id"] = media_id
    # type / media_type / width / height are preserved for the placeholder + UI.


def _strip_nested_image_block(block: dict, session_id: str) -> None:
    from tool_media_store import store_media  # lazy: avoid import cost at module load

    source = block["source"]
    data_b64 = source["data"]
    media_type = str(source.get("media_type") or "image/png")
    try:
        byte_len = len(base64.b64decode(data_b64, validate=False))
    except Exception:
        byte_len = 0

    try:
        media_id = store_media(session_id, data_b64, media_type)
    except Exception:
        media_id = None

    source.pop("data", None)
    source["data_omitted"] = True
    source["byte_len"] = byte_len
    if _valid_media_id(media_id):
        source["media_id"] = media_id


def strip_transcript_media(state: Any, session_id: str) -> Any:
    """Return a copy of ``state`` with inline tool-result image base64 replaced
    by reference markers. Tool-call provenance keeps known non-Computer rich
    image results unchanged; ambiguous legacy flat results are sanitized
    fail-closed. Nested Anthropic-native image sources are changed only under a
    Computer or ambiguous tool-result context. Text-only / image-free state is
    returned unchanged (byte-identical, no copy) so the common path pays nothing.

    Operates on a deepcopy so the caller's live in-memory transcript keeps its
    base64 (the running agent may still need it); only the persisted copy is
    stripped. Each save re-stashes freshly (a fresh media_id) — bounded, small
    PNGs swept by the media TTL; correctness (recoverable-within-TTL bytes always
    present at save time) is preferred over dedup.
    """
    if not isinstance(state, dict) or not _contains_inline_image(state):
        return state
    out = copy.deepcopy(state)

    call_scopes = _collect_tool_call_scopes(out)

    def visit(
        node: dict,
        _in_any_tool_result: bool,
        result_scope: str | None,
    ) -> None:
        if (
            _is_flat_image_with_base64(node)
            and result_scope != _RESULT_SCOPE_OTHER
        ):
            _strip_image_block(node, session_id)
        elif (
            result_scope in {_RESULT_SCOPE_COMPUTER, _RESULT_SCOPE_AMBIGUOUS}
            and _is_nested_image_with_base64(node)
        ):
            _strip_nested_image_block(node, session_id)

    _walk(out, visit, call_scopes=call_scopes)
    return out


# ── re-hydrate (load path) ───────────────────────────────────────────────────
def _rehydrate_image_block(
    block: dict,
    session_id: str,
    *,
    resolve_media_enabled: bool,
) -> None:
    from tool_media_store import resolve_media  # lazy

    media_id = block.get("media_id")
    resolved = (
        resolve_media(media_id, session_id)
        if resolve_media_enabled and _valid_media_id(media_id)
        else None
    )
    if resolved is not None:
        data, media_type = resolved
        block["data_b64"] = base64.b64encode(data).decode("ascii")
        if media_type and not block.get("media_type"):
            block["media_type"] = media_type
        block.pop("data_omitted", None)
        block.pop("byte_len", None)
        block.pop("media_id", None)
        return

    # Expired / missing / unrecoverable → replace with a coherent text block so
    # the transcript stays valid for replay (never a broken zero-data image).
    width = block.get("width")
    height = block.get("height")
    dims = f" {width}x{height}" if isinstance(width, int) and isinstance(height, int) else ""
    block.clear()
    block["type"] = "text"
    block["text"] = f"[screenshot{dims} omitted from history and no longer available]"


def _rehydrate_nested_image_block(
    block: dict,
    session_id: str,
    *,
    resolve_media_enabled: bool,
) -> None:
    from tool_media_store import resolve_media  # lazy

    source = block["source"]
    media_id = source.get("media_id")
    resolved = (
        resolve_media(media_id, session_id)
        if resolve_media_enabled and _valid_media_id(media_id)
        else None
    )
    if resolved is not None:
        data, media_type = resolved
        source["data"] = base64.b64encode(data).decode("ascii")
        if media_type and not source.get("media_type"):
            source["media_type"] = media_type
        source.pop("data_omitted", None)
        source.pop("byte_len", None)
        source.pop("media_id", None)
        return

    width = block.get("width")
    height = block.get("height")
    dims = f" {width}x{height}" if isinstance(width, int) and isinstance(height, int) else ""
    block.clear()
    block["type"] = "text"
    block["text"] = f"[screenshot{dims} omitted from history and no longer available]"


def rehydrate_transcript_media(
    state: Any,
    session_id: str,
    *,
    resolve_media_enabled: bool = True,
) -> Any:
    """Mutate ``state`` in place, restoring stripped image blocks from the media
    store when enabled, or replacing them with a text placeholder when expired
    or deliberately disabled. Returns ``state``. Safe on any shape; no-op when
    there are no markers."""
    if not isinstance(state, dict):
        return state

    call_scopes = _collect_tool_call_scopes(state)

    def visit(
        node: dict,
        in_any_tool_result: bool,
        _result_scope: str | None,
    ) -> None:
        if _is_flat_omitted_image_marker(node):
            _rehydrate_image_block(
                node,
                session_id,
                resolve_media_enabled=resolve_media_enabled,
            )
        elif in_any_tool_result and _is_nested_omitted_image_marker(node):
            _rehydrate_nested_image_block(
                node,
                session_id,
                resolve_media_enabled=resolve_media_enabled,
            )

    _walk(state, visit, call_scopes=call_scopes)
    return state


# ── sanitizing store wrapper ─────────────────────────────────────────────────
def build_sanitizing_session_store(
    base_dir: str,
    *,
    sanitize_enabled: bool = True,
) -> Any:
    """Construct a JsonFileSessionStore subclass that strips image base64 before
    every disk write and re-hydrates it on read. Single choke for all persistence
    (session snapshot + execution checkpoint suspend/complete/commit), since every
    write funnels through the store's save* methods and every read through
    load_with_revision.

    When ``sanitize_enabled`` is false, writes preserve the pre-feature behavior.
    Reads still turn existing markers into valid transcript content when the
    feature is disabled, but use a text placeholder instead of resurrecting
    screenshot bytes that a later pass-through save could persist inline.
    """
    from unchain.memory import JsonFileSessionStore

    def state_for_save(session_id: str, state: Any) -> Any:
        if not sanitize_enabled:
            return state
        return strip_transcript_media(state, session_id)

    class _SanitizingSessionStore(JsonFileSessionStore):
        def save(self, session_id, state, *args, **kwargs):  # type: ignore[override]
            return super().save(
                session_id,
                state_for_save(session_id, state),
                *args,
                **kwargs,
            )

        def save_if_revision(  # type: ignore[override]
            self, session_id, state, *args, **kwargs
        ):
            return super().save_if_revision(
                session_id,
                state_for_save(session_id, state),
                *args,
                **kwargs,
            )

        def save_if_revision_and_fence(self, session_id, state, *args, **kwargs):  # type: ignore[override]
            return super().save_if_revision_and_fence(
                session_id, state_for_save(session_id, state), *args, **kwargs
            )

        def save_if_revision_and_execution_not_cancelled(  # type: ignore[override]
            self, session_id, state, *args, **kwargs
        ):
            return super().save_if_revision_and_execution_not_cancelled(
                session_id,
                state_for_save(session_id, state),
                *args,
                **kwargs,
            )

        def save_if_revision_and_execution_cancelled(  # type: ignore[override]
            self, session_id, state, *args, **kwargs
        ):
            return super().save_if_revision_and_execution_cancelled(
                session_id,
                state_for_save(session_id, state),
                *args,
                **kwargs,
            )

        def load_with_revision(self, session_id, *args, **kwargs):  # type: ignore[override]
            snapshot = super().load_with_revision(session_id, *args, **kwargs)
            rehydrate_transcript_media(
                getattr(snapshot, "state", None),
                session_id,
                resolve_media_enabled=sanitize_enabled,
            )
            return snapshot

    return _SanitizingSessionStore(base_dir=base_dir)


__all__ = [
    "strip_transcript_media",
    "rehydrate_transcript_media",
    "build_sanitizing_session_store",
]
