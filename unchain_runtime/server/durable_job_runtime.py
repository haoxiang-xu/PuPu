from __future__ import annotations

import os
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


_VOLATILE_SIDE_CAR_ENVIRONMENT = frozenset(
    {
        "UNCHAIN_AUTH_TOKEN",
        "UNCHAIN_HOST",
        "UNCHAIN_PARENT_PID",
        "UNCHAIN_PORT",
    }
)


@dataclass(frozen=True)
class DurableJobsRuntime:
    """Application-scoped binding for Unchain's host-local durable jobs."""

    data_dir: Path
    store_path: Path
    module: Any
    supervisor: Any


_runtime_lock = threading.RLock()
_runtime: DurableJobsRuntime | None = None


def sanitized_job_environment(
    environment: Mapping[str, str] | None = None,
    *,
    frozen: bool | None = None,
) -> dict[str, str]:
    """Remove sidecar-only process identity before launching user commands."""

    source = os.environ if environment is None else environment
    bundle_roots = {
        str(source.get(key, "") or "").strip()
        for key in ("_PYI_APPLICATION_HOME_DIR", "_MEIPASS")
    }
    runtime_bundle_root = str(getattr(sys, "_MEIPASS", "") or "").strip()
    if runtime_bundle_root:
        bundle_roots.add(runtime_bundle_root)
    bundle_roots.discard("")
    sanitized = {
        key: value
        for key, value in source.items()
        if key.upper() not in _VOLATILE_SIDE_CAR_ENVIRONMENT
        and not key.upper().startswith("_PYI_")
        and key.upper() != "_MEIPASS"
    }
    is_frozen = bool(getattr(sys, "frozen", False)) if frozen is None else frozen
    if not is_frozen:
        return sanitized

    platform_name = str(sys.platform or "").lower()
    if platform_name.startswith("aix"):
        _restore_bootloader_library_path(sanitized, "LIBPATH")
    elif platform_name.startswith(
        ("linux", "freebsd", "openbsd", "netbsd", "dragonfly", "sunos")
    ):
        _restore_bootloader_library_path(sanitized, "LD_LIBRARY_PATH")
    elif platform_name == "darwin":
        _remove_bundle_library_entries(
            sanitized,
            "DYLD_LIBRARY_PATH",
            bundle_roots,
        )
    elif platform_name == "cygwin":
        _restore_bootloader_library_path(sanitized, "LD_LIBRARY_PATH")
    sanitized.pop("PYINSTALLER_RESET_ENVIRONMENT", None)
    return sanitized


def _restore_bootloader_library_path(
    environment: dict[str, str],
    key: str,
) -> None:
    original = environment.pop(f"{key}_ORIG", None)
    if original is None:
        environment.pop(key, None)
    else:
        environment[key] = original


def _remove_bundle_library_entries(
    environment: dict[str, str],
    key: str,
    bundle_roots: set[str],
) -> None:
    value = environment.get(key)
    if not value or not bundle_roots:
        return

    normalized_roots = tuple(
        os.path.normcase(os.path.abspath(os.path.expanduser(root)))
        for root in bundle_roots
    )

    def is_bundle_entry(entry: str) -> bool:
        normalized_entry = os.path.normcase(
            os.path.abspath(os.path.expanduser(entry))
        )
        for root in normalized_roots:
            try:
                if os.path.commonpath((normalized_entry, root)) == root:
                    return True
            except ValueError:
                continue
        return False

    retained = [
        entry
        for entry in value.split(os.pathsep)
        if entry and not is_bundle_entry(entry)
    ]
    if retained:
        environment[key] = os.pathsep.join(retained)
    else:
        environment.pop(key, None)


def restore_frozen_job_environment() -> dict[str, str]:
    """Restore canonical worker state after the bootloader mutates it."""

    canonical = sanitized_job_environment(os.environ, frozen=True)
    os.environ.clear()
    os.environ.update(canonical)
    if bool(getattr(sys, "frozen", False)) and sys.platform == "win32":
        # PyInstaller uses a process-wide DLL directory on Windows rather than
        # an environment variable. The durable worker imports bundled code
        # before this function runs, then returns child launches to the normal
        # Windows DLL search order.
        import ctypes

        if not ctypes.windll.kernel32.SetDllDirectoryW(None):
            raise RuntimeError("frozen_dll_directory_restore_failed")
    return canonical


def get_durable_jobs_runtime() -> DurableJobsRuntime | None:
    """Return the process singleton, or ``None`` for an older Unchain build.

    PuPu always configures ``UNCHAIN_DATA_DIR`` for the packaged sidecar. Direct
    adapter use without that application data root keeps the optional module
    disabled instead of inventing a second persistence location.
    """

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        return None
    jobs_types = _load_jobs_types()
    if jobs_types is None:
        return None

    data_dir = Path(raw_data_dir).expanduser().resolve()
    store_path = data_dir / "jobs"
    with _runtime_lock:
        global _runtime
        if _runtime is not None and _runtime.store_path == store_path:
            return _runtime

        JobsModule, JsonFileJobStore, ProcessJobSupervisor = jobs_types
        store = JsonFileJobStore(store_path)
        supervisor = ProcessJobSupervisor(
            store,
            environment=sanitized_job_environment(),
            **(
                {
                    "worker_command_prefix": (
                        sys.executable,
                        "--durable-job-worker",
                    ),
                    "worker_environment_overlay": {
                        "PYINSTALLER_RESET_ENVIRONMENT": "1",
                    },
                }
                if bool(getattr(sys, "frozen", False))
                else {}
            ),
        )
        replacement = DurableJobsRuntime(
            data_dir=data_dir,
            store_path=store_path,
            module=JobsModule(supervisor=supervisor),
            supervisor=supervisor,
        )
        previous = _runtime
        _runtime = replacement
        if previous is not None:
            previous.supervisor.close()
        return replacement


def _load_jobs_types() -> tuple[type, type, type] | None:
    try:
        from unchain.agent import JobsModule
        from unchain.jobs import JsonFileJobStore, ProcessJobSupervisor
    except ImportError:
        return None
    return JobsModule, JsonFileJobStore, ProcessJobSupervisor


def _reset_durable_jobs_runtime_for_tests() -> None:
    global _runtime
    with _runtime_lock:
        previous = _runtime
        _runtime = None
    if previous is not None:
        previous.supervisor.close()


__all__ = [
    "DurableJobsRuntime",
    "get_durable_jobs_runtime",
    "restore_frozen_job_environment",
    "sanitized_job_environment",
]
