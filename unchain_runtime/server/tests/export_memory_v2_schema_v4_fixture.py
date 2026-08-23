#!/usr/bin/env python3
"""Capture one sanitized, frozen schema-v4 SQLite/CAS compatibility fixture.

This exporter is intentionally manual.  The test suite consumes the checked-in
binary fixture and never regenerates its expected bytes at test time.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path


SERVER_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = SERVER_ROOT.parents[1]
FIXTURE_ROOT = Path(__file__).with_name("fixtures") / "context_v2_schema_v4_frozen"
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from memory_v2_store import MemoryV2Store  # noqa: E402


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(128 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _schema_records(db_path: Path) -> list[dict[str, str]]:
    with sqlite3.connect(db_path) as connection:
        rows = connection.execute(
            "SELECT type, name, tbl_name, COALESCE(sql, '') FROM sqlite_master "
            "WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name"
        ).fetchall()
    return [
        {
            "type": kind,
            "name": name,
            "table": table,
            "sql": " ".join(sql.split()),
        }
        for kind, name, table, sql in rows
    ]


def _durable_rows(db_path: Path) -> dict[str, list[list[object]]]:
    queries = {
        "events": (
            "SELECT event_id, generation_id, attempt_id, store_seq, payload_hash "
            "FROM events ORDER BY store_seq"
        ),
        "artifacts": (
            "SELECT artifact_id, revision, generation_id, object_id, mime_type "
            "FROM artifacts ORDER BY artifact_id"
        ),
        "entries": (
            "SELECT entry_id, revision, space_id, virtual_path, kind, object_id, "
            "source_event_id FROM entries ORDER BY entry_id"
        ),
        "entry_revisions": (
            "SELECT entry_id, revision, space_id, virtual_path, kind, object_id, "
            "source_event_id FROM entry_revisions ORDER BY entry_id, revision"
        ),
        "links": (
            "SELECT link_id, space_id, entry_id, entry_revision, url "
            "FROM links ORDER BY link_id"
        ),
        "candidates": (
            "SELECT candidate_id, owner_chat_id, source_event_ids_json, target_space_id, "
            "target_path, kind, object_id, status, revision FROM candidates "
            "ORDER BY candidate_id"
        ),
        "promotions": (
            "SELECT promotion_id, owner_chat_id, source_space_id, source_entry_id, "
            "source_entry_revision, target_namespace, target_path, status, revision "
            "FROM promotions ORDER BY promotion_id"
        ),
        "operations": (
            "SELECT operation_id, operation_kind, payload_hash, response_json "
            "FROM operations ORDER BY operation_id"
        ),
    }
    with sqlite3.connect(db_path) as connection:
        return {
            table: [list(row) for row in connection.execute(query).fetchall()]
            for table, query in queries.items()
        }


def _git_value(*args: str) -> str:
    return subprocess.check_output(
        ["git", *args],
        cwd=REPOSITORY_ROOT,
        text=True,
    ).strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace", action="store_true")
    args = parser.parse_args(argv)
    if FIXTURE_ROOT.exists():
        manifest_path = FIXTURE_ROOT / "manifest.json"
        existing = (
            json.loads(manifest_path.read_text("utf-8"))
            if manifest_path.is_file()
            else {}
        )
        incomplete_db = FIXTURE_ROOT / "context_v2.sqlite3"
        incomplete_schema_v4 = False
        if incomplete_db.is_file():
            with sqlite3.connect(incomplete_db) as connection:
                incomplete_schema_v4 = (
                    int(connection.execute("PRAGMA user_version").fetchone()[0]) == 4
                )
        trusted_existing = (
            existing.get("schema")
            == "pupu.context_v2.frozen_schema_v4_fixture.v1"
            and existing.get("sanitized_synthetic_data") is True
        ) or incomplete_schema_v4
        if not args.replace or not trusted_existing:
            raise SystemExit(
                f"refusing to overwrite frozen fixture: {FIXTURE_ROOT}"
            )
        shutil.rmtree(FIXTURE_ROOT)

    tick = 1_720_000_000_000

    def clock() -> int:
        nonlocal tick
        tick += 1
        return tick

    with tempfile.TemporaryDirectory(prefix="pupu-schema-v4-fixture-") as directory:
        source_root = Path(directory) / "memory_v2"
        store = MemoryV2Store(source_root, clock=clock)
        seed = store.append_semantic_event(
            owner_chat_id="fixture-chat",
            session_id="fixture-session",
            attempt_id="fixture-attempt",
            event={
                "event_id": "fixture-event-user",
                "type": "message.user",
                "seq": 1,
                "payload": {"content": "Synthetic frozen P0 objective"},
            },
            operation_id="fixture-event-operation",
        )
        artifact = store.record_artifact(
            owner_chat_id="fixture-chat",
            session_id="fixture-session",
            attempt_id="fixture-attempt",
            operation_id="fixture-artifact-operation",
            artifact={"kind": "tool.result", "preview": "Synthetic output"},
            content=b"synthetic frozen artifact\n",
            mime_type="text/plain",
            source_event_ids=("fixture-event-user",),
        )
        space = store.ensure_space(
            scope_kind="chat",
            scope_key="fixture-chat",
            owner_chat_id="fixture-chat",
            name="Synthetic chat workspace",
            description="Frozen schema-v4 compatibility data",
            operation_id="fixture-space-operation",
        )
        folder = store.create_entry(
            owner_chat_id="fixture-chat",
            space_id=space["space_id"],
            entry_id="fixture-folder",
            path="/notes",
            kind="folder",
            expected_space_revision=space["revision"],
            operation_id="fixture-folder-operation",
        )
        entry = store.create_entry(
            owner_chat_id="fixture-chat",
            space_id=space["space_id"],
            entry_id="fixture-entry",
            path="/notes/state.md",
            kind="file",
            description="Synthetic durable task state",
            mime_type="text/markdown",
            content=b"# Synthetic state\n\nNo user data.\n",
            source_event_id="fixture-event-user",
            expected_space_revision=folder["space_revision"],
            operation_id="fixture-entry-operation",
        )
        link = store.create_entry(
            owner_chat_id="fixture-chat",
            space_id=space["space_id"],
            entry_id="fixture-link",
            path="/project",
            kind="link",
            description="Synthetic public project link",
            link_url="https://example.test/project?view=memory#overview",
            expected_space_revision=entry["space_revision"],
            operation_id="fixture-link-operation",
        )
        candidate = store.create_candidate(
            owner_chat_id="fixture-chat",
            session_id="fixture-session",
            attempt_id="fixture-attempt",
            source_agent_run_id="fixture-agent-run",
            source_event_ids=("fixture-event-user",),
            target_space_id=space["space_id"],
            target_path="/notes/candidate.md",
            kind="file",
            description="Synthetic frozen candidate",
            mime_type="text/markdown",
            content=b"# Synthetic candidate\n",
            rationale="Fixture lifecycle coverage",
            operation_id="fixture-candidate-operation",
        )
        promotion = store.propose_promotion(
            owner_chat_id="fixture-chat",
            source_space_id=space["space_id"],
            source_entry_id="fixture-entry",
            source_entry_revision=1,
            target_namespace="user.fixture",
            target_path="/memory/state.md",
            operation_id="fixture-promotion-operation",
        )
        store.close()

        with sqlite3.connect(source_root / "context_v2.sqlite3") as connection:
            connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            assert connection.execute("PRAGMA quick_check").fetchone()[0] == "ok"

        FIXTURE_ROOT.mkdir(parents=True)
        fixture_db = FIXTURE_ROOT / "context_v2.sqlite3"
        shutil.copy2(source_root / "context_v2.sqlite3", fixture_db)
        shutil.copytree(source_root / "objects", FIXTURE_ROOT / "objects")

    schema_records = _schema_records(fixture_db)
    schema_bytes = json.dumps(
        schema_records,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    durable_rows = _durable_rows(fixture_db)
    durable_bytes = json.dumps(
        durable_rows,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    object_records = [
        {
            "name": path.name,
            "bytes": path.stat().st_size,
            "sha256": _sha256(path),
        }
        for path in sorted((FIXTURE_ROOT / "objects").iterdir())
        if path.is_file()
    ]
    manifest = {
        "schema": "pupu.context_v2.frozen_schema_v4_fixture.v1",
        "fixture_revision": 1,
        "source_head": _git_value("rev-parse", "HEAD"),
        "source_dirty": bool(_git_value("status", "--porcelain")),
        "sanitized_synthetic_data": True,
        "user_version": 4,
        "database": {
            "file": "context_v2.sqlite3",
            "bytes": fixture_db.stat().st_size,
            "sha256": _sha256(fixture_db),
        },
        "schema_sha256": hashlib.sha256(schema_bytes).hexdigest(),
        "durable_rows_sha256": hashlib.sha256(durable_bytes).hexdigest(),
        "objects": object_records,
        "scope": {
            "owner_chat_id": "fixture-chat",
            "session_id": "fixture-session",
            "generation_id": seed["generation_id"],
            "attempt_id": "fixture-attempt",
            "artifact_ref": artifact["artifact_ref"]["uri"],
            "space_id": space["space_id"],
            "entry_ref": entry["ref"],
            "link_ref": link["ref"],
            "candidate_ref": candidate["candidate_ref"],
            "promotion_id": promotion["promotion_id"],
        },
    }
    (FIXTURE_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
