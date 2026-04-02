from __future__ import annotations

import base64
import hashlib
import os
from typing import Any


def _root():
    import character_store as root_module

    return root_module


def _coerce_avatar_payload(payload: dict[str, Any]) -> tuple[str, str] | None:
    root = _root()
    raw_avatar = payload.get("avatar")
    if raw_avatar is None:
        candidate = payload.get("avatar_data_url") or payload.get("avatarDataUrl")
    elif isinstance(raw_avatar, str):
        candidate = raw_avatar
    elif isinstance(raw_avatar, dict):
        candidate = (
            raw_avatar.get("data_url")
            or raw_avatar.get("dataUrl")
            or raw_avatar.get("value")
        )
    else:
        candidate = None

    if not isinstance(candidate, str) or not candidate.strip():
        return None

    match = root._DATA_URL_PATTERN.fullmatch(candidate.strip())
    if not match:
        raise ValueError("avatar must be a valid base64 data URL")

    mime_type = match.group("mime").strip().lower()
    if mime_type not in root._AVATAR_EXTENSION_BY_MIME:
        raise ValueError(f"unsupported avatar mime type: {mime_type}")

    try:
        decoded = base64.b64decode(match.group("data"), validate=True)
    except Exception as exc:
        raise ValueError("avatar contains invalid base64 data") from exc

    return mime_type, decoded.decode("latin1")


def _write_avatar_file(
    data_dir: str,
    *,
    character_id: str,
    mime_type: str,
    decoded_latin1: str,
    existing_avatar: dict[str, Any] | None,
) -> dict[str, Any]:
    root = _root()
    binary_data = decoded_latin1.encode("latin1")
    extension = root._AVATAR_EXTENSION_BY_MIME[mime_type]
    avatar_dir = root._avatars_dir(data_dir)
    next_path = os.path.join(avatar_dir, f"{character_id}{extension}")

    if isinstance(existing_avatar, dict):
        previous_relative_path = existing_avatar.get("relative_path")
        if isinstance(previous_relative_path, str) and previous_relative_path.strip():
            previous_path = os.path.join(data_dir, previous_relative_path)
            if previous_path != next_path and os.path.exists(previous_path):
                try:
                    os.remove(previous_path)
                except Exception:
                    pass

    with open(next_path, "wb") as handle:
        handle.write(binary_data)

    return {
        "file_name": os.path.basename(next_path),
        "relative_path": os.path.relpath(next_path, data_dir),
        "absolute_path": next_path,
        "mime_type": mime_type,
        "size_bytes": len(binary_data),
        "sha256": hashlib.sha256(binary_data).hexdigest(),
    }


def _remove_avatar_file(data_dir: str, avatar: dict[str, Any] | None) -> None:
    if not isinstance(avatar, dict):
        return
    relative_path = avatar.get("relative_path")
    if not isinstance(relative_path, str) or not relative_path.strip():
        return
    target_path = os.path.join(data_dir, relative_path)
    if os.path.exists(target_path):
        try:
            os.remove(target_path)
        except Exception:
            pass
