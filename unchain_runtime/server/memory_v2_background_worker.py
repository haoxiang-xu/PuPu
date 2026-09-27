"""Sidecar-owned memory dispatcher. Durable curator jobs, not wakes, own work.

Only a closed, non-secret model selection is persisted in the PuPu host table.
Provider credentials/custom transport configuration are process-local and must
be supplied again after restart; built-in providers may use their own env key.
No agent, request, cancellation token, callback or RunBundle is queued here.
"""
from __future__ import annotations

import copy
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import threading
import time
import uuid
from collections import OrderedDict
from contextlib import contextmanager

_LOG = logging.getLogger(__name__)
_SCHEMA = "pupu.memory-background-host.v1"
_FIELDS = {"schema", "status", "reason", "provider", "model_id", "custom"}
_TRANSIENT_LIMIT = 128
_ENV_KEYS = {"openai": ("OPENAI_API_KEY",), "anthropic": ("ANTHROPIC_API_KEY",),
             "gemini": ("GEMINI_API_KEY", "GOOGLE_API_KEY")}


def narrow_provider_options(options):
    """Copy only provider construction inputs, never arbitrary request state."""
    allowed = {"custom_provider", "custom_provider_api_key", "customProviderApiKey",
               "temperature", "maxTokens", "api_key", "apiKey", "unchain_api_key",
               "unchainApiKey", "openai_api_key", "openaiApiKey", "anthropic_api_key",
               "anthropicApiKey", "gemini_api_key", "geminiApiKey", "_memory_v2_memory_agent_config"}
    narrowed = {key: copy.deepcopy(value) for key, value in options.items() if key in allowed}
    # Keep the scalar preference; the provider payload builder owns supported
    # levels, normalization and protocol-specific omission.
    effort = options.get("reasoningEffort")
    if isinstance(effort, str):
        narrowed["reasoningEffort"] = effort
    return narrowed


def _validate_config(raw):
    if type(raw) is not dict or set(raw) != _FIELDS or raw["schema"] != _SCHEMA:
        raise ValueError("memory_background_config_shape_invalid")
    if raw["status"] not in {"Ready", "Pending", "Failed"} or type(raw["custom"]) is not bool:
        raise ValueError("memory_background_config_invalid")
    for key, maximum in (("provider", 128), ("model_id", 256), ("reason", 128)):
        value = raw[key]
        if type(value) is not str or len(value) > maximum or (value and not re.fullmatch(r"[A-Za-z0-9._:-]+", value)):
            raise ValueError("memory_background_config_invalid")
    if raw["status"] == "Ready":
        if not raw["provider"] or not raw["model_id"] or raw["reason"]:
            raise ValueError("memory_background_config_invalid")
    elif not raw["reason"]:
        raise ValueError("memory_background_config_invalid")
    return dict(raw)


def configuration_from_factory(factory):
    from memory_v2_unchain_agent_selection import (
        PupuOfficialMemoryAgentInvokerFactory, PupuUnavailableMemoryAgentInvokerFactory,
    )
    if isinstance(factory, PupuOfficialMemoryAgentInvokerFactory):
        options = narrow_provider_options(factory._options)
        from custom_provider import parse_custom_provider
        custom = parse_custom_provider(options)
        uses_custom = bool(custom and custom.twin == factory.provider and custom.has_model(factory.model_id))
        if not uses_custom:
            options.pop("custom_provider", None)
            options.pop("custom_provider_api_key", None)
            options.pop("customProviderApiKey", None)
        config = dict(schema=_SCHEMA, status="Ready", reason="", provider=factory.provider,
                      model_id=factory.model_id, custom=uses_custom)
        return _validate_config(config), options
    if isinstance(factory, PupuUnavailableMemoryAgentInvokerFactory):
        return _validate_config(dict(schema=_SCHEMA, status=factory.selection_status.value,
                                    reason=factory.reason, provider="", model_id="", custom=False)), {}
    # Test/embedding invokers cannot be serialized or retained as request closures.
    return None


def validate_background_provider_binding(raw, *, provider=None, model_id=None):
    """Closed, host-only identity stored atomically with a legacy job."""
    fields = {"schema", "provider", "model_id", "custom", "transport_digest"}
    if type(raw) is not dict or set(raw) != fields or raw["schema"] != "pupu.memory-background-provider.v1":
        raise ValueError("memory_background_provider_binding_invalid")
    _validate_config(dict(schema=_SCHEMA, status="Ready", reason="",
                          provider=raw["provider"], model_id=raw["model_id"], custom=raw["custom"]))
    digest = raw["transport_digest"]
    if type(digest) is not str or (raw["custom"] and not re.fullmatch(r"[a-f0-9]{64}", digest)) or (
        not raw["custom"] and digest != ""
    ):
        raise ValueError("memory_background_provider_binding_invalid")
    if (provider is not None and raw["provider"] != provider) or (
        model_id is not None and raw["model_id"] != model_id
    ):
        raise ValueError("memory_background_provider_binding_invalid")
    return dict(raw)


def _background_provider_binding(config, options):
    config = _validate_config(config)
    if config["status"] != "Ready":
        raise ValueError("memory_background_provider_configuration_unavailable")
    digest = ""
    if config["custom"]:
        from custom_provider import CustomProviderError, parse_custom_provider
        try:
            custom = parse_custom_provider(options)
        except CustomProviderError as error:
            raise ValueError("memory_background_provider_configuration_unavailable") from error
        if custom is None or custom.twin != config["provider"] or not custom.has_model(config["model_id"]):
            raise ValueError("memory_background_provider_configuration_unavailable")
        # Hash parsed routing/model settings, excluding the separately supplied
        # API key. No endpoint, headers, model payload or credential is stored.
        transport = dict(provider_key=custom.provider_key, protocol=custom.protocol,
            base_url=custom.base_url, auth_mode=custom.auth_mode, auth_header_name=custom.auth_header_name,
            extra_headers=sorted(custom.extra_headers), model=custom.models[config["model_id"]])
        digest = hashlib.sha256(json.dumps(transport, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return validate_background_provider_binding(dict(schema="pupu.memory-background-provider.v1",
        provider=config["provider"], model_id=config["model_id"], custom=config["custom"], transport_digest=digest))


def background_provider_binding_from_factory(factory):
    selected = configuration_from_factory(factory)
    if selected is None or selected[0]["status"] != "Ready":
        return None
    return _background_provider_binding(*selected)


class MemoryBackgroundRegistry:
    """PuPu-owned host configuration, not a second consolidation job queue."""
    def __init__(self, database_path):
        self.database_path = Path(database_path).resolve()
        self._lock = threading.RLock()
        self._transient = OrderedDict()

    def _retry_path(self, owner, backend):
        key = hashlib.sha256(json.dumps([owner, backend]).encode()).hexdigest()
        return self.database_path.parent / "background_registration_retries" / (key + ".json")

    def defer(self, owner, backend, config, options):
        """Persist only the closed selection; never serialize provider secrets."""
        if type(owner) is not str or not re.fullmatch(r"[A-Za-z0-9._:-]{1,512}", owner):
            raise ValueError("memory_background_owner_invalid")
        if backend not in {"unchain", "pupu_legacy"}:
            raise ValueError("memory_background_backend_invalid")
        config = _validate_config(config)
        encoded = json.dumps(config, sort_keys=True, separators=(",", ":"))
        with self._lock:
            path = self._retry_path(owner, backend)
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            payload = dict(schema="pupu.memory-background-registration.v1",
                           owner_chat_id=owner, backend=backend, config=config)
            fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".registration-")
            try:
                with os.fdopen(fd, "w") as output:
                    json.dump(payload, output, sort_keys=True)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, path)
                directory = os.open(path.parent, os.O_RDONLY)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
            finally:
                Path(temporary).unlink(missing_ok=True)
            self._transient[(owner, backend)] = (encoded, narrow_provider_options(options))
            self._transient.move_to_end((owner, backend))
            while len(self._transient) > _TRANSIENT_LIMIT:
                self._transient.popitem(last=False)
        _LOG.warning("[memory-background] registration deferred; completed answer retained")

    def recover_deferred(self, stopped):
        root = self.database_path.parent / "background_registration_retries"
        if not root.exists():
            return
        # A retry remains authoritative until registration succeeds. A failed
        # or malformed retry fences that owner from using an older selection.
        for path in root.glob("*.json"):
            if stopped.is_set():
                return
            with self._lock:
                try:
                    raw = json.loads(path.read_text())
                    if (type(raw) is not dict or set(raw) != {"schema", "owner_chat_id", "backend", "config"}
                            or raw["schema"] != "pupu.memory-background-registration.v1"
                            or path != self._retry_path(raw["owner_chat_id"], raw["backend"])):
                        raise ValueError("memory_background_registration_invalid")
                    config = _validate_config(raw["config"])
                    if raw["backend"] == "unchain":
                        from unchain.persistence.sqlite_chat_deletion_v2 import is_chat_deleted
                        if is_chat_deleted(database_path=self.database_path, owner_chat_id=raw["owner_chat_id"]):
                            path.unlink(missing_ok=True)
                            self._transient.pop((raw["owner_chat_id"], raw["backend"]), None)
                            continue
                    row = dict(owner_chat_id=raw["owner_chat_id"], backend=raw["backend"],
                        config_json=json.dumps(config, sort_keys=True, separators=(",", ":")))
                    self.register(raw["owner_chat_id"], raw["backend"], config, self.options(row))
                except (OSError, sqlite3.Error, ValueError, TypeError):
                    _LOG.warning("[memory-background] registration retry unavailable")

    @contextmanager
    def _connect(self, *, initialize=False):
        connection = sqlite3.connect(f"{self.database_path.as_uri()}?mode=rw", uri=True, timeout=1)
        connection.row_factory = sqlite3.Row
        try:
            if initialize:
                connection.execute("""CREATE TABLE IF NOT EXISTS pupu_memory_background_hosts (
                    owner_chat_id TEXT NOT NULL, backend TEXT NOT NULL,
                    config_json TEXT NOT NULL, last_status TEXT NOT NULL DEFAULT 'pending',
                    PRIMARY KEY(owner_chat_id, backend))""")
            with connection:
                yield connection
        finally:
            connection.close()

    def register(self, owner, backend, config, options, *, only_missing=False):
        if type(owner) is not str or not re.fullmatch(r"[A-Za-z0-9._:-]{1,512}", owner):
            raise ValueError("memory_background_owner_invalid")
        if backend not in {"unchain", "pupu_legacy"}:
            raise ValueError("memory_background_backend_invalid")
        config = _validate_config(config)
        encoded = json.dumps(config, sort_keys=True, separators=(",", ":"))
        key = (owner, backend)
        narrowed = narrow_provider_options(options)
        with self._lock:
            cached = self._transient.get(key)
            retry_path = self._retry_path(owner, backend)
            if only_missing and retry_path.exists():
                return
            if only_missing or cached is None or cached[0] != encoded or retry_path.exists():
                with self._connect(initialize=True) as connection:
                    if only_missing:
                        created = connection.execute("INSERT OR IGNORE INTO pupu_memory_background_hosts (owner_chat_id, backend, config_json) VALUES (?, ?, ?)", (owner, backend, encoded))
                        if created.rowcount == 0:
                            return
                    connection.execute("""INSERT INTO pupu_memory_background_hosts
                        (owner_chat_id, backend, config_json) VALUES (?, ?, ?)
                        ON CONFLICT(owner_chat_id, backend) DO UPDATE SET
                        config_json=excluded.config_json, last_status='pending'
                        WHERE config_json != excluded.config_json""", (owner, backend, encoded))
            retry_path.unlink(missing_ok=True)
            self._transient[key] = (encoded, narrowed)
            self._transient.move_to_end(key)
            while len(self._transient) > _TRANSIENT_LIMIT:
                self._transient.popitem(last=False)

    def recover_registrations(self, stopped):
        """Discover pre-upgrade queues through PuPu-owned owner metadata only."""
        from memory_v2_store_boundary import configured_context_v2_store_owner, admit_context_v2_store_owner
        backend = configured_context_v2_store_owner()
        if backend not in {"unchain", "pupu_legacy"} or not self.database_path.exists():
            return
        admit_context_v2_store_owner(root_dir=self.database_path.parent, requested_owner=backend)
        table = "pupu_unchain_ownership_bindings" if backend == "unchain" else "consolidation_jobs"
        predicate = "" if backend == "unchain" else " AND deleted_at_ms IS NULL AND status IN ('pending', 'leased')"
        after = ""
        while not stopped.is_set():
            connection = sqlite3.connect(f"{self.database_path.as_uri()}?mode=ro", uri=True, timeout=1)
            try:
                if not connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                    return
                owners = connection.execute(f"SELECT DISTINCT owner_chat_id FROM {table} WHERE owner_chat_id > ?{predicate} ORDER BY owner_chat_id LIMIT 32", (after,)).fetchall()
            finally:
                connection.close()
            if not owners:
                return
            for (owner,) in owners:
                if stopped.is_set():
                    return
                if backend == "unchain":
                    from unchain.persistence.sqlite_chat_deletion_v2 import is_chat_deleted
                    if is_chat_deleted(database_path=self.database_path, owner_chat_id=owner):
                        continue
                self.register(owner, backend, dict(schema=_SCHEMA, status="Pending",
                    reason="memory_background_configuration_unavailable", provider="", model_id="", custom=False),
                    {}, only_missing=True)
            after = owners[-1][0]

    def page(self, after=("", ""), limit=32):
        if not self.database_path.exists():
            return ()
        # Do not initialize tables during startup/recovery of an unadmitted DB.
        connection = sqlite3.connect(f"{self.database_path.as_uri()}?mode=ro", uri=True, timeout=1)
        connection.row_factory = sqlite3.Row
        try:
            if not connection.execute("SELECT 1 FROM sqlite_master WHERE name='pupu_memory_background_hosts' AND type='table'").fetchone():
                return ()
            rows = connection.execute("""SELECT owner_chat_id, backend, config_json, last_status
                FROM pupu_memory_background_hosts WHERE (owner_chat_id, backend) > (?, ?)
                ORDER BY owner_chat_id, backend LIMIT ?""", (*after, limit)).fetchall()
        finally:
            connection.close()
        return tuple(dict(row) for row in rows)

    def options(self, row):
        key = (row["owner_chat_id"], row["backend"])
        with self._lock:
            value = self._transient.get(key)
            if value and value[0] == row["config_json"]:
                return copy.deepcopy(value[1])
        return {}

    def selection_for_claimed_job(self, owner):
        """Choose one invocation's config/options after its job is claimed.

        Registration, retry fencing and transient options share this lock. The
        caller must release it before constructing or invoking a provider.
        """
        with self._lock:
            if self._retry_path(owner, "unchain").exists():
                return None
            with self._connect() as connection:
                current = connection.execute(
                    "SELECT owner_chat_id, backend, config_json FROM pupu_memory_background_hosts "
                    "WHERE owner_chat_id=? AND backend='unchain'", (owner,)).fetchone()
            if current is None:
                return None
            row = dict(current)
            return _validate_config(json.loads(row["config_json"])), self.options(row)

    def status(self, row, status):
        if status not in {"idle", "processed", "retry", "unavailable", "deleted", "failed"}:
            raise ValueError("memory_background_status_invalid")
        if row.get("last_status") == status:
            return
        with self._connect() as connection:
            connection.execute("""UPDATE pupu_memory_background_hosts SET last_status=?
                WHERE owner_chat_id=? AND backend=? AND last_status != ?""",
                (status, row["owner_chat_id"], row["backend"], status))


def resolve_invoker_factory(config, options):
    from memory_v2_unchain_agent_selection import (
        PupuMemoryAgentSelectionStatus, PupuOfficialMemoryAgentInvokerFactory,
        PupuUnavailableMemoryAgentInvokerFactory,
    )
    config = _validate_config(config)
    def unavailable(reason):
        return PupuUnavailableMemoryAgentInvokerFactory(
            status=PupuMemoryAgentSelectionStatus.PENDING, reason=reason)
    if config["status"] != "Ready":
        return PupuUnavailableMemoryAgentInvokerFactory(
            status=PupuMemoryAgentSelectionStatus(config["status"]), reason=config["reason"])
    options = narrow_provider_options(options)
    if config["custom"]:
        # Never replace a lost custom transport with its built-in protocol twin.
        if not options.get("custom_provider"):
            return unavailable("memory_background_provider_configuration_unavailable")
        from custom_provider import parse_custom_provider, extract_custom_provider_api_key
        custom = parse_custom_provider(options)
        if custom.twin != config["provider"] or not custom.has_model(config["model_id"]):
            return unavailable("memory_background_provider_configuration_changed")
        if custom.requires_key() and not extract_custom_provider_api_key(options):
            return unavailable("memory_background_credentials_unavailable")
    else:
        from unchain_adapter import _extract_api_key_from_options
        key = _extract_api_key_from_options(options, config["provider"])
        if not key:
            key = next((os.environ[name].strip() for name in _ENV_KEYS.get(config["provider"], ())
                        if os.environ.get(name, "").strip()), "")
        if config["provider"] in _ENV_KEYS and not key:
            return unavailable("memory_background_credentials_unavailable")
        if key:
            options["api_key"] = key
    return PupuOfficialMemoryAgentInvokerFactory(
        options=options, provider=config["provider"], model_id=config["model_id"])


class MemoryBackgroundDispatcher:
    """One daemon worker, coalesced wake bit, paged fair recovery scan."""
    def __init__(self, registry, *, process=None, poll_seconds=30):
        self.registry = registry
        self._process = process or process_owner
        self._poll_seconds = poll_seconds
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread = None

    def start(self):
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop.clear()
            self._wake.set()  # Recover persisted jobs even with no new request.
            self._thread = threading.Thread(target=self._run, name="memory-background", daemon=True)
            self._thread.start()

    def notify(self):
        self._wake.set()

    def stop(self):
        self._stop.set()
        self._wake.set()
        # Provider I/O is not joined on the foreground shutdown path. The same
        # stop token is also checked at every background toolkit invocation.
        thread = self._thread
        if thread and thread is not threading.current_thread():
            thread.join(timeout=0.1)

    def _run(self):
        recovered = False
        while not self._stop.is_set():
            self._wake.wait(self._poll_seconds)
            self._wake.clear()
            try:
                self.registry.recover_deferred(self._stop)
            except (OSError, sqlite3.Error):
                _LOG.warning("[memory-background] registration scan unavailable")
            if not recovered and not self._stop.is_set():
                try:
                    self.registry.recover_registrations(self._stop)
                    recovered = True
                except Exception:
                    # A transient busy database must not require another
                    # sidecar restart to discover pre-upgrade jobs.
                    _LOG.warning("[memory-background] owner recovery unavailable")
            after = ("", "")
            try:
                while not self._stop.is_set():
                    rows = self.registry.page(after)
                    if not rows:
                        break
                    for row in rows:
                        if self._stop.is_set():
                            break
                        try:
                            status = self._process(self.registry, row, self._stop)
                            self.registry.status(row, status)
                            if status == "processed":
                                self._wake.set()  # Drain backlog, one job/owner/pass.
                        except Exception:
                            self.registry.status(row, "unavailable")
                            _LOG.warning("[memory-background] owner processing unavailable")
                    last = rows[-1]
                    after = (last["owner_chat_id"], last["backend"])
            except Exception:
                _LOG.warning("[memory-background] recovery scan unavailable")


class _ClaimedJobMemoryInvoker:
    """Bind a fresh selection to the job supplied by the official host."""
    def __init__(self, registry, owner, codec):
        self.registry, self.owner, self.codec = registry, owner, codec

    def run(self, request, *, toolkit, binding):
        from unchain.memory.curator import CuratorRunnerFailure, FailureRetryability
        try:
            selected = self.registry.selection_for_claimed_job(self.owner)
        except (OSError, sqlite3.Error, ValueError, TypeError):
            selected = None
        if selected is None:
            raise CuratorRunnerFailure("memory_background_registration_pending",
                retryability=FailureRetryability.RETRYABLE, retry_delay_ms=1000)
        # Snapshot acquisition is the invocation's selection point. No registry
        # lock or mutable page row survives into provider construction or I/O.
        invoker = resolve_invoker_factory(*selected)(self.codec)
        return invoker.run(request, toolkit=toolkit, binding=binding)


def process_owner(registry, row, stopped):
    from memory_v2_store_boundary import configured_context_v2_store_owner
    if configured_context_v2_store_owner() != row["backend"]:
        return "unavailable"
    if registry._retry_path(row["owner_chat_id"], row["backend"]).exists():
        return "unavailable"
    config = _validate_config(json.loads(row["config_json"]))
    if row["backend"] == "pupu_legacy":
        return _process_legacy(registry, row, stopped, config)
    from memory_v2_unchain_curator_query import open_pupu_unchain_curator_query_api
    from unchain.persistence.sqlite_chat_deletion_v2 import is_chat_deleted
    if is_chat_deleted(database_path=registry.database_path, owner_chat_id=row["owner_chat_id"]):
        return "deleted"
    api = open_pupu_unchain_curator_query_api(
        root_dir=registry.database_path.parent, owner_chat_id=row["owner_chat_id"])
    now = int(time.time() * 1000)
    ready = False
    for state in ("pending", "leased"):
        jobs = api.list_consolidation_jobs(owner_chat_id=row["owner_chat_id"], status=state, limit=500)["jobs"]
        # A full page is not evidence of an empty eligible queue. Let the
        # official indexed claim select across the entire binding in that case.
        ready |= len(jobs) == 500 or any(
            int(job.get("next_attempt_at_ms", 0) if state == "pending" else job.get("lease_expires_at_ms", 0) or 0) <= now
            for job in jobs)
    if not ready or stopped.is_set():
        return "idle"
    from memory_v2_background_host import build_background_memory_host
    host = build_background_memory_host(
        database_path=registry.database_path, owner_chat_id=row["owner_chat_id"],
        invoker_factory=lambda codec: _ClaimedJobMemoryInvoker(
            registry, row["owner_chat_id"], codec), stopped=stopped)
    started = time.monotonic()
    receipt = host.process_next(operation_id="memory-background:" + uuid.uuid4().hex)
    from unchain.memory.curator import ProcessDisposition
    from unchain.memory.curator.host import MemoryAgentWorkerDisposition
    status = "idle"
    if receipt.disposition is MemoryAgentWorkerDisposition.PROCESSED:
        status = "retry" if receipt.result.disposition is ProcessDisposition.RETRY_SCHEDULED else "processed"
        job = receipt.claimed_job
        _LOG.info("[memory-background] job=%s result=%s elapsed_ms=%d",
                  hashlib.sha256(job.job_id.encode()).hexdigest()[:16], receipt.result.disposition.value,
                  int((time.monotonic() - started) * 1000))
    return status


def _process_legacy(registry, row, stopped, config):
    from memory_v2_runtime import get_memory_v2_runtime
    from memory_v2_curator import MemoryV2Curator
    from unchain_adapter import _memory_v2_curator_agent_factory
    runtime = get_memory_v2_runtime(required=True)
    if runtime.root_dir.resolve() != registry.database_path.parent or stopped.is_set():
        return "unavailable"
    now = int(time.time() * 1000)
    ready = False
    for state in ("pending", "leased"):
        jobs = runtime.store.list_consolidation_jobs(owner_chat_id=row["owner_chat_id"], status=state, limit=500)["jobs"]
        # Newest-first pages can hide older eligible work. A full page must
        # defer to the store's authoritative claim across the entire queue.
        ready |= len(jobs) == 500 or any(int(job.get("next_attempt_at_ms", 0)) <= now and
            (state == "pending" or int(job.get("lease_expires_at_ms") or 0) <= now) for job in jobs)
    if not ready:
        return "idle"
    worker_id = "memory-background-" + uuid.uuid4().hex
    claim = runtime.store.claim_consolidation_job(
        owner_chat_id=row["owner_chat_id"], worker_id=worker_id,
        operation_id="memory-background-claim:" + uuid.uuid4().hex, lease_ms=600000)
    job = claim.get("job") if claim else None
    if not job:
        return "idle"
    options = registry.options(row)
    from memory_v2_curator import memory_agent_config_fingerprint
    from memory_v2_unchain_agent_selection import PupuUnavailableMemoryAgentInvokerFactory
    model = job["payload"]["model"]
    queued_binding = job["payload"].get("background_provider_binding")
    resolved = None
    reason = ""
    if queued_binding is None:
        reason = "memory_background_provider_identity_unavailable"
    else:
        try:
            queued_binding = validate_background_provider_binding(
                queued_binding, provider=model["provider"], model_id=model["model_id"])
        except (TypeError, ValueError):
            reason = "memory_background_provider_binding_invalid"
    if not reason and config["status"] != "Ready":
        reason = config["reason"]
    if not reason:
        try:
            current_binding = _background_provider_binding(config, options)
        except (TypeError, ValueError):
            reason = "memory_background_provider_configuration_unavailable"
        else:
            if current_binding != queued_binding:
                reason = "memory_background_provider_configuration_changed"
    if not reason:
        resolved = resolve_invoker_factory(config, options)
        if isinstance(resolved, PupuUnavailableMemoryAgentInvokerFactory):
            reason = resolved.reason
    if not reason and memory_agent_config_fingerprint(options.get("_memory_v2_memory_agent_config")) != job["payload"]["config_fingerprint"]:
        reason = "memory_background_configuration_unavailable"
    if reason or stopped.is_set():
        runtime.fail_consolidation_job(
            owner_chat_id=row["owner_chat_id"], job_id=job["job_id"], worker_id=worker_id,
            lease_token=job["lease_token"], expected_revision=int(job["revision"]),
            operation_id="memory-background-retry:" + uuid.uuid4().hex,
            error_code=reason or "memory_background_stopping", retry_at_ms=now + 60000)
        return "retry"
    options = dict(resolved._options)
    guarded_runtime = _LegacyBackgroundRuntime(runtime, job, stopped)
    result = MemoryV2Curator(guarded_runtime, agent_factory=_memory_v2_curator_agent_factory(options),
                            namespace="user:local").run_job(job=job, worker_id=worker_id,
                                memory_agent_config=options.get("_memory_v2_memory_agent_config"))
    return "retry" if result.get("status") == "Pending" else "processed"


class _LegacyBackgroundRuntime:
    """Host-only fence injection. Lease credentials never enter tool schemas."""
    def __init__(self, runtime, job, stopped):
        self._runtime, self._job, self._stopped = runtime, job, stopped
        self._fence = {key: job[key] for key in ("revision", "lease_owner", "lease_token")}

    def __getattr__(self, name):
        return getattr(self._runtime, name)

    def _mutate(self, name, kwargs):
        from memory_v2_store import MemoryV2Error
        if self._stopped.is_set():
            raise MemoryV2Error("memory_background_stopping", "Background worker is stopping", status_code=409)
        if kwargs.get("job_id") != self._job["job_id"] or kwargs.get("owner_chat_id") != self._job["owner_chat_id"]:
            raise MemoryV2Error("context_v2_background_fence_lost", "Background job scope changed", status_code=409)
        return getattr(self._runtime.store, name)(**kwargs, background_fence=self._fence)

    def fail_consolidation_job(self, **kwargs):
        # Legacy curator terminal IDs were stable per job. A background retry
        # needs a fresh claim-scoped receipt, while replay of this claim stays
        # idempotent. Shutdown is retryable even if the provider returned late.
        values = dict(kwargs)
        token_hash = hashlib.sha256(self._fence["lease_token"].encode()).hexdigest()
        values["operation_id"] = "memory-background-fail:" + token_hash
        if self._stopped.is_set():
            values["error_code"] = "memory_background_stopping"
            values["retry_at_ms"] = int(time.time() * 1000) + 60000
        return self._runtime.fail_consolidation_job(**values)

    def apply_job_candidate_new(self, **kwargs):
        return self._mutate("apply_job_candidate_new", kwargs)

    def propose_job_candidate_review(self, **kwargs):
        return self._mutate("propose_job_candidate_review", kwargs)


_SINGLETON_LOCK = threading.Lock()
_DISPATCHER = None


def get_memory_background_dispatcher(database_path=None):
    global _DISPATCHER
    if database_path is None:
        data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
        if not data_dir:
            return None
        database_path = Path(data_dir) / "memory_v2" / "context_v2.sqlite3"
    path = Path(database_path).resolve()
    with _SINGLETON_LOCK:
        if _DISPATCHER is None:
            _DISPATCHER = MemoryBackgroundDispatcher(MemoryBackgroundRegistry(path))
        elif _DISPATCHER.registry.database_path != path:
            if _DISPATCHER._thread is not None and _DISPATCHER._thread.is_alive():
                raise ValueError("memory_background_database_changed")
            # A stopped/never-started lifecycle may bind a different data root;
            # never carry its transient credentials into the new root.
            _DISPATCHER = MemoryBackgroundDispatcher(MemoryBackgroundRegistry(path))
        return _DISPATCHER


def register_background_host(*, database_path, owner_chat_id, invoker_factory, backend="unchain"):
    selected = configuration_from_factory(invoker_factory)
    if selected is None:
        return
    dispatcher = get_memory_background_dispatcher(database_path)
    with dispatcher.registry._lock:
        try:
            dispatcher.registry.register(owner_chat_id, backend, *selected)
        except (OSError, sqlite3.Error):
            dispatcher.registry.defer(owner_chat_id, backend, *selected)
            dispatcher.notify()


def defer_background_host(*, database_path, owner_chat_id, invoker_factory, backend="unchain"):
    selected = configuration_from_factory(invoker_factory)
    if selected is None:
        return
    dispatcher = get_memory_background_dispatcher(database_path)
    dispatcher.registry.defer(owner_chat_id, backend, *selected)
    dispatcher.notify()


def notify_memory_background():
    # Lifecycle owns construction/start; a wake never constructs a new host.
    with _SINGLETON_LOCK:
        dispatcher = _DISPATCHER
    if dispatcher is not None:
        dispatcher.notify()
