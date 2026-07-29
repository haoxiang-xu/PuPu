import os
import signal
import sys
import threading
import time


_DURABLE_JOB_WORKER_FLAG = "--durable-job-worker"


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


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    worker_exit_code = _dispatch_durable_job_worker(args)
    if worker_exit_code is not None:
        return worker_exit_code

    from app import create_app
    from server_thread import ThreadedFlaskServer

    host = os.environ.get("UNCHAIN_HOST", "127.0.0.1")
    port = _read_port()
    expected_parent_pid = _read_parent_pid()

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
        server.start()
        print(f"[unchain] listening on http://{host}:{port}", flush=True)
        while not shutdown_event.is_set():
            time.sleep(0.2)
    except KeyboardInterrupt:
        shutdown_event.set()
    finally:
        server.stop()
        print("[unchain] server stopped", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
