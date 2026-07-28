"""tool_media_store — per-session temp storage for redacted tool-result media.

Computer-use screenshots (and any tool result carrying inline base64 image
data) are stripped out of the SSE stream / SQLite history at the redaction choke
point (``unchain_adapter._redact_tool_result_images``) — the fail-closed red
line means base64 never crosses the SSE boundary or lands in persisted history.

This module is where those stripped bytes actually go: a per-session temp
directory, keyed by a high-entropy ``media_id`` (uuid4 hex). The frontend fetches
them lazily via ``GET /chat/tool-media/<media_id>``. Files are ephemeral — swept
on write and re-checked against a TTL on read (default 30 min), so nothing
long-lived is persisted server-side.

No background thread: TTL is enforced opportunistically at two moments —
(1) on every write we sweep the writing session's directory, and (2) on every
read we treat a file older than the TTL as expired (delete + 404). ``sweep_session``
is exported so the adapter can also reclaim at stream start/end. The tradeoff:
an idle session's last screenshot lingers on disk until the next write to that
session or the next read of that file — bounded, small PNGs in a temp dir — which
we accept for v1 rather than run a reaper thread inside the Flask sidecar.

Security posture (v1): ``media_id`` is a uuid4 (122 bits) acting as an
unguessable capability token; the endpoint is loopback-only + token-gated like
every other ``/chat/*`` route. There is no per-session bearer token in the
current auth model, so binding media to a session is best-effort via an optional
``session_id`` scope on lookup. Flagged for pupu-security-expert review.
"""

from __future__ import annotations

import base64
import os
import re
import tempfile
import time
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

_ENV_DATA_DIR = "UNCHAIN_DATA_DIR"
_ENV_TTL = "PUPU_TOOL_MEDIA_TTL_SECONDS"
_DEFAULT_TTL_SECONDS = 1800  # 30 minutes
_MEDIA_SUBDIR = "tool_media"
_NO_SESSION = "_no_session"

# media_id is a uuid4 hex — 32 lowercase hex chars. A strict allowlist doubles as
# a path-traversal guard: no dots, slashes, or separators can pass.
_MEDIA_ID_RE = re.compile(r"^[0-9a-f]{32}$")

_MEDIA_TYPE_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
}
_EXT_MEDIA_TYPE = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "gif": "image/gif",
}


def _ttl_seconds() -> int:
    raw = os.environ.get(_ENV_TTL, "").strip()
    if raw:
        try:
            value = int(raw)
            if value > 0:
                return value
        except ValueError:
            pass
    return _DEFAULT_TTL_SECONDS


def _media_root() -> Path:
    data_dir = os.environ.get(_ENV_DATA_DIR, "").strip()
    if data_dir:
        return Path(data_dir) / _MEDIA_SUBDIR
    # No configured data dir (tests / bare sidecar) → system temp.
    return Path(tempfile.gettempdir()) / "pupu_tool_media"


def _safe_session_component(session_id: str) -> str:
    cleaned = str(session_id or "").strip()
    if not cleaned:
        return _NO_SESSION
    safe = re.sub(r"[^0-9A-Za-z._-]", "_", cleaned)[:128]
    return safe or _NO_SESSION


def _session_dir(session_id: str) -> Path:
    return _media_root() / _safe_session_component(session_id)


def _ext_for_media_type(media_type: str) -> str:
    return _MEDIA_TYPE_EXT.get(str(media_type or "").strip().lower(), "bin")


def _media_type_for_path(path: Path) -> str:
    ext = path.suffix.lstrip(".").lower()
    return _EXT_MEDIA_TYPE.get(ext, "application/octet-stream")


def _safe_unlink(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


def _sweep_dir(directory: Path, ttl: int) -> None:
    """Delete files in ``directory`` older than ``ttl`` seconds. Best-effort."""
    try:
        entries = list(directory.iterdir())
    except OSError:
        return
    now = time.time()
    for entry in entries:
        try:
            if entry.is_file() and (now - entry.stat().st_mtime) > ttl:
                _safe_unlink(entry)
        except OSError:
            continue


def sweep_session(session_id: str) -> None:
    """Reclaim a session's expired media. Called at stream start/end by the
    adapter so a session's temp dir does not accumulate across runs."""
    _sweep_dir(_session_dir(session_id), _ttl_seconds())


def store_media(
    session_id: str,
    data_b64: str,
    media_type: str = "image/png",
) -> Optional[str]:
    """Persist ``data_b64`` (a base64 string) to the session's temp dir.

    Returns the generated ``media_id`` (uuid4 hex) on success, or ``None`` if the
    payload is unusable / the write fails. Storage is best-effort and MUST NOT be
    load-bearing for redaction correctness — the caller strips base64 regardless.
    """
    if not isinstance(data_b64, str) or not data_b64:
        return None
    try:
        raw = base64.b64decode(data_b64, validate=False)
    except Exception:
        return None
    if not raw:
        return None

    session_dir = _session_dir(session_id)
    try:
        session_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None

    # Opportunistic TTL sweep of this session's dir on every write.
    _sweep_dir(session_dir, _ttl_seconds())

    media_id = uuid.uuid4().hex
    ext = _ext_for_media_type(media_type)
    path = session_dir / f"{media_id}.{ext}"
    tmp_path = session_dir / f"{media_id}.{ext}.tmp"
    try:
        tmp_path.write_bytes(raw)
        os.replace(tmp_path, path)
    except OSError:
        _safe_unlink(tmp_path)
        return None
    return media_id


def resolve_media(
    media_id: str,
    session_id: Optional[str] = None,
) -> Optional[Tuple[bytes, str]]:
    """Look up media bytes by ``media_id``, enforcing the TTL at read time.

    If ``session_id`` is given, the search is scoped to that session's directory
    (stronger binding); otherwise it globs across all session directories under
    the media root. Returns ``(bytes, media_type)`` or ``None`` (missing / expired
    / malformed id). An expired file is deleted as a side effect.
    """
    if not isinstance(media_id, str) or not _MEDIA_ID_RE.match(media_id):
        return None

    ttl = _ttl_seconds()
    candidates: List[Path] = []
    if session_id is not None and str(session_id).strip():
        session_dir = _session_dir(session_id)
        if session_dir.is_dir():
            candidates = sorted(session_dir.glob(f"{media_id}.*"))
    else:
        root = _media_root()
        if root.is_dir():
            candidates = sorted(root.glob(f"*/{media_id}.*"))

    for path in candidates:
        if path.suffix == ".tmp" or not path.is_file():
            continue
        try:
            age = time.time() - path.stat().st_mtime
        except OSError:
            continue
        if age > ttl:
            _safe_unlink(path)
            continue
        try:
            data = path.read_bytes()
        except OSError:
            continue
        return data, _media_type_for_path(path)
    return None
