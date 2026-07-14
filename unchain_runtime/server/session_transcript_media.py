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
store: on **save**, deep-walk the state and replace every flat tool-result image
block's base64 with a reference marker (reusing the C4 ``tool_media_store``, so
the bytes live only in the TTL-bounded media dir); on **load**, re-hydrate the
base64 from the media store if still present, else substitute a coherent text
placeholder so transcript replay/resume never breaks and never crashes.

Scope. Targets the flat tool-result image shape ``{"type":"image","data_b64":…}``
(what computer-use screenshots use — see [[rich-tool-result-and-native-tool-contract]]).
User-attached images use the canonical ``{"type":"image","source":{...}}`` input
shape and are user-originated content, out of F3 scope (separate decision).
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


def _is_omitted_image_marker(node: Any) -> bool:
    return (
        isinstance(node, dict)
        and node.get("type") == "image"
        and node.get("data_omitted") is True
        and "data_b64" not in node
    )


def _valid_media_id(value: Any) -> bool:
    return isinstance(value, str) and bool(_MEDIA_ID_RE.match(value))


# ── recursive walk ───────────────────────────────────────────────────────────
def _walk(node: Any, visit: Callable[[dict], None]) -> None:
    """Depth-first walk applying ``visit`` to every dict. ``visit`` may mutate the
    dict in place (its primitive replacements are not re-walked meaningfully)."""
    if isinstance(node, dict):
        visit(node)
        for value in list(node.values()):
            _walk(value, visit)
    elif isinstance(node, list):
        for value in node:
            _walk(value, visit)


def _contains_flat_image(state: Any) -> bool:
    found = {"hit": False}

    def visit(node: dict) -> None:
        if not found["hit"] and _is_flat_image_with_base64(node):
            found["hit"] = True

    _walk(state, visit)
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
    media_id = store_media(session_id, data_b64, media_type)

    block.pop("data_b64", None)
    block["data_omitted"] = True
    block["byte_len"] = byte_len
    if _valid_media_id(media_id):
        block["media_id"] = media_id
    # type / media_type / width / height are preserved for the placeholder + UI.


def strip_transcript_media(state: Any, session_id: str) -> Any:
    """Return a copy of ``state`` with all flat tool-result image base64 replaced
    by reference markers. Text-only / image-free state is returned unchanged
    (byte-identical, no copy) so the common path pays nothing.

    Operates on a deepcopy so the caller's live in-memory transcript keeps its
    base64 (the running agent may still need it); only the persisted copy is
    stripped. Each save re-stashes freshly (a fresh media_id) — bounded, small
    PNGs swept by the media TTL; correctness (recoverable-within-TTL bytes always
    present at save time) is preferred over dedup.
    """
    if not isinstance(state, dict) or not _contains_flat_image(state):
        return state
    out = copy.deepcopy(state)

    def visit(node: dict) -> None:
        if _is_flat_image_with_base64(node):
            _strip_image_block(node, session_id)

    _walk(out, visit)
    return out


# ── re-hydrate (load path) ───────────────────────────────────────────────────
def _rehydrate_image_block(block: dict, session_id: str) -> None:
    from tool_media_store import resolve_media  # lazy

    media_id = block.get("media_id")
    resolved = resolve_media(media_id, session_id) if _valid_media_id(media_id) else None
    if resolved is not None:
        data, media_type = resolved
        block["data_b64"] = base64.b64encode(data).decode("ascii")
        if media_type:
            block["media_type"] = media_type
        block.pop("data_omitted", None)
        block.pop("byte_len", None)
        return

    # Expired / missing / unrecoverable → replace with a coherent text block so
    # the transcript stays valid for replay (never a broken zero-data image).
    width = block.get("width")
    height = block.get("height")
    dims = f" {width}x{height}" if isinstance(width, int) and isinstance(height, int) else ""
    block.clear()
    block["type"] = "text"
    block["text"] = f"[screenshot{dims} omitted from history and no longer available]"


def rehydrate_transcript_media(state: Any, session_id: str) -> Any:
    """Mutate ``state`` in place, restoring stripped image blocks from the media
    store (or replacing them with a text placeholder when expired). Returns
    ``state``. Safe on any shape; no-op when there are no markers."""
    if not isinstance(state, dict):
        return state

    def visit(node: dict) -> None:
        if _is_omitted_image_marker(node):
            _rehydrate_image_block(node, session_id)

    _walk(state, visit)
    return state


# ── sanitizing store wrapper ─────────────────────────────────────────────────
def build_sanitizing_session_store(base_dir: str) -> Any:
    """Construct a JsonFileSessionStore subclass that strips image base64 before
    every disk write and re-hydrates it on read. Single choke for all persistence
    (session snapshot + execution checkpoint suspend/complete/commit), since every
    write funnels through the store's save* methods and every read through
    load_with_revision."""
    from unchain.memory import JsonFileSessionStore

    class _SanitizingSessionStore(JsonFileSessionStore):
        def save(self, session_id, state):  # type: ignore[override]
            return super().save(session_id, strip_transcript_media(state, session_id))

        def save_if_revision(self, session_id, state, expected_revision):  # type: ignore[override]
            return super().save_if_revision(
                session_id, strip_transcript_media(state, session_id), expected_revision
            )

        def save_if_revision_and_fence(self, session_id, state, *args, **kwargs):  # type: ignore[override]
            return super().save_if_revision_and_fence(
                session_id, strip_transcript_media(state, session_id), *args, **kwargs
            )

        def load_with_revision(self, session_id):  # type: ignore[override]
            snapshot = super().load_with_revision(session_id)
            rehydrate_transcript_media(getattr(snapshot, "state", None), session_id)
            return snapshot

    return _SanitizingSessionStore(base_dir=base_dir)


__all__ = [
    "strip_transcript_media",
    "rehydrate_transcript_media",
    "build_sanitizing_session_store",
]
