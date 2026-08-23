"""Production durable provider-turn and RunBundle ownership for PuPu.

This boundary is deliberately independent of Memory V2 admission and Context
V2 projection mode.  Every ordinary run can therefore use the same atomic
provider result/receipt store whether memory is off, shadowed, or active.
Active Context V2 runs reuse their Context-owned factory instead of this one.
"""

from __future__ import annotations

import os
import threading
import weakref
from dataclasses import replace
from pathlib import Path

from unchain.context.provider_execution import (
    official_provider_transport_target_sha256,
)
from unchain.journal import AttemptRef, GenerationRef
from unchain.persistence.sqlite_v2 import SQLiteContextV2Store
from unchain.providers.durable_turn_runtime import DurableProviderTurnMode
from unchain.providers.turn_ownership import (
    ProviderTurnExecutionService,
    ProviderTurnOwnership,
)
from unchain.run_bundle import RunIdentity


STORE_DIRECTORY = "production_runs_v1"
DATABASE_FILENAME = "run_ledger.sqlite3"
OBJECT_DIRECTORY = "objects"
GENERATION_ID = "production-run-ledger-v1"


class ProductionRunOwnershipError(RuntimeError):
    """PuPu could not bind its independent production run owner."""


class PupuProductionProviderTurnOwnershipFactory:
    """Bind one stable atomic provider/result/accounting owner per run."""

    def __init__(self, *, root_directory: Path) -> None:
        if not isinstance(root_directory, Path):
            raise TypeError("root_directory must be a Path")
        self.root_directory = root_directory.expanduser().resolve()
        self._store = SQLiteContextV2Store(
            database_path=self.root_directory / DATABASE_FILENAME,
            object_directory=self.root_directory / OBJECT_DIRECTORY,
        )
        self._lock = threading.RLock()
        self._owners: weakref.WeakValueDictionary[
            RunIdentity,
            ProviderTurnOwnership,
        ] = weakref.WeakValueDictionary()

    def bind(self, *, identity: RunIdentity) -> ProviderTurnOwnership:
        if type(identity) is not RunIdentity:
            raise TypeError("identity must be an exact RunIdentity")
        with self._lock:
            existing = self._owners.get(identity)
            if existing is not None:
                return existing
            ledger = self._store.bind_execution(identity.execution_id)
            service = ProviderTurnExecutionService(
                attempt=AttemptRef(
                    generation=GenerationRef(
                        identity.execution_id,
                        GENERATION_ID,
                    ),
                    attempt_id=identity.attempt_id,
                ),
                store=ledger,
                mode=DurableProviderTurnMode.ENFORCE,
                transport_target_sha256=(
                    official_provider_transport_target_sha256()
                ),
            )
            owner = ProviderTurnOwnership(
                identity=identity,
                service=service,
                ledger=ledger,
                factory=self,
            )
            self._owners[identity] = owner
            return owner


class PupuEnvironmentProviderTurnOwnershipFactory:
    """Resolve PuPu's data root lazily at the pre-send ownership barrier."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._owners: weakref.WeakValueDictionary[
            tuple[Path, RunIdentity],
            ProviderTurnOwnership,
        ] = weakref.WeakValueDictionary()

    def bind(self, *, identity: RunIdentity) -> ProviderTurnOwnership:
        if type(identity) is not RunIdentity:
            raise TypeError("identity must be an exact RunIdentity")
        factory = production_ownership_factory_from_environment()
        key = (factory.root_directory, identity)
        with self._lock:
            existing = self._owners.get(key)
            if existing is not None:
                return existing
            owner = replace(
                factory.bind(identity=identity),
                factory=self,
            )
            self._owners[key] = owner
            return owner


_factory_lock = threading.RLock()
_factories: dict[Path, PupuProductionProviderTurnOwnershipFactory] = {}
_environment_factory = PupuEnvironmentProviderTurnOwnershipFactory()


def production_ownership_factory_from_environment(
) -> PupuProductionProviderTurnOwnershipFactory:
    """Return the process-local factory rooted at PuPu's durable data dir."""

    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        raise ProductionRunOwnershipError(
            "UNCHAIN_DATA_DIR is not configured for production run ownership"
        )
    root_directory = (
        Path(raw_data_dir).expanduser().resolve() / STORE_DIRECTORY
    )
    with _factory_lock:
        factory = _factories.get(root_directory)
        if factory is None:
            factory = PupuProductionProviderTurnOwnershipFactory(
                root_directory=root_directory,
            )
            _factories[root_directory] = factory
        return factory


def production_ownership_factory_for_agent(
) -> PupuEnvironmentProviderTurnOwnershipFactory:
    """Return a lazy fail-closed factory safe to pass through fake-free setup."""

    return _environment_factory


def _reset_production_ownership_factories_for_tests() -> None:
    with _factory_lock:
        _factories.clear()


__all__ = [
    "DATABASE_FILENAME",
    "GENERATION_ID",
    "OBJECT_DIRECTORY",
    "PupuEnvironmentProviderTurnOwnershipFactory",
    "PupuProductionProviderTurnOwnershipFactory",
    "ProductionRunOwnershipError",
    "STORE_DIRECTORY",
    "production_ownership_factory_for_agent",
    "production_ownership_factory_from_environment",
]
