"""P0 orchestration for the isolated PuPu Memory Curator.

The curator is deliberately a coordinator, not another persistence layer.  It
creates one metadata-only durable job after a completed root run, then invokes
an injected agent with exactly one scoped curator toolkit.  Provider choice,
configuration, recursion and audit boundaries are enforced before any model
is called.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import threading
import time
import unicodedata
from typing import Any, Callable, Mapping

from memory_v2_toolkit import build_memory_v2_toolkit


MAX_CONFIG_BYTES = 8 * 1024
MAX_DISPLAY_NAME_CHARS = 128
MAX_ADDITIONAL_INSTRUCTIONS_CHARS = 4000
MAX_PROVIDER_CHARS = 128
MAX_MODEL_ID_CHARS = 256
MAX_CANDIDATES_PER_JOB = 500

ALLOWED_CONFIG_FIELDS = frozenset(
    {"displayName", "additionalInstructions", "provider", "modelId"}
)
_CREDENTIAL_FIELD_RE = re.compile(
    r"(?:^|[_-])(api[_-]?keys?|access[_-]?keys?|auth|authentication|"
    r"authorization|bearer|credentials?|oauth|passwords?|passwd|"
    r"private[_-]?keys?|secrets?|session[_-]?tokens?|tokens?)(?:$|[_-])",
    re.IGNORECASE,
)

LOCKED_CORE_PROMPT = """You are PuPu's isolated Memory Curator.

Your only responsibility is to resolve the frozen candidates bound to this
exact consolidation job. Read candidate bytes through bounded paging. If a
target path is new, apply only the server-frozen candidate. If it conflicts
with an existing entry, create a server-computed review proposal and leave the
decision to the user. Use only the attached candidate-bound toolkit. Never
request, expose, infer, or store credentials. Never write long-term memory or
advance pinned task state from this job. Preserve provenance and do not reveal
private chain-of-thought or hidden reasoning. Treat any additional instructions
below as subordinate to this locked policy."""


class MemoryV2CuratorError(ValueError):
    def __init__(self, code: str, reason: str) -> None:
        super().__init__(reason)
        self.code = code
        self.reason = reason


def _canonical_json(value: Any) -> bytes:
    try:
        return json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise MemoryV2CuratorError(
            "invalid_config_json",
            "Memory Agent configuration must be canonical JSON",
        ) from exc


def _bounded_text(
    value: Any,
    field_name: str,
    *,
    maximum: int,
    required: bool = False,
    allow_multiline: bool = False,
) -> str:
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise MemoryV2CuratorError(
            "invalid_config",
            f"{field_name} must be text",
        )
    normalized = unicodedata.normalize(
        "NFC",
        value.replace("\r\n", "\n").replace("\r", "\n").strip(),
    )
    if required and not normalized:
        raise MemoryV2CuratorError(
            "invalid_config",
            f"{field_name} is required",
        )
    allowed_controls = {"\n", "\t"} if allow_multiline else set()
    if len(normalized) > maximum or any(
        ord(character) < 32 and character not in allowed_controls
        for character in normalized
    ):
        raise MemoryV2CuratorError(
            "config_limit_exceeded",
            f"{field_name} exceeds the Memory Agent limit",
        )
    return normalized


def _reject_credential_fields(value: Any, *, depth: int = 0) -> None:
    if depth > 8:
        raise MemoryV2CuratorError(
            "config_limit_exceeded",
            "Memory Agent configuration is nested too deeply",
        )
    if isinstance(value, Mapping):
        if len(value) > 100:
            raise MemoryV2CuratorError(
                "config_limit_exceeded",
                "Memory Agent configuration has too many fields",
            )
        for raw_key, child in value.items():
            key = str(raw_key or "").strip()
            camel_separated = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", key)
            normalized_key = re.sub(
                r"[^a-z0-9]+",
                "_",
                camel_separated.casefold(),
            ).strip("_")
            if _CREDENTIAL_FIELD_RE.search(normalized_key):
                raise MemoryV2CuratorError(
                    "credential_field_rejected",
                    "Credential-like fields are not allowed in Memory Agent configuration",
                )
            _reject_credential_fields(child, depth=depth + 1)
    elif isinstance(value, (list, tuple)):
        if len(value) > 100:
            raise MemoryV2CuratorError(
                "config_limit_exceeded",
                "Memory Agent configuration has too many values",
            )
        for child in value:
            _reject_credential_fields(child, depth=depth + 1)


def sanitize_memory_agent_config(config: Mapping[str, Any] | None) -> dict[str, str]:
    """Return the four-field model-safe Memory Agent configuration."""

    if config is None:
        return {}
    if not isinstance(config, Mapping):
        raise MemoryV2CuratorError(
            "invalid_config",
            "Memory Agent configuration must be an object",
        )
    if len(_canonical_json(config)) > MAX_CONFIG_BYTES:
        raise MemoryV2CuratorError(
            "config_limit_exceeded",
            "Memory Agent configuration exceeds the byte limit",
        )
    _reject_credential_fields(config)
    sanitized: dict[str, str] = {}
    limits = {
        "displayName": MAX_DISPLAY_NAME_CHARS,
        "additionalInstructions": MAX_ADDITIONAL_INSTRUCTIONS_CHARS,
        "provider": MAX_PROVIDER_CHARS,
        "modelId": MAX_MODEL_ID_CHARS,
    }
    for field_name in ALLOWED_CONFIG_FIELDS:
        if field_name not in config:
            continue
        value = _bounded_text(
            config.get(field_name),
            field_name,
            maximum=limits[field_name],
            allow_multiline=field_name == "additionalInstructions",
        )
        if value:
            sanitized[field_name] = value
    if len(_canonical_json(sanitized)) > MAX_CONFIG_BYTES:
        raise MemoryV2CuratorError(
            "config_limit_exceeded",
            "Sanitized Memory Agent configuration exceeds the byte limit",
        )
    return sanitized


def memory_agent_config_fingerprint(config: Mapping[str, Any] | None) -> str:
    sanitized = sanitize_memory_agent_config(config)
    return hashlib.sha256(_canonical_json(sanitized)).hexdigest()


def _provider_default_values(
    provider_default: Mapping[str, Any] | None,
) -> tuple[str, str] | tuple[None, None]:
    if provider_default is None:
        return None, None
    if not isinstance(provider_default, Mapping):
        raise MemoryV2CuratorError(
            "invalid_provider_default",
            "provider_default must be an object",
        )
    provider = _bounded_text(
        provider_default.get("provider"),
        "provider_default.provider",
        maximum=MAX_PROVIDER_CHARS,
    )
    model_id = _bounded_text(
        provider_default.get("modelId", provider_default.get("model_id")),
        "provider_default.modelId",
        maximum=MAX_MODEL_ID_CHARS,
    )
    return provider or None, model_id or None


def select_curator_model(
    *,
    config: Mapping[str, Any] | None,
    provider_default: Mapping[str, Any] | None = None,
    chat_provider: str = "",
    chat_model_id: str = "",
) -> dict[str, Any]:
    """Select a model without ever crossing a provider boundary silently."""

    try:
        sanitized = sanitize_memory_agent_config(config)
        default_provider, default_model = _provider_default_values(provider_default)
        current_provider = _bounded_text(
            chat_provider,
            "chat_provider",
            maximum=MAX_PROVIDER_CHARS,
        )
        current_model = _bounded_text(
            chat_model_id,
            "chat_model_id",
            maximum=MAX_MODEL_ID_CHARS,
        )
    except MemoryV2CuratorError as exc:
        return {"status": "Failed", "reason": exc.code}

    explicit_provider = sanitized.get("provider", "")
    explicit_model = sanitized.get("modelId", "")
    if explicit_model and not explicit_provider:
        return {
            "status": "Failed",
            "reason": "explicit_model_requires_provider",
        }
    if explicit_provider and explicit_model:
        return {
            "status": "Ready",
            "provider": explicit_provider,
            "model_id": explicit_model,
            "source": "user_explicit",
        }
    if explicit_provider:
        if default_provider == explicit_provider and default_model:
            return {
                "status": "Ready",
                "provider": explicit_provider,
                "model_id": default_model,
                "source": "provider_default",
            }
        if current_provider == explicit_provider and current_model:
            return {
                "status": "Ready",
                "provider": explicit_provider,
                "model_id": current_model,
                "source": "chat_same_provider_fallback",
            }
        return {
            "status": "Pending",
            "reason": "explicit_provider_model_unavailable",
            "provider": explicit_provider,
        }

    if default_provider and default_model:
        return {
            "status": "Ready",
            "provider": default_provider,
            "model_id": default_model,
            "source": "provider_default",
        }
    if default_provider:
        if current_provider == default_provider and current_model:
            return {
                "status": "Ready",
                "provider": default_provider,
                "model_id": current_model,
                "source": "chat_same_provider_fallback",
            }
        return {
            "status": "Pending",
            "reason": "provider_default_model_unavailable",
            "provider": default_provider,
        }
    if default_model:
        return {
            "status": "Failed",
            "reason": "provider_default_requires_provider",
        }
    if current_provider and current_model:
        return {
            "status": "Ready",
            "provider": current_provider,
            "model_id": current_model,
            "source": "chat_model_fallback",
        }
    return {"status": "Pending", "reason": "curator_model_unavailable"}


class MemoryV2Curator:
    _guard_lock = threading.RLock()
    _active_job_ids: set[str] = set()

    def __init__(
        self,
        runtime: Any,
        *,
        agent_factory: Callable[..., Any] | None = None,
        event_callback: Callable[[dict[str, Any]], Any] | None = None,
        toolkit_factory: Callable[..., Any] = build_memory_v2_toolkit,
        namespace: str = "user:local",
        clock_ms: Callable[[], int] | None = None,
    ) -> None:
        self.runtime = runtime
        self.agent_factory = agent_factory
        self.event_callback = event_callback
        self.toolkit_factory = toolkit_factory
        self.namespace = _bounded_text(
            namespace,
            "namespace",
            maximum=255,
            required=True,
        )
        self._clock_ms = clock_ms or (lambda: int(time.time() * 1000))
        self._finished_job_ids: set[str] = set()
        self._finished_lock = threading.RLock()

    @staticmethod
    def _normalize_identifier(value: Any, field_name: str) -> str:
        normalized = _bounded_text(
            value,
            field_name,
            maximum=512,
            required=True,
        )
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,511}", normalized):
            raise MemoryV2CuratorError(
                "invalid_scope",
                f"{field_name} is invalid",
            )
        return normalized

    def _find_existing_run_job(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        run_id: str,
    ) -> dict[str, Any] | None:
        listing = self.runtime.list_consolidation_jobs(
            owner_chat_id=owner_chat_id,
            limit=MAX_CANDIDATES_PER_JOB,
        )
        for job in listing.get("jobs") or []:
            if job.get("session_id") != session_id or job.get("attempt_id") != attempt_id:
                continue
            payload = job.get("payload") if isinstance(job.get("payload"), Mapping) else {}
            trigger = payload.get("trigger") if isinstance(payload.get("trigger"), Mapping) else {}
            if (
                job.get("job_type") == "memory_curator"
                and trigger.get("kind") == "completed_root_run"
                and trigger.get("run_id") == run_id
            ):
                return dict(job)
        return None

    def _isolate_source_attempt(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        run_id: str,
        reason: str,
    ) -> dict[str, Any] | None:
        operation_id = "memory_curator_isolate:" + hashlib.sha256(
            f"{owner_chat_id}:{session_id}:{attempt_id}:{run_id}:{reason}".encode(
                "utf-8"
            )
        ).hexdigest()
        return self.runtime.isolate_candidates_for_attempt(
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            reason=reason,
            operation_id=operation_id,
        )

    def enqueue_for_completed_root_run(
        self,
        *,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        run_id: str,
        run_status: str,
        capture_outcome: str = "complete",
        is_root_run: bool = True,
        memory_agent_config: Mapping[str, Any] | None = None,
        provider_default: Mapping[str, Any] | None = None,
        chat_provider: str = "",
        chat_model_id: str = "",
    ) -> dict[str, Any]:
        try:
            owner = self._normalize_identifier(owner_chat_id, "owner_chat_id")
            session = self._normalize_identifier(session_id, "session_id")
            attempt = self._normalize_identifier(attempt_id, "attempt_id")
            run = self._normalize_identifier(run_id, "run_id")
        except MemoryV2CuratorError as exc:
            return {"status": "Failed", "reason": exc.code, "job": None}
        if not isinstance(is_root_run, bool):
            return {"status": "Failed", "reason": "invalid_root_run_flag", "job": None}
        normalized_run_status = str(run_status or "").strip().lower()
        normalized_capture = str(capture_outcome or "").strip().lower()
        if not is_root_run:
            reason = "not_root_run"
            try:
                isolation = self._isolate_source_attempt(
                    owner_chat_id=owner,
                    session_id=session,
                    attempt_id=attempt,
                    run_id=run,
                    reason=reason,
                )
            except Exception as exc:
                return {
                    "status": "Failed",
                    "reason": self._safe_error_code(
                        exc,
                        "candidate_isolation_failed",
                    ),
                    "job": None,
                }
            return {
                "status": "Isolated",
                "reason": reason,
                "job": None,
                "isolation": isolation,
            }
        if normalized_run_status not in {"complete", "completed"}:
            reason = (
                "root_run_cancelled"
                if normalized_run_status in {"cancelled", "canceled"}
                else "root_run_failed"
            )
            try:
                isolation = self._isolate_source_attempt(
                    owner_chat_id=owner,
                    session_id=session,
                    attempt_id=attempt,
                    run_id=run,
                    reason=reason,
                )
            except Exception as exc:
                return {
                    "status": "Failed",
                    "reason": self._safe_error_code(
                        exc,
                        "candidate_isolation_failed",
                    ),
                    "job": None,
                }
            return {
                "status": "Isolated",
                "reason": reason,
                "job": None,
                "isolation": isolation,
            }
        if normalized_capture != "complete":
            reason = f"capture_{normalized_capture or 'unavailable'}"
            try:
                isolation = self._isolate_source_attempt(
                    owner_chat_id=owner,
                    session_id=session,
                    attempt_id=attempt,
                    run_id=run,
                    reason=reason,
                )
            except Exception as exc:
                return {
                    "status": "Failed",
                    "reason": self._safe_error_code(
                        exc,
                        "candidate_isolation_failed",
                    ),
                    "job": None,
                }
            return {
                "status": "Isolated",
                "reason": reason,
                "job": None,
                "isolation": isolation,
            }

        existing = self._find_existing_run_job(
            owner_chat_id=owner,
            session_id=session,
            attempt_id=attempt,
            run_id=run,
        )
        if existing is not None:
            existing_payload = (
                existing.get("payload")
                if isinstance(existing.get("payload"), Mapping)
                else {}
            )
            existing_candidates = (
                existing_payload.get("candidates")
                if isinstance(existing_payload.get("candidates"), list)
                else []
            )
            existing_model = (
                copy.deepcopy(existing_payload.get("model"))
                if isinstance(existing_payload.get("model"), Mapping)
                else {}
            )
            return {
                "status": "Enqueued",
                "reason": "already_enqueued",
                "job": existing,
                "candidate_count": len(existing_candidates),
                "model": existing_model,
                "replayed": True,
            }

        listing = self.runtime.list_candidates(
            owner_chat_id=owner,
            status="pending",
            limit=MAX_CANDIDATES_PER_JOB,
        )
        candidates = [
            candidate
            for candidate in listing.get("candidates") or []
            if candidate.get("owner_chat_id") == owner
            and candidate.get("session_id") == session
            and candidate.get("attempt_id") == attempt
            and candidate.get("status") == "pending"
        ]
        if not candidates:
            return {
                "status": "NoOp",
                "reason": "no_pending_candidates",
                "job": None,
                "candidate_count": 0,
            }

        try:
            sanitized_config = sanitize_memory_agent_config(memory_agent_config)
        except MemoryV2CuratorError as exc:
            return {"status": "Failed", "reason": exc.code, "job": None}
        selection = select_curator_model(
            config=sanitized_config,
            provider_default=provider_default,
            chat_provider=chat_provider,
            chat_model_id=chat_model_id,
        )
        if selection.get("status") != "Ready":
            return {
                "status": selection.get("status", "Failed"),
                "reason": selection.get("reason", "curator_model_unavailable"),
                "job": None,
            }
        try:
            candidate_refs = []
            for candidate in candidates:
                revision = candidate.get("revision")
                if isinstance(revision, bool):
                    raise ValueError
                candidate_refs.append(
                    {
                        "candidate_id": self._normalize_identifier(
                            candidate.get("candidate_id"),
                            "candidate_id",
                        ),
                        "revision": int(revision),
                        "candidate_ref": str(candidate.get("candidate_ref") or ""),
                    }
                )
            candidate_refs.sort(key=lambda item: item["candidate_id"])
        except (MemoryV2CuratorError, TypeError, ValueError):
            return {"status": "Failed", "reason": "invalid_candidate_revision", "job": None}
        if any(item["revision"] <= 0 for item in candidate_refs):
            return {"status": "Failed", "reason": "invalid_candidate_revision", "job": None}
        for item in candidate_refs:
            expected_ref = (
                f"pupu://memory/candidate/{item['candidate_id']}@{item['revision']}"
            )
            if item["candidate_ref"] and item["candidate_ref"] != expected_ref:
                return {
                    "status": "Failed",
                    "reason": "candidate_ref_mismatch",
                    "job": None,
                }
            item["candidate_ref"] = expected_ref
        fingerprint = hashlib.sha256(_canonical_json(sanitized_config)).hexdigest()
        payload = {
            "trigger": {"kind": "completed_root_run", "run_id": run},
            "candidates": candidate_refs,
            "model": {
                "provider": selection["provider"],
                "model_id": selection["model_id"],
                "source": selection["source"],
            },
            "config_fingerprint": fingerprint,
        }
        operation_id = "memory_curator_enqueue:" + hashlib.sha256(
            f"{owner}:{session}:{attempt}:{run}".encode("utf-8")
        ).hexdigest()
        try:
            job = self.runtime.enqueue_curator_job_with_candidates(
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                job_type="memory_curator",
                payload=payload,
                candidate_refs=[
                    {
                        "candidate_id": item["candidate_id"],
                        "revision": item["revision"],
                    }
                    for item in candidate_refs
                ],
                operation_id=operation_id,
            )
        except Exception as exc:
            return {
                "status": "Failed",
                "reason": self._safe_error_code(exc, "job_enqueue_failed"),
                "job": None,
            }
        return {
            "status": "Enqueued",
            "reason": "completed_root_run",
            "job": job,
            "candidate_count": len(candidate_refs),
            "model": copy.deepcopy(payload["model"]),
            "replayed": bool(job.get("replayed", False)),
        }

    @staticmethod
    def _safe_error_code(exc: Exception, fallback: str) -> str:
        explicit = str(getattr(exc, "code", "") or "").strip().lower()
        if explicit:
            normalized = re.sub(r"[^a-z0-9_:-]+", "_", explicit).strip("_")
            return normalized[:96] or fallback
        type_name = re.sub(r"[^a-z0-9]+", "_", type(exc).__name__.lower()).strip("_")
        return type_name[:96] or fallback

    def _emit_audit(
        self,
        events: list[dict[str, Any]],
        event_type: str,
        **fields: Any,
    ) -> None:
        event = {
            "type": event_type,
            "timestamp_ms": self._clock_ms(),
            **copy.deepcopy(fields),
        }
        events.append(event)
        if self.event_callback is not None:
            try:
                self.event_callback(copy.deepcopy(event))
            except Exception:
                pass

    def _current_job(self, job: Mapping[str, Any]) -> dict[str, Any]:
        owner = str(job.get("owner_chat_id") or "")
        if not owner:
            return dict(job)
        try:
            listing = self.runtime.list_consolidation_jobs(
                owner_chat_id=owner,
                limit=MAX_CANDIDATES_PER_JOB,
            )
        except Exception:
            return dict(job)
        for current in listing.get("jobs") or []:
            if current.get("job_id") == job.get("job_id"):
                merged = dict(job)
                merged.update(current)
                if job.get("lease_token") and not merged.get("lease_token"):
                    merged["lease_token"] = job.get("lease_token")
                return merged
        return dict(job)

    @staticmethod
    def _candidate_input(candidate: Mapping[str, Any]) -> dict[str, Any]:
        visible = {
            key: copy.deepcopy(candidate.get(key))
            for key in (
                "candidate_id",
                "candidate_ref",
                "candidate_revision",
                "candidate_payload_hash",
                "binding_revision",
                "outcome",
                "target_space_id",
                "target_path",
                "kind",
                "description",
                "mime_type",
                "rationale",
                "confidence",
                "sensitivity",
                "source_event_ids",
                "source_refs",
                "content",
            )
        }
        if not isinstance(visible.get("source_refs"), list):
            visible["source_refs"] = [
                f"pupu://context/event/{event_id}"
                for event_id in (candidate.get("source_event_ids") or [])
                if str(event_id or "").strip()
            ]
        return visible

    def _terminal_complete(self, job: Mapping[str, Any], worker_id: str) -> Any:
        return self.runtime.complete_consolidation_job(
            owner_chat_id=job["owner_chat_id"],
            job_id=job["job_id"],
            worker_id=worker_id,
            lease_token=job["lease_token"],
            expected_revision=int(job["revision"]),
            operation_id="memory_curator_complete:"
            + hashlib.sha256(str(job["job_id"]).encode("utf-8")).hexdigest(),
        )

    def _terminal_fail(
        self,
        job: Mapping[str, Any],
        worker_id: str,
        error_code: str,
    ) -> Any:
        return self.runtime.fail_consolidation_job(
            owner_chat_id=job["owner_chat_id"],
            job_id=job["job_id"],
            worker_id=worker_id,
            lease_token=job["lease_token"],
            expected_revision=int(job["revision"]),
            operation_id="memory_curator_fail:"
            + hashlib.sha256(str(job["job_id"]).encode("utf-8")).hexdigest(),
            error_code=error_code,
            retry_at_ms=0,
        )

    def _fail_leased_preflight(
        self,
        *,
        job: Mapping[str, Any],
        worker_id: str,
        reason: str,
        owner_chat_id: str,
        session_id: str,
        attempt_id: str,
        run_id: str = "",
        candidate_count: int = 0,
        provider: str = "",
        model_id: str = "",
    ) -> dict[str, Any]:
        """Terminally isolate a leased job that cannot safely reach a model."""

        error_code = self._safe_error_code(
            MemoryV2CuratorError(reason, reason),
            "curator_preflight_failed",
        )
        terminal = None
        try:
            terminal = self._terminal_fail(job, worker_id, error_code)
        except Exception:
            error_code = "curator_terminal_update_failed"
        with self._finished_lock:
            self._finished_job_ids.add(str(job.get("job_id") or ""))
        audit: list[dict[str, Any]] = []
        self._emit_audit(
            audit,
            "memory.curator.failed",
            job_id=str(job.get("job_id") or ""),
            owner_chat_id=owner_chat_id,
            session_id=session_id,
            attempt_id=attempt_id,
            run_id=run_id,
            candidate_count=max(0, min(int(candidate_count or 0), 1000)),
            **({"provider": provider} if provider else {}),
            **({"model_id": model_id} if model_id else {}),
            error_code=error_code,
            model_invoked=False,
            duration_ms=0,
            token_usage=0,
            cost=0,
        )
        return {
            "status": "Failed",
            "reason": error_code,
            "job_id": str(job.get("job_id") or ""),
            "terminal": terminal,
            "token_usage": 0,
            "cost": 0,
            "audit": audit,
        }

    def run_job(
        self,
        *,
        job: Mapping[str, Any],
        memory_agent_config: Mapping[str, Any] | None = None,
        worker_id: str = "",
    ) -> dict[str, Any]:
        if not isinstance(job, Mapping):
            return {"status": "Failed", "reason": "invalid_job", "audit": []}
        if isinstance(job.get("job"), Mapping):
            job = job["job"]
        current = self._current_job(job)
        try:
            job_id = self._normalize_identifier(current.get("job_id"), "job_id")
            owner = self._normalize_identifier(current.get("owner_chat_id"), "owner_chat_id")
            session = self._normalize_identifier(current.get("session_id"), "session_id")
            attempt = self._normalize_identifier(current.get("attempt_id"), "attempt_id")
        except MemoryV2CuratorError as exc:
            return {"status": "Failed", "reason": exc.code, "audit": []}
        if current.get("job_type") != "memory_curator":
            return {"status": "Failed", "reason": "wrong_job_type", "audit": []}
        with self._finished_lock:
            if job_id in self._finished_job_ids:
                return {
                    "status": "AlreadyCompleted",
                    "reason": "duplicate_callback",
                    "job_id": job_id,
                    "audit": [],
                }
        status = str(current.get("status") or "").lower()
        if status == "completed":
            with self._finished_lock:
                self._finished_job_ids.add(job_id)
            return {
                "status": "AlreadyCompleted",
                "reason": "durable_job_completed",
                "job_id": job_id,
                "audit": [],
            }
        if status in {"failed", "cancelled"}:
            return {
                "status": "Failed",
                "reason": f"durable_job_{status}",
                "job_id": job_id,
                "audit": [],
            }
        lease_owner = str(worker_id or current.get("lease_owner") or "").strip()
        if (
            status != "leased"
            or not lease_owner
            or not isinstance(current.get("lease_token"), str)
            or not current.get("lease_token")
        ):
            return {
                "status": "Pending",
                "reason": "job_not_leased",
                "job_id": job_id,
                "audit": [],
            }

        try:
            capture = self.runtime.get_capture_task_state(
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
            )
        except Exception as exc:
            capture = None
            isolation_code = self._safe_error_code(
                exc,
                "source_capture_unavailable",
            )
        else:
            capture_quality = (
                str(capture.get("capture_quality") or "").strip().lower()
                if isinstance(capture, Mapping)
                else ""
            )
            isolation_code = (
                ""
                if capture_quality == "complete"
                else f"source_capture_{capture_quality or 'unavailable'}"
            )
        if isolation_code:
            terminal = None
            try:
                terminal = self._terminal_fail(current, lease_owner, isolation_code)
            except Exception:
                isolation_code = "source_capture_terminal_update_failed"
            audit: list[dict[str, Any]] = []
            self._emit_audit(
                audit,
                "memory.curator.failed",
                job_id=job_id,
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                error_code=isolation_code,
                model_invoked=False,
            )
            return {
                "status": "Isolated",
                "reason": isolation_code,
                "job_id": job_id,
                "terminal": terminal,
                "audit": audit,
            }

        payload = current.get("payload")
        if not isinstance(payload, Mapping):
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason="invalid_job_payload",
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
            )
        try:
            sanitized_config = sanitize_memory_agent_config(memory_agent_config)
        except MemoryV2CuratorError as exc:
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason=exc.code,
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
            )
        fingerprint = hashlib.sha256(_canonical_json(sanitized_config)).hexdigest()
        if payload.get("config_fingerprint") != fingerprint:
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason="config_fingerprint_mismatch",
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
            )
        model = payload.get("model") if isinstance(payload.get("model"), Mapping) else {}
        provider = str(model.get("provider") or "").strip()
        model_id = str(model.get("model_id") or "").strip()
        if not provider or not model_id:
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason="invalid_model_selection",
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                provider=provider,
                model_id=model_id,
            )
        trigger = payload.get("trigger") if isinstance(payload.get("trigger"), Mapping) else {}
        run_id = str(trigger.get("run_id") or "").strip()
        if trigger.get("kind") != "completed_root_run" or not run_id:
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason="invalid_job_trigger",
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                provider=provider,
                model_id=model_id,
            )
        candidate_refs = payload.get("candidates")
        if not isinstance(candidate_refs, list) or not candidate_refs:
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason="invalid_candidate_refs",
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                run_id=run_id,
                provider=provider,
                model_id=model_id,
            )

        try:
            listing = self.runtime.list_job_candidates(
                owner_chat_id=owner,
                job_id=job_id,
                outcome="processing",
                limit=MAX_CANDIDATES_PER_JOB,
            )
        except Exception as exc:
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason=self._safe_error_code(
                    exc,
                    "bound_candidate_set_unavailable",
                ),
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                run_id=run_id,
                candidate_count=len(candidate_refs),
                provider=provider,
                model_id=model_id,
            )
        frozen: dict[str, Mapping[str, Any]] = {}
        for candidate in listing.get("candidates") or []:
            candidate_ref = str(candidate.get("candidate_ref") or "")
            if candidate_ref:
                frozen[candidate_ref] = candidate
        expected_refs: list[str] = []
        try:
            for reference in candidate_refs:
                if not isinstance(reference, Mapping):
                    raise ValueError
                candidate_id = self._normalize_identifier(
                    reference.get("candidate_id"),
                    "candidate_id",
                )
                revision = int(reference.get("revision"))
                if revision <= 0:
                    raise ValueError
                expected_ref = (
                    f"pupu://memory/candidate/{candidate_id}@{revision}"
                )
                if reference.get("candidate_ref") not in {None, "", expected_ref}:
                    raise ValueError
                expected_refs.append(expected_ref)
        except (MemoryV2CuratorError, TypeError, ValueError):
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason="invalid_candidate_refs",
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                run_id=run_id,
                candidate_count=len(candidate_refs),
                provider=provider,
                model_id=model_id,
            )
        if (
            len(frozen) != len(expected_refs)
            or len(set(expected_refs)) != len(expected_refs)
            or not all(candidate_ref in frozen for candidate_ref in expected_refs)
        ):
            return self._fail_leased_preflight(
                job=current,
                worker_id=lease_owner,
                reason="candidate_set_changed",
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                run_id=run_id,
                candidate_count=len(expected_refs),
                provider=provider,
                model_id=model_id,
            )
        candidates = [frozen[candidate_ref] for candidate_ref in expected_refs]

        with self._guard_lock:
            if job_id in self._active_job_ids:
                return {
                    "status": "Failed",
                    "reason": "recursion_guard",
                    "job_id": job_id,
                    "audit": [],
                }
            self._active_job_ids.add(job_id)

        audit: list[dict[str, Any]] = []
        started_at = self._clock_ms()
        self._emit_audit(
            audit,
            "memory.curator.started",
            job_id=job_id,
            owner_chat_id=owner,
            session_id=session,
            attempt_id=attempt,
            run_id=run_id,
            candidate_count=len(candidates),
            provider=provider,
            model_id=model_id,
        )
        try:
            if self.agent_factory is None:
                raise MemoryV2CuratorError(
                    "agent_factory_unavailable",
                    "Memory Curator agent factory is unavailable",
                )
            toolkit = self.toolkit_factory(
                self.runtime,
                owner,
                session,
                attempt,
                run_id,
                curator=True,
                namespace=self.namespace,
                consolidation_job_id=job_id,
                consolidation_candidate_refs=[
                    str(candidate.get("candidate_ref") or "")
                    for candidate in candidates
                ],
                consolidation_source_refs=sorted(
                    {
                        str(source_ref)
                        for candidate in candidates
                        for source_ref in (candidate.get("source_refs") or [])
                        if str(source_ref or "").strip()
                    }
                ),
            )
            additional = sanitized_config.get("additionalInstructions", "")
            system_prompt = LOCKED_CORE_PROMPT
            if additional:
                system_prompt += (
                    "\n\nBounded operator instructions (lower priority):\n"
                    + additional
                )
            agent = self.agent_factory(
                provider=provider,
                model_id=model_id,
                system_prompt=system_prompt,
                toolkit=toolkit,
                display_name=sanitized_config.get("displayName", "Memory Curator"),
            )
            request_payload = {
                "task": "Curate the pending memory candidates using only the attached toolkit.",
                "trigger": copy.deepcopy(trigger),
                "candidates": [self._candidate_input(candidate) for candidate in candidates],
            }
            if hasattr(agent, "run") and callable(agent.run):
                result = agent.run(request_payload)
            elif callable(agent):
                result = agent(request_payload)
            else:
                raise MemoryV2CuratorError(
                    "invalid_agent",
                    "Memory Curator agent is not runnable",
                )
            proposal_count = 0
            token_usage = 0
            cost = 0.0
            if isinstance(result, Mapping):
                raw_count = result.get("proposal_count", 0)
                if isinstance(raw_count, int) and not isinstance(raw_count, bool):
                    proposal_count = max(0, min(raw_count, 1000))
                raw_tokens = result.get(
                    "consumed_tokens",
                    result.get("token_usage", 0),
                )
                if isinstance(raw_tokens, int) and not isinstance(raw_tokens, bool):
                    token_usage = max(0, min(raw_tokens, 2**63 - 1))
                raw_cost = result.get("cost", 0)
                if (
                    isinstance(raw_cost, (int, float))
                    and not isinstance(raw_cost, bool)
                    and 0 <= float(raw_cost) <= 1_000_000
                ):
                    cost = float(raw_cost)
            terminal = self._terminal_complete(current, lease_owner)
            with self._finished_lock:
                self._finished_job_ids.add(job_id)
            self._emit_audit(
                audit,
                "memory.curator.completed",
                job_id=job_id,
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                run_id=run_id,
                candidate_count=len(candidates),
                proposal_count=proposal_count,
                result_status="completed",
                duration_ms=max(0, self._clock_ms() - started_at),
                token_usage=token_usage,
                cost=cost,
            )
            return {
                "status": "Completed",
                "reason": "curation_completed",
                "job_id": job_id,
                "candidate_count": len(candidates),
                "proposal_count": proposal_count,
                "token_usage": token_usage,
                "cost": cost,
                "terminal": terminal,
                "audit": audit,
            }
        except Exception as exc:
            error_code = self._safe_error_code(exc, "curator_failed")
            terminal = None
            try:
                terminal = self._terminal_fail(current, lease_owner, error_code)
            except Exception:
                error_code = "curator_terminal_update_failed"
            with self._finished_lock:
                self._finished_job_ids.add(job_id)
            self._emit_audit(
                audit,
                "memory.curator.failed",
                job_id=job_id,
                owner_chat_id=owner,
                session_id=session,
                attempt_id=attempt,
                run_id=run_id,
                candidate_count=len(candidates),
                error_code=error_code,
                duration_ms=max(0, self._clock_ms() - started_at),
                token_usage=0,
                cost=0,
            )
            return {
                "status": "Failed",
                "reason": error_code,
                "job_id": job_id,
                "token_usage": 0,
                "cost": 0,
                "terminal": terminal,
                "audit": audit,
            }
        finally:
            with self._guard_lock:
                self._active_job_ids.discard(job_id)


def enqueue_for_completed_root_run(
    runtime: Any,
    **kwargs: Any,
) -> dict[str, Any]:
    return MemoryV2Curator(runtime).enqueue_for_completed_root_run(**kwargs)


def run_job(
    runtime: Any,
    agent_factory: Callable[..., Any],
    *,
    job: Mapping[str, Any],
    memory_agent_config: Mapping[str, Any] | None = None,
    worker_id: str = "",
    event_callback: Callable[[dict[str, Any]], Any] | None = None,
    toolkit_factory: Callable[..., Any] = build_memory_v2_toolkit,
    namespace: str = "user:local",
) -> dict[str, Any]:
    return MemoryV2Curator(
        runtime,
        agent_factory=agent_factory,
        event_callback=event_callback,
        toolkit_factory=toolkit_factory,
        namespace=namespace,
    ).run_job(
        job=job,
        memory_agent_config=memory_agent_config,
        worker_id=worker_id,
    )


__all__ = [
    "LOCKED_CORE_PROMPT",
    "MemoryV2Curator",
    "MemoryV2CuratorError",
    "enqueue_for_completed_root_run",
    "memory_agent_config_fingerprint",
    "run_job",
    "sanitize_memory_agent_config",
    "select_curator_model",
]
