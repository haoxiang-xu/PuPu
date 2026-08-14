"""Small durable sidecar index for canonical Unchain RunBundle projections.

This store does not own accounting semantics.  It only preserves already
validated ``unchain.run_bundle.v1`` values so a recipe graph can recover
completed child-step accounting after a sidecar restart without changing the
closed graph output checkpoint schema.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
from pathlib import Path
from typing import Any

from run_bundle_adapter import project_run_bundle


DATABASE_FILENAME = "run_bundles.sqlite3"


class RunBundleLedgerError(RuntimeError):
    code = "run_bundle_ledger_error"


class RunBundleLedger:
    def __init__(self, database_path: Path) -> None:
        if not isinstance(database_path, Path):
            raise TypeError("database_path must be a Path")
        self.database_path = database_path.expanduser().resolve()
        self._lock = threading.RLock()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            str(self.database_path),
            timeout=5.0,
            isolation_level=None,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS run_bundle_v1 (
                    bundle_id TEXT PRIMARY KEY,
                    revision INTEGER NOT NULL CHECK(revision > 0),
                    bundle_digest TEXT NOT NULL,
                    execution_id TEXT NOT NULL,
                    attempt_id TEXT NOT NULL,
                    root_run_id TEXT NOT NULL,
                    run_id TEXT NOT NULL,
                    lifecycle_status TEXT NOT NULL,
                    bundle_json TEXT NOT NULL,
                    UNIQUE(execution_id, attempt_id, run_id)
                );
                CREATE INDEX IF NOT EXISTS idx_run_bundle_v1_root
                  ON run_bundle_v1(execution_id, root_run_id, run_id);
                """
            )

    @staticmethod
    def _encoded(bundle: dict[str, Any]) -> str:
        return json.dumps(
            bundle,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )

    def upsert(self, raw_bundle: dict[str, Any]) -> dict[str, Any]:
        bundle = project_run_bundle(raw_bundle)
        identity = bundle["identity"]
        revision = bundle["revision"]
        digest = bundle["bundle_digest"]
        encoded = self._encoded(bundle)
        with self._lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                row = connection.execute(
                    "SELECT revision, bundle_digest FROM run_bundle_v1 "
                    "WHERE bundle_id = ?",
                    (bundle["bundle_id"],),
                ).fetchone()
                if row is not None:
                    current_revision = int(row["revision"])
                    current_digest = str(row["bundle_digest"])
                    if revision < current_revision:
                        raise RunBundleLedgerError("run_bundle_revision_stale")
                    if revision == current_revision:
                        if digest != current_digest:
                            raise RunBundleLedgerError(
                                "run_bundle_revision_conflict"
                            )
                        connection.execute("COMMIT")
                        return {"status": "already_current", "bundle": bundle}
                connection.execute(
                    """
                    INSERT INTO run_bundle_v1 (
                        bundle_id, revision, bundle_digest, execution_id,
                        attempt_id, root_run_id, run_id, lifecycle_status,
                        bundle_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(bundle_id) DO UPDATE SET
                        revision=excluded.revision,
                        bundle_digest=excluded.bundle_digest,
                        execution_id=excluded.execution_id,
                        attempt_id=excluded.attempt_id,
                        root_run_id=excluded.root_run_id,
                        run_id=excluded.run_id,
                        lifecycle_status=excluded.lifecycle_status,
                        bundle_json=excluded.bundle_json
                    """,
                    (
                        bundle["bundle_id"],
                        revision,
                        digest,
                        identity["execution_id"],
                        identity["attempt_id"],
                        identity["root_run_id"],
                        identity["run_id"],
                        bundle["lifecycle"]["status"],
                        encoded,
                    ),
                )
                connection.execute("COMMIT")
            except Exception:
                connection.execute("ROLLBACK")
                raise
        return {"status": "stored", "bundle": bundle}

    def load_run(
        self,
        *,
        execution_id: str,
        attempt_id: str,
        run_id: str,
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT bundle_json FROM run_bundle_v1 "
                "WHERE execution_id = ? AND attempt_id = ? AND run_id = ?",
                (execution_id, attempt_id, run_id),
            ).fetchone()
        if row is None:
            return None
        value = json.loads(str(row["bundle_json"]))
        return project_run_bundle(value)

    def list_root(
        self,
        *,
        execution_id: str,
        root_run_id: str,
    ) -> tuple[dict[str, Any], ...]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT bundle_json FROM run_bundle_v1 "
                "WHERE execution_id = ? AND root_run_id = ? ORDER BY run_id",
                (execution_id, root_run_id),
            ).fetchall()
        return tuple(
            project_run_bundle(json.loads(str(row["bundle_json"])))
            for row in rows
        )


def ledger_from_environment() -> RunBundleLedger | None:
    raw_data_dir = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if not raw_data_dir:
        return None
    path = Path(raw_data_dir).expanduser().resolve() / DATABASE_FILENAME
    return RunBundleLedger(path)


__all__ = [
    "DATABASE_FILENAME",
    "RunBundleLedger",
    "RunBundleLedgerError",
    "ledger_from_environment",
]
