from __future__ import annotations

import json
import os
from typing import Any


def _root():
    import memory_factory as root_module

    return root_module


def _repair_qdrant_local_meta(data_dir: str) -> bool:
    root = _root()
    meta_path = root._qdrant_meta_path(data_dir)
    if not os.path.exists(meta_path):
        return False

    try:
        with open(meta_path, "r", encoding="utf-8") as handle:
            meta = json.load(handle)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid Qdrant meta.json at {meta_path}: {exc.msg}") from exc

    if not isinstance(meta, dict):
        raise RuntimeError(f"Invalid Qdrant meta.json at {meta_path}: expected object")

    collections = meta.get("collections")
    if not isinstance(collections, dict) or not collections:
        return False

    from qdrant_client.http.models import CreateCollection

    field_map = getattr(CreateCollection, "model_fields", None) or getattr(
        CreateCollection,
        "__fields__",
        None,
    )
    allowed_fields = set(field_map.keys()) if isinstance(field_map, dict) else set()
    if not allowed_fields:
        return False

    changed = False
    for collection_name, config in list(collections.items()):
        if not isinstance(config, dict):
            continue
        sanitized_config = {
            key: value for key, value in config.items() if key in allowed_fields
        }
        if sanitized_config != config:
            collections[collection_name] = sanitized_config
            changed = True

    if not changed:
        return False

    root._atomic_write_json(meta_path, meta)
    return True


def _get_or_create_qdrant_client(data_dir: str) -> "QdrantClient":
    root = _root()
    normalized_data_dir = root._normalize_data_dir(data_dir)
    if normalized_data_dir in root._qdrant_clients:
        return root._qdrant_clients[normalized_data_dir]

    with root._qdrant_clients_lock:
        existing_client = root._qdrant_clients.get(normalized_data_dir)
        if existing_client is not None:
            return existing_client

        from qdrant_client import QdrantClient

        _repair_qdrant_local_meta(normalized_data_dir)
        created_client = QdrantClient(path=root._qdrant_path(normalized_data_dir))
        root._qdrant_clients[normalized_data_dir] = created_client
        return created_client


def _delete_collection_best_effort(client: Any, collection_name: str) -> None:
    delete_collection = getattr(client, "delete_collection", None)
    if not callable(delete_collection) or not collection_name:
        return

    try:
        delete_collection(collection_name=collection_name)
    except TypeError:
        try:
            delete_collection(collection_name)
        except Exception:
            return
    except Exception:
        return


def _delete_collection_best_effort_with_warning(
    client: Any,
    collection_name: str,
) -> str:
    delete_collection = getattr(client, "delete_collection", None)
    if not callable(delete_collection) or not collection_name:
        return ""

    try:
        delete_collection(collection_name=collection_name)
        return ""
    except TypeError:
        try:
            delete_collection(collection_name)
            return ""
        except Exception as exc:
            return str(exc)
    except Exception as exc:
        return str(exc)
