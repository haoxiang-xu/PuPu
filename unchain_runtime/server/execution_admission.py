"""Exact Stop intents carried by a fresh request, before execution admission."""
from __future__ import annotations

import re


_IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,511}$")


def validate_stopped_attempts(value, *, attempt_id: str, resume: bool) -> tuple[dict, ...]:
    if resume or not isinstance(value, list) or len(value) > 64:
        raise ValueError("stopped_attempts must be a bounded list for a fresh run")
    result = []
    seen = set()
    for entry in value:
        if (not isinstance(entry, dict) or "attempt_id" not in entry
                or set(entry) - {"attempt_id", "source_attempt_id", "interaction_id"}):
            raise ValueError("stopped_attempts contains an invalid entry")
        if any(not isinstance(v, str) or _IDENTIFIER.fullmatch(v) is None for v in entry.values()):
            raise ValueError("stopped_attempts contains an invalid identifier")
        if entry["attempt_id"] == attempt_id or entry["attempt_id"] in seen:
            raise ValueError("stopped_attempts must contain unique prior attempts")
        seen.add(entry["attempt_id"])
        result.append(dict(entry))
    return tuple(result)


def _attempt_owns_interaction(host, session_id, attempt_id, target) -> bool:
    source = target.request.source_run_id
    owner = host._durable_interaction_guard_owner_attempt(session_id, source)
    if attempt_id in {source, owner}:
        return True
    binding = host.load_execution_attempt_binding(session_id, attempt_id)
    bound_source = (binding or {}).get("source_attempt_id")
    return bool(bound_source and (bound_source == source or host._graph_step_follows_bound_interaction_source(
        session_id=session_id, bound_source_attempt_id=bound_source,
        current_source_attempt_id=source, interaction_id=target.request.interaction_id,
        bound_graph_guard_lineage=(binding or {}).get("source_graph_guard_lineage"),
        allow_resolved=not target.is_active,
    )))


def cancel_unstarted_attempt_with_foreign_interaction(*, session_id: str, attempt_id: str, reason: str, owner_chat_id: str = ""):
    """Cancel only an unadmitted ID, without waking an unrelated old waiter.

    The registry CAS shares mark_running's lock. If admission has won, normal
    durable cancellation must run instead, preserving canonical-before-signal.
    """
    import durable_interaction_host as host
    import execution_control as control
    from session_execution_guard import snapshot_session_guard

    active_id = host._active_interaction_id(session_id)
    if not active_id or host.load_execution_attempt_binding(session_id, attempt_id) is not None:
        return None
    guard = snapshot_session_guard(session_id=session_id)
    if guard is None and control.snapshot(session_id, attempt_id) is None:
        return None
    if guard is not None and guard.attempt_id == attempt_id:
        return None
    target = host._interaction_cancel_target(session_id, active_id)
    if target is None or _attempt_owns_interaction(host, session_id, attempt_id, target):
        return None
    owner = host._cold_interaction_owner_chat_id(
        session_id, attempt_id, explicit_owner_chat_id=owner_chat_id,
    )
    host._cold_active_interaction_required(owner_chat_id=owner, session_id=session_id)
    registry = control._DEFAULT_REGISTRY
    def transition(current, now_ms):
        if current is None:
            return registry._new_snapshot(session_id, attempt_id, status="cancelled",
                now_ms=now_ms, terminal_at_ms=now_ms, reason=reason), "cancelled_before_register"
        if current.status == "registered" and current.running_at_ms is None:
            return registry._advance(current, status="cancelled", now_ms=now_ms,
                terminal_at_ms=now_ms, reason=reason), "applied"
        if current.cancelled and current.running_at_ms is None:
            return None, "unchanged"
        return None, "not_unstarted"
    result = registry._mutate(session_id, attempt_id, transition)
    if result.disposition == "not_unstarted":
        return None
    return {"status": "ok", "execution_id": session_id, "attempt_id": attempt_id,
        "source_attempt_id": attempt_id, "disposition": result.disposition,
        "state": "cancelled", "execution": result.snapshot.to_dict(),
        "cancellation": {"requested_at_ms": result.snapshot.terminal_at_ms,
                         "fencing_token": None, "reason": reason},
        "durable_interaction_cancelled": False, "context_interaction_reconciled": False}


def reconcile_stopped_attempts(*, session_id: str, owner_chat_id: str, attempt_id: str, stopped_attempts):
    import durable_interaction_host as host
    import execution_control as control

    for entry in stopped_attempts:
        for retry in range(3):
            successor = control.snapshot(session_id, attempt_id)
            if successor is not None and successor.cancelled:
                return
            stopped_id = entry["attempt_id"]
            expected_id = entry.get("interaction_id", "")
            target = host._interaction_cancel_target(session_id, expected_id) if expected_id else None
            if target is not None and not _attempt_owns_interaction(host, session_id, stopped_id, target):
                raise host.DurableInteractionHostError("stopped_attempt_lineage_mismatch",
                    "Stopped attempt does not own the captured interaction", status_code=409, retryable=False)
            binding = host.load_execution_attempt_binding(session_id, stopped_id)
            if entry.get("source_attempt_id") and binding is not None and binding.get("source_attempt_id") != entry["source_attempt_id"]:
                raise host.DurableInteractionHostError("stopped_attempt_lineage_mismatch",
                    "Stopped attempt source changed", status_code=409, retryable=False)
            active_id = host._active_interaction_id(session_id)
            active = host._interaction_cancel_target(session_id, active_id) if active_id else None
            if active is not None:
                if _attempt_owns_interaction(host, session_id, stopped_id, active):
                    expected_id = active_id
                else:
                    previous = control.snapshot(session_id, stopped_id)
                    if previous is not None and previous.terminal:
                        break
                    expected_id = ""  # Only the unstarted-attempt CAS may succeed.
            elif target is None or not target.is_cancelled_applied:
                expected_id = ""
            source_hint = entry.get("source_attempt_id")
            chosen = active if active is not None and expected_id == active_id else target
            if source_hint and binding is None and source_hint not in {
                stopped_id, getattr(getattr(chosen, "request", None), "source_run_id", None),
            }:
                raise host.DurableInteractionHostError("stopped_attempt_lineage_mismatch",
                    "Stopped attempt source has no durable binding", status_code=409, retryable=False)
            try:
                host.cancel_chat_execution(session_id=session_id, attempt_id=stopped_id,
                    owner_chat_id=owner_chat_id, expected_interaction_id=expected_id,
                    reason="user_stop")
                break
            except host.DurableInteractionHostError as error:
                if retry == 2 or error.code not in {"interaction_cancel_target_required",
                        "interaction_cancel_target_changed", "interaction_cancel_target_not_pending"}:
                    raise
