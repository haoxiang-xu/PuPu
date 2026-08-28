import os
import signal
import sys
import threading
import time


_DURABLE_JOB_WORKER_FLAG = "--durable-job-worker"
_VAULT_SINK_WORKER_FLAG = "--vault-sink-worker"
_SESSION_GUARD_DIAGNOSTICS_ENV = "PUPU_SESSION_GUARD_DIAGNOSTICS"
_SESSION_GUARD_DIAGNOSTIC_PREFIX = (
    "[session-guard] migration unavailable code="
)
_SESSION_GUARD_STARTUP_DIAGNOSTIC_CODES = frozenset(
    {
        "session_guard_import_unavailable",
        "session_guard_process_identity_unavailable",
        "session_guard_unknown_unavailable",
    }
)
_SESSION_GUARD_STARTUP_DIAGNOSTICS_EMITTED: set[str] = set()


def _emit_session_guard_startup_diagnostic(
    error: Exception,
    *,
    phase: str,
) -> None:
    if os.environ.get(_SESSION_GUARD_DIAGNOSTICS_ENV, "").strip() != "1":
        return
    if getattr(error, "code", "") == "session_guard_process_identity_unavailable":
        code = "session_guard_process_identity_unavailable"
    elif phase == "import":
        code = "session_guard_import_unavailable"
    else:
        code = "session_guard_unknown_unavailable"
    if (
        code not in _SESSION_GUARD_STARTUP_DIAGNOSTIC_CODES
        or code in _SESSION_GUARD_STARTUP_DIAGNOSTICS_EMITTED
    ):
        return
    _SESSION_GUARD_STARTUP_DIAGNOSTICS_EMITTED.add(code)
    try:
        print(
            f"{_SESSION_GUARD_DIAGNOSTIC_PREFIX}{code}",
            file=sys.stderr,
            flush=True,
        )
    except Exception:
        # QA diagnostics must never interfere with sidecar startup.
        pass


def _dispatch_vault_sink_worker(argv: list[str]) -> int | None:
    if not argv or argv[0] != _VAULT_SINK_WORKER_FLAG:
        return None
    if len(argv) != 1:
        return 2

    # Import every bundled worker dependency before restoring PyInstaller's
    # process environment. The worker then owns stdin/stdout exclusively and
    # exits after exactly one framed request; Flask is never imported here.
    from vault_sink_worker import main as worker_main
    from durable_job_runtime import restore_frozen_job_environment

    restore_frozen_job_environment()
    return int(worker_main())


def _dispatch_durable_job_worker(argv: list[str]) -> int | None:
    if not argv or argv[0] != _DURABLE_JOB_WORKER_FLAG:
        return None

    from unchain.jobs._worker import main as worker_main
    from durable_job_runtime import restore_frozen_job_environment

    # Load every bundled worker dependency before reverting PyInstaller's
    # library search state for the system command that the worker will launch.
    restore_frozen_job_environment()

    return int(worker_main(argv[1:]))


def _read_port() -> int:
    raw_port = os.environ.get("UNCHAIN_PORT", "5879")
    try:
        port = int(raw_port)
        if port < 1 or port > 65535:
            raise ValueError("port out of range")
        return port
    except Exception as port_error:
        raise ValueError(f"Invalid UNCHAIN_PORT value: {raw_port}") from port_error


def _read_parent_pid() -> int:
    raw_parent_pid = os.environ.get("UNCHAIN_PARENT_PID", "").strip()
    if not raw_parent_pid:
        return 0
    try:
        parent_pid = int(raw_parent_pid)
        return parent_pid if parent_pid > 0 else 0
    except Exception:
        return 0


def _log_outbound_tls_trust() -> None:
    """Print which TLS trust source actually resolved, once, at startup.

    Resolving eagerly here (rather than lazily on the first outbound request)
    means a broken trust chain shows up in the boot log instead of surfacing
    much later as a confusing "MCP install failed" report. Paths are reduced to
    basenames by net_tls so the line carries no home directory or account name.
    """
    try:
        from net_tls import describe_trust_source_for_log, outbound_tls_warning

        print(f"[unchain] outbound TLS trust: {describe_trust_source_for_log()}", flush=True)
        warning = outbound_tls_warning()
        if warning:
            print(f"[unchain] WARNING outbound TLS trust: {warning}", flush=True)
    except Exception as exc:
        # Never let a diagnostic keep the sidecar from booting.
        print(f"[unchain] outbound TLS trust: unavailable ({exc})", flush=True)


def _initialize_vault_sink_transport() -> None:
    """Consume Electron's one-use HMAC key pipe before any tool can spawn.

    Vault availability is optional for sidecar startup, but malformed or
    incomplete broker transport is latched unavailable and scrubbed by the
    client initializer.  The raw failure is never logged because it could be
    attacker-controlled transport data.
    """

    try:
        from vault_sink_client import initialize_process_vault_sink_client

        initialize_process_vault_sink_client(required=False)
    except Exception:
        print("[unchain] vault sink transport: unavailable", flush=True)


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    worker_exit_code = _dispatch_vault_sink_worker(args)
    if worker_exit_code is not None:
        return worker_exit_code
    worker_exit_code = _dispatch_durable_job_worker(args)
    if worker_exit_code is not None:
        return worker_exit_code

    from app import create_app
    from server_thread import ThreadedFlaskServer

    host = os.environ.get("UNCHAIN_HOST", "127.0.0.1")
    port = _read_port()
    expected_parent_pid = _read_parent_pid()

    try:
        from session_execution_guard import session_guard_migration_receipt
    except Exception as exc:
        _emit_session_guard_startup_diagnostic(exc, phase="import")
    else:
        try:
            session_guard_migration_receipt()
        except Exception as exc:
            _emit_session_guard_startup_diagnostic(exc, phase="call")
    # The health receipt remains the content-free authority. Startup stays
    # available so the launcher can observe and safely retry migration.

    _initialize_vault_sink_transport()
    _log_outbound_tls_trust()

    try:
        from subagent_seeds import ensure_seeds_written
        from pathlib import Path
        ensure_seeds_written(Path.home() / ".pupu" / "subagents")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "[subagent_seeds] seed-write failed: %s", exc
        )

    try:
        from recipe_seeds import ensure_recipe_seeds_written
        from pathlib import Path
        ensure_recipe_seeds_written(Path.home() / ".pupu" / "agent_recipes")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            "[recipe_seeds] seed-write failed: %s", exc
        )

    app = create_app()
    server = ThreadedFlaskServer(app, host=host, port=port)
    from memory_v2_deletion_runner import MemoryV2DeletionRunner
    from memory_v2_runtime import get_memory_v2_runtime

    deletion_runner = MemoryV2DeletionRunner(
        lambda: get_memory_v2_runtime(required=False),
        worker_id=f"sidecar-deletion-{os.getpid()}",
    )

    shutdown_event = threading.Event()

    def request_shutdown(signum, _frame) -> None:
        print(f"[unchain] received signal {signum}, shutting down", flush=True)
        shutdown_event.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    if expected_parent_pid:
        def watch_parent() -> None:
            while not shutdown_event.is_set():
                try:
                    # If parent disappeared (or PID got re-parented to init),
                    # stop this server so it does not keep stale runtime locks.
                    if os.getppid() == 1:
                        shutdown_event.set()
                        break
                    os.kill(expected_parent_pid, 0)
                except ProcessLookupError:
                    shutdown_event.set()
                    break
                except PermissionError:
                    pass
                except Exception:
                    pass

                time.sleep(1.0)

        threading.Thread(
            target=watch_parent,
            name="unchain-parent-watchdog",
            daemon=True,
        ).start()

    try:
        memory_v2_runtime = get_memory_v2_runtime(required=False)
        if memory_v2_runtime is not None:
            memory_v2_runtime.recover_startup()
    except Exception:
        # Recovery is fail-closed for deletion and fail-open for availability:
        # a degraded cleanup pass must never prevent the sidecar from starting.
        import logging

        logging.getLogger(__name__).warning(
            "[context_v2] startup recovery degraded"
        )

    try:
        deletion_runner.start()
        server.start()
        print(f"[unchain] listening on http://{host}:{port}", flush=True)
        while not shutdown_event.is_set():
            time.sleep(0.2)
    except KeyboardInterrupt:
        shutdown_event.set()
    finally:
        deletion_runner.stop()
        server.stop()
        print("[unchain] server stopped", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
