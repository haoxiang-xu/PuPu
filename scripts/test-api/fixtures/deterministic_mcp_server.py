#!/usr/bin/env python3
"""Deterministic stdio MCP server for PuPu release soak tests.

The fixture is intentionally small and closed-world: every tool uses a strict,
canonical argument shape so a fake model can issue byte-for-byte repeatable
calls. Runtime events are appended as JSON Lines to ``PUPU_SOAK_AUDIT_PATH``.
Use ``{pid}`` in that path when a harness starts more than one server process.

``PUPU_SOAK_TIME_SCALE`` scales only the real sleep performed by ``soak_wait``;
the canonical requested duration and its audit record always remain 65000 ms.
"""

from __future__ import annotations

import asyncio
import fcntl
import hashlib
import json
import math
import os
import re
import tempfile
import threading
from pathlib import Path
from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field


MARKER = "PUPU-DETERMINISTIC-SOAK"
WAIT_MILLISECONDS = 65_000
GATE_CHECKPOINT = "durable-pause"
FAIL_ONCE_KEY = "fixed-fail-once"

Lane = Literal["A", "B", "C"]
Iteration = Annotated[int, Field(strict=True, ge=0)]
_CHECKPOINT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
Checkpoint = Annotated[
    str,
    Field(
        strict=True,
        min_length=1,
        max_length=128,
        pattern=_CHECKPOINT_PATTERN.pattern,
    ),
]
_STATE_LOCK = threading.Lock()
_CALL_ORDINAL = 0
_TOOL_ORDINALS: dict[tuple[str, str], int] = {}


def _audit_path() -> Path:
    configured = os.environ.get("PUPU_SOAK_AUDIT_PATH", "").strip()
    if configured:
        rendered = configured.replace("{pid}", str(os.getpid()))
        return Path(rendered).expanduser().resolve()
    return Path(tempfile.gettempdir()) / f"pupu-deterministic-mcp-{os.getpid()}.jsonl"


def _state_root() -> Path:
    configured = os.environ.get("PUPU_SOAK_AUDIT_PATH", "").strip()
    if configured:
        shared_audit_path = Path(
            configured.replace("{pid}", "shared")
        ).expanduser().resolve()
    else:
        shared_audit_path = _audit_path()
    return shared_audit_path.parent / f".{shared_audit_path.name}.state"


def _state_file(namespace: str, lane: Lane, key: str, suffix: str) -> Path:
    identity = json.dumps(
        [namespace, lane, key],
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode("utf-8")
    digest = hashlib.sha256(identity).hexdigest()
    root = _state_root()
    root.mkdir(parents=True, exist_ok=True)
    return root / f"{namespace}-{digest}.{suffix}"


def _claim_once(namespace: str, lane: Lane, key: str) -> bool:
    marker_path = _state_file(namespace, lane, key, "marker")
    try:
        descriptor = os.open(
            marker_path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            0o600,
        )
    except FileExistsError:
        return False
    try:
        os.write(descriptor, f"{os.getpid()}\n".encode("ascii"))
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    return True


def _update_checkpoint(
    lane: Lane,
    checkpoint: str,
    iteration: int,
) -> tuple[int | None, bool]:
    state_path = _state_file("checkpoint", lane, checkpoint, "state")
    lock_path = _state_file("checkpoint", lane, checkpoint, "lock")
    temporary_path: Path | None = None
    with lock_path.open("a+", encoding="utf-8") as lock_handle:
        fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
        try:
            previous: int | None = None
            if state_path.exists():
                raw_previous = state_path.read_text(encoding="utf-8").strip()
                try:
                    previous = int(raw_previous)
                except ValueError as exc:
                    raise RuntimeError(
                        f"invalid deterministic checkpoint state: {state_path}"
                    ) from exc
            is_backwards = previous is not None and iteration < previous
            if not is_backwards and previous != iteration:
                descriptor, temporary_name = tempfile.mkstemp(
                    dir=state_path.parent,
                    prefix=f".{state_path.name}.",
                )
                temporary_path = Path(temporary_name)
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    handle.write(f"{iteration}\n")
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary_path, state_path)
                temporary_path = None
            return previous, is_backwards
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)


def _time_scale() -> float:
    raw = os.environ.get("PUPU_SOAK_TIME_SCALE", "1").strip() or "1"
    try:
        scale = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"PUPU_SOAK_TIME_SCALE must be numeric, got {raw!r}") from exc
    if not math.isfinite(scale) or scale < 0:
        raise RuntimeError("PUPU_SOAK_TIME_SCALE must be finite and non-negative")
    return scale


def _reserve_call(tool: str, lane: Lane) -> tuple[int, int]:
    global _CALL_ORDINAL
    with _STATE_LOCK:
        _CALL_ORDINAL += 1
        key = (tool, lane)
        tool_ordinal = _TOOL_ORDINALS.get(key, 0) + 1
        _TOOL_ORDINALS[key] = tool_ordinal
        return _CALL_ORDINAL, tool_ordinal


def _write_audit(
    *,
    tool: str,
    lane: Lane,
    args: dict[str, Any],
    call_ordinal: int,
    tool_ordinal: int,
    status: str,
    detail: dict[str, Any] | None = None,
) -> None:
    record: dict[str, Any] = {
        "tool": tool,
        "lane": lane,
        "args": args,
        "call_ordinal": call_ordinal,
        "tool_ordinal": tool_ordinal,
        "status": status,
        "pid": os.getpid(),
    }
    if detail:
        record["detail"] = detail
    path = _audit_path()
    payload = json.dumps(record, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    with _STATE_LOCK:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(payload + "\n")
            handle.flush()


def _canonical_result(
    *,
    tool: str,
    lane: Lane,
    args: dict[str, Any],
    call_ordinal: int,
    tool_ordinal: int,
    status: str = "ok",
    **extra: Any,
) -> dict[str, Any]:
    return {
        "ok": status == "ok",
        "tool": tool,
        "lane": lane,
        "args": args,
        "call_ordinal": call_ordinal,
        "tool_ordinal": tool_ordinal,
        "status": status,
        "audit_path": str(_audit_path()),
        **extra,
    }


def _validate_checkpoint(checkpoint: str) -> None:
    if not _CHECKPOINT_PATTERN.fullmatch(checkpoint):
        raise ValueError(
            "checkpoint must match ^[A-Za-z0-9][A-Za-z0-9._:-]*$"
        )


mcp = FastMCP(
    "PuPu deterministic soak fixture",
    instructions=(
        "Release-test fixture only. Call tools with their canonical defaults; "
        "do not invent or omit lane/iteration values."
    ),
    log_level="ERROR",
)


@mcp.tool(
    annotations=ToolAnnotations(
        title="Deterministic soak probe",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )
)
def soak_probe(
    lane: Lane,
    iteration: Iteration,
    marker: Literal[MARKER] = MARKER,
) -> dict[str, Any]:
    """Echo one canonical lane/iteration probe."""

    args = {"lane": lane, "iteration": iteration, "marker": marker}
    call_ordinal, tool_ordinal = _reserve_call("soak_probe", lane)
    _write_audit(
        tool="soak_probe",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        status="ok",
    )
    return _canonical_result(
        tool="soak_probe",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        token=f"probe:{lane}:{iteration}",
    )


@mcp.tool(
    annotations=ToolAnnotations(
        title="Deterministic scaled wait",
        readOnlyHint=True,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )
)
async def soak_wait(
    lane: Lane,
    milliseconds: Literal[WAIT_MILLISECONDS] = WAIT_MILLISECONDS,
    marker: Literal[MARKER] = MARKER,
) -> dict[str, Any]:
    """Wait for canonical 65000 ms, scaled only in wall-clock time for tests."""

    args = {"lane": lane, "milliseconds": milliseconds, "marker": marker}
    call_ordinal, tool_ordinal = _reserve_call("soak_wait", lane)
    scale = _time_scale()
    effective_milliseconds = milliseconds * scale
    wait_detail = {
        "effective_milliseconds": effective_milliseconds,
        "time_scale": scale,
    }
    _write_audit(
        tool="soak_wait",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        status="started",
        detail=wait_detail,
    )
    try:
        await asyncio.sleep(effective_milliseconds / 1000)
    except asyncio.CancelledError:
        _write_audit(
            tool="soak_wait",
            lane=lane,
            args=args,
            call_ordinal=call_ordinal,
            tool_ordinal=tool_ordinal,
            status="cancelled",
            detail=wait_detail,
        )
        raise
    _write_audit(
        tool="soak_wait",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        status="ok",
        detail=wait_detail,
    )
    return _canonical_result(
        tool="soak_wait",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        requested_milliseconds=milliseconds,
        effective_milliseconds=effective_milliseconds,
        time_scale=scale,
    )


@mcp.tool(
    annotations=ToolAnnotations(
        title="Deterministic destructive approval gate",
        readOnlyHint=False,
        destructiveHint=True,
        idempotentHint=True,
        openWorldHint=False,
    )
)
def soak_gate(
    lane: Lane,
    checkpoint: Literal[GATE_CHECKPOINT] = GATE_CHECKPOINT,
    marker: Literal[MARKER] = MARKER,
) -> dict[str, Any]:
    """Emit a canonical destructive tool call for pause/approval testing."""

    args = {"lane": lane, "checkpoint": checkpoint, "marker": marker}
    call_ordinal, tool_ordinal = _reserve_call("soak_gate", lane)
    _write_audit(
        tool="soak_gate",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        status="ok",
    )
    return _canonical_result(
        tool="soak_gate",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        gate=f"{lane}:{checkpoint}",
    )


@mcp.tool(
    annotations=ToolAnnotations(
        title="Deterministic progress checkpoint",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=True,
        openWorldHint=False,
    )
)
def soak_checkpoint(
    lane: Lane,
    checkpoint: Checkpoint,
    iteration: Iteration,
    marker: Literal[MARKER] = MARKER,
) -> dict[str, Any]:
    """Record monotonic per-lane progress and reject backwards checkpoints."""

    _validate_checkpoint(checkpoint)
    args = {
        "lane": lane,
        "checkpoint": checkpoint,
        "iteration": iteration,
        "marker": marker,
    }
    call_ordinal, tool_ordinal = _reserve_call("soak_checkpoint", lane)
    previous, is_backwards = _update_checkpoint(lane, checkpoint, iteration)
    if is_backwards:
        _write_audit(
            tool="soak_checkpoint",
            lane=lane,
            args=args,
            call_ordinal=call_ordinal,
            tool_ordinal=tool_ordinal,
            status="rejected_backwards",
            detail={"previous_iteration": previous},
        )
        raise ValueError(
            f"checkpoint iteration moved backwards for {lane}:{checkpoint}: "
            f"{iteration} < {previous}"
        )
    replayed = previous == iteration
    _write_audit(
        tool="soak_checkpoint",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        status="ok",
        detail={"previous_iteration": previous, "replayed": replayed},
    )
    return _canonical_result(
        tool="soak_checkpoint",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        previous_iteration=previous,
        replayed=replayed,
    )


@mcp.tool(
    annotations=ToolAnnotations(
        title="Deterministic fail-once probe",
        readOnlyHint=False,
        destructiveHint=False,
        idempotentHint=False,
        openWorldHint=False,
    )
)
def soak_fail_once(
    lane: Lane,
    key: Literal[FAIL_ONCE_KEY] = FAIL_ONCE_KEY,
    marker: Literal[MARKER] = MARKER,
) -> dict[str, Any]:
    """Fail exactly once per lane/key, then return success on every retry."""

    args = {"lane": lane, "key": key, "marker": marker}
    call_ordinal, tool_ordinal = _reserve_call("soak_fail_once", lane)
    should_fail = _claim_once("fail-once", lane, key)
    if should_fail:
        _write_audit(
            tool="soak_fail_once",
            lane=lane,
            args=args,
            call_ordinal=call_ordinal,
            tool_ordinal=tool_ordinal,
            status="failed_once",
        )
        raise RuntimeError(f"deterministic_fail_once:{lane}:{key}")
    _write_audit(
        tool="soak_fail_once",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        status="ok",
    )
    return _canonical_result(
        tool="soak_fail_once",
        lane=lane,
        args=args,
        call_ordinal=call_ordinal,
        tool_ordinal=tool_ordinal,
        recovered=True,
    )


def _forbid_extra_tool_arguments() -> None:
    """Make the pinned FastMCP argument models reject unknown JSON fields."""

    for tool in mcp._tool_manager.list_tools():
        argument_model = tool.fn_metadata.arg_model
        argument_model.model_config["extra"] = "forbid"
        argument_model.model_rebuild(force=True)
        tool.parameters = argument_model.model_json_schema(by_alias=True)


_forbid_extra_tool_arguments()


if __name__ == "__main__":
    mcp.run(transport="stdio")
