"""Bounded background execution for the Memory V2 deletion outbox.

The runner is intentionally a small adapter around
``MemoryV2DeletionProcessor``.  It neither opens the SQLite database nor the
CAS object directory directly, so it cannot turn a logical deletion into an
unsafe physical object removal.  The processor leaves every completed item at
``pending_unreferenced_scan`` until a future, reference-aware GC exists.
"""

from __future__ import annotations

import threading
import uuid
from typing import Any, Callable

from memory_v2_deletion import DeletionProcessingResult, MemoryV2DeletionProcessor


class MemoryV2DeletionRunner:
    """Resume pending deletion work on startup and while the sidecar is alive."""

    def __init__(
        self,
        runtime_provider: Callable[[], Any | None],
        *,
        worker_id: str,
        lease_ms: int = 30_000,
        poll_interval_ms: int = 100,
        max_cycles_per_poll: int = 32,
    ) -> None:
        if not callable(runtime_provider):
            raise ValueError("runtime_provider must be callable")
        if not isinstance(worker_id, str) or not worker_id.strip():
            raise ValueError("worker_id is required")
        if isinstance(lease_ms, bool) or not isinstance(lease_ms, int) or lease_ms <= 0:
            raise ValueError("lease_ms must be a positive integer")
        if (
            isinstance(poll_interval_ms, bool)
            or not isinstance(poll_interval_ms, int)
            or poll_interval_ms <= 0
        ):
            raise ValueError("poll_interval_ms must be a positive integer")
        if (
            isinstance(max_cycles_per_poll, bool)
            or not isinstance(max_cycles_per_poll, int)
            or max_cycles_per_poll <= 0
        ):
            raise ValueError("max_cycles_per_poll must be a positive integer")
        self._runtime_provider = runtime_provider
        self._worker_id = worker_id.strip()
        self._lease_ms = lease_ms
        self._poll_interval_seconds = poll_interval_ms / 1000
        self._max_cycles_per_poll = max_cycles_per_poll
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._thread_lock = threading.Lock()

    def start(self) -> None:
        """Start one idempotent daemon worker and run a recovery poll immediately."""

        with self._thread_lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._wake_event.set()
            self._thread = threading.Thread(
                target=self._run,
                name="memory-v2-deletion-runner",
                daemon=True,
            )
            self._thread.start()

    def stop(self, *, timeout_seconds: float = 2.0) -> None:
        """Stop the worker without waiting past the sidecar shutdown budget."""

        self._stop_event.set()
        self._wake_event.set()
        with self._thread_lock:
            thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=max(0.0, timeout_seconds))

    def drain_once(self) -> list[DeletionProcessingResult]:
        """Process the currently available bounded batch with fresh idempotency keys."""

        runtime = self._runtime_provider()
        if runtime is None:
            return []
        processor = MemoryV2DeletionProcessor(
            runtime.store,
            worker_id=self._worker_id,
            lease_ms=self._lease_ms,
        )
        results: list[DeletionProcessingResult] = []
        for _ in range(self._max_cycles_per_poll):
            result = processor.process_once(cycle_id=uuid.uuid4().hex)
            results.append(result)
            if result.status != "completed":
                break
        return results

    def _run(self) -> None:
        while not self._stop_event.is_set():
            self._wake_event.clear()
            try:
                self.drain_once()
            except Exception:
                # Availability is retried on the next bounded poll.  The
                # processor itself preserves store-level retry/lease state.
                pass
            if self._stop_event.is_set():
                break
            self._wake_event.wait(self._poll_interval_seconds)


__all__ = ["MemoryV2DeletionRunner"]
