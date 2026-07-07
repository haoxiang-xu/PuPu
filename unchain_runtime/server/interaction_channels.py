"""Per-session registry for mid-run interject channels (fyi/btw).

Keyed by session_id (== client thread_id): the client always knows it, and a
chat has at most one active run at a time. run_id is minted inside the
unchain kernel and is not reliably known client-side.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field

from unchain.interaction import FyiChannel, ProgressDigest


@dataclass(frozen=True)
class InterjectChannels:
    fyi: FyiChannel
    digest: ProgressDigest
    original_task: str
    options: dict = field(default_factory=dict)


_registry: dict[str, InterjectChannels] = {}
_registry_lock = threading.Lock()


def register_interject_channels(
    session_id: str, original_task: str, options: dict | None = None
) -> InterjectChannels:
    channels = InterjectChannels(
        fyi=FyiChannel(),
        digest=ProgressDigest(),
        original_task=original_task,
        options=dict(options) if options else {},
    )
    with _registry_lock:
        _registry[session_id] = channels
    return channels


def get_interject_channels(session_id: str) -> InterjectChannels | None:
    with _registry_lock:
        return _registry.get(session_id)


def release_interject_channels(
    session_id: str, channels: InterjectChannels | None = None
) -> None:
    with _registry_lock:
        current = _registry.get(session_id)
        if current is None:
            return
        if channels is not None and current is not channels:
            return  # a newer run already re-registered; don't clobber it
        _registry.pop(session_id, None)
