from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

import pytest

import memory_v2_runtime as runtime_module
from memory_v2_runtime import _reset_memory_v2_runtime_for_tests
from memory_v2_store import MemoryV2Error, MemoryV2Store
from memory_v2_store_boundary import (
    CONTEXT_V2_DATABASE_FILENAME,
    CONTEXT_V2_OWNER_FILENAME,
    CONTEXT_V2_STORE_OWNER_ENV,
    STORE_OWNER_OFF,
    STORE_OWNER_PUPU_LEGACY,
    STORE_OWNER_UNCHAIN,
    ContextV2StoreBoundaryError,
    admit_context_v2_store_owner,
    inspect_context_v2_database,
    open_context_v2_owned_store,
)


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _create_legacy_database(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    database = root / CONTEXT_V2_DATABASE_FILENAME
    with sqlite3.connect(database) as connection:
        connection.executescript(
            """
            PRAGMA user_version=4;
            CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            INSERT INTO meta(key, value) VALUES('schema_version', '4');
            CREATE TABLE sessions(session_id TEXT PRIMARY KEY);
            CREATE TABLE generations(generation_id TEXT PRIMARY KEY);
            CREATE TABLE attempts(attempt_id TEXT PRIMARY KEY);
            CREATE TABLE events(event_id TEXT PRIMARY KEY);
            CREATE TABLE operations(operation_id TEXT PRIMARY KEY);
            CREATE TABLE objects(object_id TEXT PRIMARY KEY);
            CREATE TABLE artifacts(artifact_id TEXT PRIMARY KEY);
            """
        )
    return database


def _create_unchain_database(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    database = root / CONTEXT_V2_DATABASE_FILENAME
    with sqlite3.connect(database) as connection:
        connection.executescript(
            """
            CREATE TABLE context_v2_schema(
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO context_v2_schema(version) VALUES(1), (2);
            CREATE TABLE executions(execution_id TEXT PRIMARY KEY);
            CREATE TABLE operations(operation_id TEXT PRIMARY KEY);
            CREATE TABLE events(event_id TEXT PRIMARY KEY);
            CREATE TABLE objects(sha256 TEXT PRIMARY KEY);
            CREATE TABLE artifacts(artifact_id TEXT PRIMARY KEY);
            """
        )
    return database


@pytest.fixture(autouse=True)
def _reset_runtime():
    _reset_memory_v2_runtime_for_tests()
    yield
    _reset_memory_v2_runtime_for_tests()


def test_first_blank_store_claim_is_durable_and_losing_factory_never_runs(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    opened: list[str] = []

    result = open_context_v2_owned_store(
        root_dir=root,
        requested_owner=STORE_OWNER_PUPU_LEGACY,
        opener=lambda admission: opened.append(admission.owner) or "legacy-store",
    )

    assert result == "legacy-store"
    assert opened == [STORE_OWNER_PUPU_LEGACY]
    manifest = json.loads((root / CONTEXT_V2_OWNER_FILENAME).read_text("utf-8"))
    assert manifest == {
        "database": CONTEXT_V2_DATABASE_FILENAME,
        "owner": STORE_OWNER_PUPU_LEGACY,
        "schema": "pupu.context-v2-store-owner.v1",
    }

    with pytest.raises(ContextV2StoreBoundaryError) as raised:
        open_context_v2_owned_store(
            root_dir=root,
            requested_owner=STORE_OWNER_UNCHAIN,
            opener=lambda _admission: opened.append("must-not-open"),
        )

    assert raised.value.code == "context_v2_store_owner_conflict"
    assert opened == [STORE_OWNER_PUPU_LEGACY]


def test_existing_legacy_schema_blocks_unchain_without_rewriting_data(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    database = _create_legacy_database(root)
    before = _digest(database)

    assert (
        inspect_context_v2_database(database).schema_family == STORE_OWNER_PUPU_LEGACY
    )
    with pytest.raises(ContextV2StoreBoundaryError) as raised:
        admit_context_v2_store_owner(
            root_dir=root,
            requested_owner=STORE_OWNER_UNCHAIN,
        )

    assert raised.value.code == "context_v2_store_owner_conflict"
    assert _digest(database) == before
    assert not (root / CONTEXT_V2_OWNER_FILENAME).exists()

    admitted = admit_context_v2_store_owner(
        root_dir=root,
        requested_owner=STORE_OWNER_PUPU_LEGACY,
    )
    assert admitted.database_state == "pupu_legacy"
    assert admitted.owner == STORE_OWNER_PUPU_LEGACY
    assert _digest(database) == before


def test_real_legacy_store_schema_is_recognized_without_reopening_it(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    legacy = MemoryV2Store(root)
    legacy.close()
    database = root / CONTEXT_V2_DATABASE_FILENAME
    before = _digest(database)

    inspection = inspect_context_v2_database(database)

    assert inspection.schema_family == STORE_OWNER_PUPU_LEGACY
    assert inspection.user_version == 4
    assert _digest(database) == before


def test_existing_unchain_schema_blocks_legacy_without_rewriting_data(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    database = _create_unchain_database(root)
    before = _digest(database)

    assert inspect_context_v2_database(database).schema_family == STORE_OWNER_UNCHAIN
    with pytest.raises(ContextV2StoreBoundaryError) as raised:
        admit_context_v2_store_owner(
            root_dir=root,
            requested_owner=STORE_OWNER_PUPU_LEGACY,
        )

    assert raised.value.code == "context_v2_store_owner_conflict"
    assert _digest(database) == before
    assert not (root / CONTEXT_V2_OWNER_FILENAME).exists()


def test_competing_first_claims_have_exactly_one_owner(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"

    def claim(owner: str) -> tuple[str, str]:
        try:
            admission = admit_context_v2_store_owner(
                root_dir=root,
                requested_owner=owner,
            )
            return "admitted", admission.owner
        except ContextV2StoreBoundaryError as exc:
            return "failed", exc.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = tuple(
            pool.map(claim, (STORE_OWNER_PUPU_LEGACY, STORE_OWNER_UNCHAIN))
        )

    admitted = [value for status, value in outcomes if status == "admitted"]
    failed = [value for status, value in outcomes if status == "failed"]
    assert len(admitted) == 1
    assert failed == ["context_v2_store_owner_conflict"]
    marker = json.loads((root / CONTEXT_V2_OWNER_FILENAME).read_text("utf-8"))
    assert marker["owner"] == admitted[0]


def test_unknown_or_mixed_schema_fails_closed_without_claiming(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    database = _create_legacy_database(root)
    with sqlite3.connect(database) as connection:
        connection.execute(
            "CREATE TABLE context_v2_schema(version INTEGER PRIMARY KEY)"
        )
        connection.execute("INSERT INTO context_v2_schema(version) VALUES(1), (2)")
        connection.execute("CREATE TABLE executions(execution_id TEXT PRIMARY KEY)")

    before = _digest(database)
    assert inspect_context_v2_database(database).schema_family == "incompatible"

    for owner in (STORE_OWNER_PUPU_LEGACY, STORE_OWNER_UNCHAIN):
        with pytest.raises(ContextV2StoreBoundaryError) as raised:
            admit_context_v2_store_owner(root_dir=root, requested_owner=owner)
        assert raised.value.code == "context_v2_store_schema_incompatible"

    assert _digest(database) == before
    assert not (root / CONTEXT_V2_OWNER_FILENAME).exists()


def test_malformed_owner_manifest_fails_closed_before_factory(tmp_path: Path) -> None:
    root = tmp_path / "memory_v2"
    root.mkdir(parents=True)
    marker = root / CONTEXT_V2_OWNER_FILENAME
    marker.write_text('{"owner":"unchain"}', encoding="utf-8")
    opened: list[bool] = []

    with pytest.raises(ContextV2StoreBoundaryError) as raised:
        open_context_v2_owned_store(
            root_dir=root,
            requested_owner=STORE_OWNER_UNCHAIN,
            opener=lambda _admission: opened.append(True),
        )

    assert raised.value.code == "context_v2_store_owner_manifest_invalid"
    assert opened == []


@pytest.mark.parametrize("configured_owner", (STORE_OWNER_OFF, STORE_OWNER_UNCHAIN))
def test_legacy_runtime_stays_closed_when_host_selects_another_owner(
    tmp_path: Path,
    configured_owner: str,
) -> None:
    with mock.patch.dict(
        os.environ,
        {
            "UNCHAIN_DATA_DIR": str(tmp_path),
            CONTEXT_V2_STORE_OWNER_ENV: configured_owner,
        },
        clear=True,
    ), mock.patch.object(runtime_module, "MemoryV2Store") as legacy_factory:
        assert runtime_module.get_memory_v2_runtime(required=False) is None
        with pytest.raises(MemoryV2Error) as raised:
            runtime_module.get_memory_v2_runtime(required=True)

    expected = (
        "context_v2_store_disabled"
        if configured_owner == STORE_OWNER_OFF
        else "context_v2_owned_by_unchain"
    )
    assert raised.value.code == expected
    legacy_factory.assert_not_called()
    assert not (tmp_path / "memory_v2" / CONTEXT_V2_OWNER_FILENAME).exists()
    assert not (tmp_path / "memory_v2" / CONTEXT_V2_DATABASE_FILENAME).exists()


def test_legacy_runtime_claims_before_open_and_rejects_unchain_database(
    tmp_path: Path,
) -> None:
    root = tmp_path / "memory_v2"
    database = _create_unchain_database(root)
    before = _digest(database)

    with mock.patch.dict(
        os.environ,
        {
            "UNCHAIN_DATA_DIR": str(tmp_path),
            CONTEXT_V2_STORE_OWNER_ENV: STORE_OWNER_PUPU_LEGACY,
        },
        clear=True,
    ), mock.patch.object(runtime_module, "MemoryV2Store") as legacy_factory:
        with pytest.raises(MemoryV2Error) as raised:
            runtime_module.get_memory_v2_runtime(required=True)

    assert raised.value.code == "context_v2_store_owner_conflict"
    legacy_factory.assert_not_called()
    assert _digest(database) == before
