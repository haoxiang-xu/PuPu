"""Fail-closed ownership boundary for the Context V2 SQLite data plane.

PuPu's prototype ``MemoryV2Store`` and Unchain's ``SQLiteContextV2Store`` use
different schemas but historically resolved the same database filename.  The
product host must select exactly one of them before constructing either store.
This module owns that small admission seam; it does not migrate, delete, or
rewrite either schema.
"""

from __future__ import annotations

import json
import os
import sqlite3
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, TypeVar


CONTEXT_V2_DATABASE_FILENAME = "context_v2.sqlite3"
CONTEXT_V2_OWNER_FILENAME = "context_v2.owner.json"
CONTEXT_V2_STORE_OWNER_ENV = "PUPU_CONTEXT_V2_STORE_OWNER"

STORE_OWNER_OFF = "off"
STORE_OWNER_PUPU_LEGACY = "pupu_legacy"
STORE_OWNER_UNCHAIN = "unchain"

_OWNER_SCHEMA = "pupu.context-v2-store-owner.v1"
_ACTIVE_OWNERS = frozenset({STORE_OWNER_PUPU_LEGACY, STORE_OWNER_UNCHAIN})
_CONFIGURED_OWNERS = frozenset({STORE_OWNER_OFF, *_ACTIVE_OWNERS})
_LEGACY_SCHEMA_VERSIONS = frozenset({1, 2, 3, 4})
_UNCHAIN_CONTEXT_SCHEMA_VERSIONS = frozenset({1, 2})
_LEGACY_REQUIRED_TABLES = frozenset(
    {
        "meta",
        "sessions",
        "generations",
        "attempts",
        "events",
        "operations",
        "objects",
        "artifacts",
    }
)
_UNCHAIN_REQUIRED_TABLES = frozenset(
    {
        "context_v2_schema",
        "executions",
        "events",
        "operations",
        "objects",
        "artifacts",
    }
)
_T = TypeVar("_T")


class ContextV2StoreBoundaryError(RuntimeError):
    """Stable host-admission failure raised before a store is constructed."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class ContextV2DatabaseInspection:
    path: Path
    schema_family: str
    user_version: int
    tables: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ContextV2StoreAdmission:
    root_dir: Path
    database_path: Path
    owner_manifest_path: Path
    owner: str
    database_state: str
    marker_created: bool


@dataclass(frozen=True, slots=True)
class _OwnerClaim:
    owner: str
    created: bool


def configured_context_v2_store_owner(
    environment: Mapping[str, str] | None = None,
) -> str:
    source = os.environ if environment is None else environment
    raw = source.get(CONTEXT_V2_STORE_OWNER_ENV, STORE_OWNER_PUPU_LEGACY)
    normalized = str(raw).strip().casefold()
    if normalized not in _CONFIGURED_OWNERS:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_invalid",
            f"{CONTEXT_V2_STORE_OWNER_ENV} must select off, pupu_legacy, or unchain",
        )
    return normalized


def _table_names(connection: sqlite3.Connection) -> tuple[str, ...]:
    rows = connection.execute(
        "SELECT name, type FROM sqlite_master "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY name"
    ).fetchall()
    if any(str(row[1]) not in {"table", "index", "trigger", "view"} for row in rows):
        raise sqlite3.DatabaseError("sqlite schema contains an unknown object type")
    return tuple(str(row[0]) for row in rows if str(row[1]) == "table")


def _legacy_schema_matches(
    connection: sqlite3.Connection,
    *,
    user_version: int,
    tables: frozenset[str],
) -> bool:
    if user_version not in _LEGACY_SCHEMA_VERSIONS:
        return False
    if not _LEGACY_REQUIRED_TABLES.issubset(tables):
        return False
    if "context_v2_schema" in tables:
        return False
    try:
        row = connection.execute(
            "SELECT value FROM meta WHERE key='schema_version'"
        ).fetchone()
    except sqlite3.Error:
        return False
    return row is not None and str(row[0]) == str(user_version)


def _unchain_schema_matches(
    connection: sqlite3.Connection,
    *,
    user_version: int,
    tables: frozenset[str],
) -> bool:
    if user_version != 0 or not _UNCHAIN_REQUIRED_TABLES.issubset(tables):
        return False
    if {"meta", "sessions", "generations", "attempts"}.intersection(tables):
        return False
    try:
        versions = {
            int(row[0])
            for row in connection.execute(
                "SELECT version FROM context_v2_schema ORDER BY version"
            )
        }
    except (sqlite3.Error, TypeError, ValueError):
        return False
    return versions == _UNCHAIN_CONTEXT_SCHEMA_VERSIONS


def inspect_context_v2_database(
    database_path: str | os.PathLike[str],
) -> ContextV2DatabaseInspection:
    """Classify a database using read-only schema evidence.

    Unknown, partial, or mixed schemas deliberately collapse to
    ``incompatible``.  Classification never creates the database and never
    runs either owner's migrations.
    """

    path = Path(database_path).expanduser().absolute()
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return ContextV2DatabaseInspection(path, "absent", 0, ())
    except OSError as exc:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_schema_unreadable",
            "Context V2 database metadata is unreadable",
        ) from exc
    if not stat.S_ISREG(metadata.st_mode) or path.is_symlink():
        return ContextV2DatabaseInspection(path, "incompatible", 0, ())
    if metadata.st_size == 0:
        return ContextV2DatabaseInspection(path, "incompatible", 0, ())

    uri = f"{path.as_uri()}?mode=ro"
    try:
        connection = sqlite3.connect(uri, uri=True, timeout=1.0, isolation_level=None)
        try:
            connection.execute("PRAGMA query_only=ON")
            user_version = int(connection.execute("PRAGMA user_version").fetchone()[0])
            table_names = _table_names(connection)
            tables = frozenset(table_names)
            if not tables and user_version == 0:
                family = "blank"
            elif _legacy_schema_matches(
                connection,
                user_version=user_version,
                tables=tables,
            ):
                family = STORE_OWNER_PUPU_LEGACY
            elif _unchain_schema_matches(
                connection,
                user_version=user_version,
                tables=tables,
            ):
                family = STORE_OWNER_UNCHAIN
            else:
                family = "incompatible"
        finally:
            connection.close()
    except (OSError, sqlite3.Error, TypeError, ValueError) as exc:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_schema_unreadable",
            "Context V2 database schema could not be inspected read-only",
        ) from exc
    return ContextV2DatabaseInspection(path, family, user_version, table_names)


def _manifest_payload(owner: str) -> dict[str, str]:
    return {
        "database": CONTEXT_V2_DATABASE_FILENAME,
        "owner": owner,
        "schema": _OWNER_SCHEMA,
    }


def _read_owner_manifest(path: Path) -> str | None:
    try:
        metadata = path.lstat()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_manifest_invalid",
            "Context V2 owner manifest is unreadable",
        ) from exc
    if (
        not stat.S_ISREG(metadata.st_mode)
        or path.is_symlink()
        or metadata.st_size <= 0
        or metadata.st_size > 4096
    ):
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_manifest_invalid",
            "Context V2 owner manifest is invalid",
        )
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_manifest_invalid",
            "Context V2 owner manifest is invalid",
        ) from exc
    if not isinstance(value, dict) or set(value) != {"database", "owner", "schema"}:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_manifest_invalid",
            "Context V2 owner manifest fields are invalid",
        )
    owner = value.get("owner")
    if value != _manifest_payload(str(owner)) or owner not in _ACTIVE_OWNERS:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_manifest_invalid",
            "Context V2 owner manifest values are invalid",
        )
    return str(owner)


def _write_owner_claim(root_dir: Path, marker_path: Path, owner: str) -> _OwnerClaim:
    payload = (
        json.dumps(
            _manifest_payload(owner),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
    ).encode("utf-8")
    descriptor = -1
    temporary_path: Path | None = None
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".context_v2.owner.",
            suffix=".tmp",
            dir=root_dir,
        )
        temporary_path = Path(temporary_name)
        with os.fdopen(descriptor, "wb", closefd=True) as stream:
            descriptor = -1
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary_path, marker_path, follow_symlinks=False)
        except FileExistsError:
            temporary_path.unlink(missing_ok=True)
            existing = _read_owner_manifest(marker_path)
            if existing is None:
                raise ContextV2StoreBoundaryError(
                    "context_v2_store_owner_manifest_invalid",
                    "Context V2 owner manifest disappeared during admission",
                )
            return _OwnerClaim(existing, False)
        try:
            directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
            directory_descriptor = os.open(root_dir, directory_flags)
            try:
                os.fsync(directory_descriptor)
            finally:
                os.close(directory_descriptor)
        except OSError:
            # Some supported platforms do not expose directory fsync.  The
            # exclusive manifest itself is already flushed and remains the
            # fail-closed authority after restart.
            pass
    except ContextV2StoreBoundaryError:
        raise
    except OSError as exc:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_claim_failed",
            "Context V2 owner could not be claimed durably",
        ) from exc
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
    return _OwnerClaim(owner, True)


def _validate_database_owner(
    inspection: ContextV2DatabaseInspection,
    *,
    owner: str,
) -> None:
    if inspection.schema_family == "incompatible":
        raise ContextV2StoreBoundaryError(
            "context_v2_store_schema_incompatible",
            "Context V2 database schema has no safe single owner",
        )
    if inspection.schema_family not in {"absent", "blank", owner}:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_conflict",
            "Context V2 database belongs to a different implementation",
        )


def admit_context_v2_store_owner(
    *,
    root_dir: str | os.PathLike[str],
    requested_owner: str,
) -> ContextV2StoreAdmission:
    """Claim or verify one durable owner before either store may be opened."""

    if requested_owner not in _ACTIVE_OWNERS:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_invalid",
            "requested Context V2 store owner is invalid",
        )
    root = Path(root_dir).expanduser().resolve()
    database_path = root / CONTEXT_V2_DATABASE_FILENAME
    marker_path = root / CONTEXT_V2_OWNER_FILENAME

    existing_owner = _read_owner_manifest(marker_path)
    if existing_owner is not None and existing_owner != requested_owner:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_conflict",
            "Context V2 data plane is already owned by another implementation",
        )

    inspection = inspect_context_v2_database(database_path)
    _validate_database_owner(inspection, owner=requested_owner)

    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    claim = (
        _OwnerClaim(existing_owner, False)
        if existing_owner is not None
        else _write_owner_claim(root, marker_path, requested_owner)
    )
    if claim.owner != requested_owner:
        raise ContextV2StoreBoundaryError(
            "context_v2_store_owner_conflict",
            "Context V2 data plane was claimed concurrently by another implementation",
        )

    # Re-read after the exclusive claim so a concurrent schema initializer can
    # only produce a closed failure, never permission for two implementations.
    verified = inspect_context_v2_database(database_path)
    _validate_database_owner(verified, owner=requested_owner)
    return ContextV2StoreAdmission(
        root_dir=root,
        database_path=database_path,
        owner_manifest_path=marker_path,
        owner=requested_owner,
        database_state=verified.schema_family,
        marker_created=claim.created,
    )


def open_context_v2_owned_store(
    *,
    root_dir: str | os.PathLike[str],
    requested_owner: str,
    opener: Callable[[ContextV2StoreAdmission], _T],
) -> _T:
    """Run a store factory only after exact owner/schema admission succeeds."""

    if not callable(opener):
        raise TypeError("opener must be callable")
    admission = admit_context_v2_store_owner(
        root_dir=root_dir,
        requested_owner=requested_owner,
    )
    return opener(admission)


__all__ = (
    "CONTEXT_V2_DATABASE_FILENAME",
    "CONTEXT_V2_OWNER_FILENAME",
    "CONTEXT_V2_STORE_OWNER_ENV",
    "STORE_OWNER_OFF",
    "STORE_OWNER_PUPU_LEGACY",
    "STORE_OWNER_UNCHAIN",
    "ContextV2DatabaseInspection",
    "ContextV2StoreAdmission",
    "ContextV2StoreBoundaryError",
    "admit_context_v2_store_owner",
    "configured_context_v2_store_owner",
    "inspect_context_v2_database",
    "open_context_v2_owned_store",
)
