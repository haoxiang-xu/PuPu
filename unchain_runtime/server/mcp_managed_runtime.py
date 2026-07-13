from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import sys
import tarfile
import tempfile
import threading
import urllib.request
from pathlib import Path
from typing import Any, Dict


class McpManagedRuntimeError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.status = status


RUNTIME_ROOT_NAME = "mcp_runtime"
NODE_INDEX_URL = "https://nodejs.org/dist/index.json"
NODE_DIST_BASE_URL = "https://nodejs.org/dist"
UV_LATEST_BASE_URL = "https://github.com/astral-sh/uv/releases/latest/download"

_LOCKS = {
    "node": threading.Lock(),
    "uv": threading.Lock(),
}


def _data_dir(explicit: str | Path | None = None) -> Path:
    if explicit is not None:
        return Path(explicit)
    raw = os.environ.get("UNCHAIN_DATA_DIR", "").strip()
    if raw:
        return Path(raw)
    return Path.home() / ".pupu"


def _runtime_root(data_dir: str | Path | None = None) -> Path:
    return _data_dir(data_dir) / RUNTIME_ROOT_NAME


def _read_json_file(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_manifest(root: Path, manifest: Dict[str, Any]) -> None:
    root.mkdir(parents=True, exist_ok=True)
    target = root / "manifest.json"
    fd, tmp_name = tempfile.mkstemp(
        prefix="manifest.",
        suffix=".tmp",
        dir=str(root),
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2, sort_keys=True)
        os.replace(tmp_name, target)
    finally:
        try:
            Path(tmp_name).unlink(missing_ok=True)
        except Exception:
            pass


def _read_url_text(url: str, timeout: int = 60) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "PuPu-MCP-Runtime"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8")
    except Exception as exc:
        raise McpManagedRuntimeError(
            "mcp_runtime_install_failed",
            f"Unable to fetch managed MCP runtime metadata from {url}: {exc}",
        ) from exc


def _download_file(url: str, path: Path, timeout: int = 300) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "PuPu-MCP-Runtime"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            final_url = str(response.geturl() or url)
            with path.open("wb") as handle:
                shutil.copyfileobj(response, handle)
            return final_url
    except Exception as exc:
        raise McpManagedRuntimeError(
            "mcp_runtime_install_failed",
            f"Unable to download managed MCP runtime from {url}: {exc}",
        ) from exc


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _parse_checksum_for_file(text: str, filename: str) -> str:
    for line in text.splitlines():
        parts = line.strip().split()
        if len(parts) >= 2 and parts[-1].lstrip("*") == filename:
            return parts[0].lower()
    parts = text.strip().split()
    if parts and len(parts[0]) == 64:
        return parts[0].lower()
    raise McpManagedRuntimeError(
        "mcp_runtime_install_failed",
        f"Unable to find checksum for {filename}",
    )


def _verify_checksum(path: Path, expected: str, label: str) -> None:
    actual = _sha256_file(path)
    if actual.lower() != expected.lower():
        raise McpManagedRuntimeError(
            "mcp_runtime_checksum_failed",
            f"Checksum mismatch for {label}: expected {expected}, got {actual}",
        )


def _safe_extract_tar(archive_path: Path, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    root = target_dir.resolve()
    try:
        with tarfile.open(archive_path, "r:gz") as archive:
            members = archive.getmembers()
            for member in members:
                destination = (target_dir / member.name).resolve()
                if destination != root and not destination.is_relative_to(root):
                    raise McpManagedRuntimeError(
                        "mcp_runtime_install_failed",
                        f"Archive contains unsafe path: {member.name}",
                    )
                if member.issym() or member.islnk():
                    link_path = Path(member.linkname)
                    if link_path.is_absolute() or ".." in link_path.parts:
                        raise McpManagedRuntimeError(
                            "mcp_runtime_install_failed",
                            f"Archive contains unsafe link: {member.name}",
                        )
            archive.extractall(target_dir, members=members)
    except McpManagedRuntimeError:
        raise
    except Exception as exc:
        raise McpManagedRuntimeError(
            "mcp_runtime_install_failed",
            f"Unable to extract managed MCP runtime archive {archive_path}: {exc}",
        ) from exc


def _platform_arches() -> tuple[str, str]:
    machine = platform.machine().lower()
    if machine in {"arm64", "aarch64"}:
        return "arm64", "aarch64"
    if machine in {"x86_64", "amd64"}:
        return "x64", "x86_64"
    raise McpManagedRuntimeError(
        "mcp_runtime_unsupported_platform",
        f"PuPu-managed MCP runtime does not support macOS architecture: {machine}",
        400,
    )


def _path_env(bin_dir: Path, env: Dict[str, str]) -> str:
    current = env.get("PATH") or os.environ.get("PATH", "")
    return str(bin_dir) if not current else str(bin_dir) + os.pathsep + current


def _node_env(root: Path, bin_dir: Path, env: Dict[str, str]) -> Dict[str, str]:
    cache_dir = root / "cache" / "npm"
    return {
        "PATH": _path_env(bin_dir, env),
        "NPM_CONFIG_CACHE": str(cache_dir),
        "npm_config_cache": str(cache_dir),
    }


def _uv_env(root: Path, bin_dir: Path, env: Dict[str, str]) -> Dict[str, str]:
    return {
        "PATH": _path_env(bin_dir, env),
        "UV_CACHE_DIR": str(root / "cache" / "uv"),
        "UV_TOOL_DIR": str(root / "tools"),
        "UV_TOOL_BIN_DIR": str(root / "tools" / "bin"),
        "UV_PYTHON_INSTALL_DIR": str(root / "python"),
        "UV_NO_MODIFY_PATH": "1",
        "UV_NO_PROGRESS": "1",
    }


def _runtime_from_manifest(
    root: Path,
    kind: str,
    command_name: str,
    env: Dict[str, str],
) -> Dict[str, Any] | None:
    manifest = _read_json_file(root / "manifest.json")
    record = manifest.get(kind)
    if not isinstance(record, dict):
        return None
    command = Path(str(record.get("command") or ""))
    bin_dir = Path(str(record.get("bin_dir") or command.parent))
    if command.name != command_name or not command.exists():
        return None
    managed_env = _node_env(root, bin_dir, env) if kind == "node" else _uv_env(root, bin_dir, env)
    return {
        "command": str(command),
        "managed_env": managed_env,
        "managed_runtime": {
            key: value
            for key, value in record.items()
            if key not in {"managed_env"} and isinstance(key, str)
        },
    }


def _store_runtime_manifest(root: Path, kind: str, record: Dict[str, Any]) -> None:
    manifest = _read_json_file(root / "manifest.json")
    manifest[kind] = dict(record)
    _write_manifest(root, manifest)


def _latest_lts_node_release(node_arch: str) -> Dict[str, Any]:
    try:
        releases = json.loads(_read_url_text(NODE_INDEX_URL))
    except McpManagedRuntimeError:
        raise
    except Exception as exc:
        raise McpManagedRuntimeError(
            "mcp_runtime_install_failed",
            f"Unable to parse Node.js release index: {exc}",
        ) from exc

    file_tag = f"osx-{node_arch}-tar"
    for release in releases:
        if (
            isinstance(release, dict)
            and release.get("lts")
            and file_tag in (release.get("files") or [])
            and str(release.get("version") or "").startswith("v")
        ):
            return release
    raise McpManagedRuntimeError(
        "mcp_runtime_install_failed",
        f"Unable to find a Node.js LTS release for macOS {node_arch}",
    )


def _find_command(root: Path, command_name: str) -> Path:
    matches = [path for path in root.rglob(command_name) if path.is_file() or path.is_symlink()]
    if not matches:
        raise McpManagedRuntimeError(
            "mcp_runtime_install_failed",
            f"Managed MCP runtime archive did not contain {command_name}",
        )
    for path in matches:
        if path.parent.name == "bin":
            return path
    return matches[0]


def _install_node_runtime(root: Path, env: Dict[str, str]) -> Dict[str, Any]:
    node_arch, _uv_arch = _platform_arches()
    release = _latest_lts_node_release(node_arch)
    version = str(release["version"])
    filename = f"node-{version}-darwin-{node_arch}.tar.gz"
    final_dir = root / "runtimes" / f"node-{version}-darwin-{node_arch}"
    command = final_dir / "bin" / "npx"
    if command.exists():
        record = {
            "kind": "node",
            "version": version,
            "source_command": "npx",
            "command": str(command),
            "bin_dir": str(command.parent),
            "source": f"{NODE_DIST_BASE_URL}/{version}/{filename}",
        }
        _store_runtime_manifest(root, "node", record)
        return _runtime_from_manifest(root, "node", "npx", env) or {}

    downloads_dir = root / "downloads"
    archive_path = downloads_dir / filename
    shasums_url = f"{NODE_DIST_BASE_URL}/{version}/SHASUMS256.txt"
    archive_url = f"{NODE_DIST_BASE_URL}/{version}/{filename}"
    shasums = _read_url_text(shasums_url)
    expected = _parse_checksum_for_file(shasums, filename)
    _download_file(archive_url, archive_path)
    _verify_checksum(archive_path, expected, filename)

    temp_parent = root / "runtimes"
    temp_parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="node.", suffix=".tmp", dir=str(temp_parent)))
    try:
        _safe_extract_tar(archive_path, temp_dir)
        extracted = temp_dir / f"node-{version}-darwin-{node_arch}"
        if not extracted.exists():
            extracted = next((path for path in temp_dir.iterdir() if path.is_dir()), None)
        if not extracted or not extracted.exists():
            raise McpManagedRuntimeError(
                "mcp_runtime_install_failed",
                "Node.js archive did not contain an extracted runtime directory",
            )
        if final_dir.exists():
            shutil.rmtree(final_dir)
        shutil.move(str(extracted), str(final_dir))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    command.chmod(command.stat().st_mode | 0o111)
    record = {
        "kind": "node",
        "version": version,
        "source_command": "npx",
        "command": str(command),
        "bin_dir": str(command.parent),
        "source": archive_url,
    }
    _store_runtime_manifest(root, "node", record)
    return _runtime_from_manifest(root, "node", "npx", env) or {}


def _uv_version_from_url(url: str) -> str:
    marker = "/download/"
    if marker not in url:
        return "latest"
    tail = url.split(marker, 1)[1]
    return tail.split("/", 1)[0] or "latest"


def _install_uv_runtime(root: Path, env: Dict[str, str]) -> Dict[str, Any]:
    _node_arch, uv_arch = _platform_arches()
    filename = f"uv-{uv_arch}-apple-darwin.tar.gz"
    final_dir = root / "runtimes" / f"uv-{uv_arch}-apple-darwin"
    command = final_dir / "uvx"
    if command.exists():
        record = {
            "kind": "uv",
            "version": "latest",
            "source_command": "uvx",
            "command": str(command),
            "bin_dir": str(command.parent),
            "source": f"{UV_LATEST_BASE_URL}/{filename}",
        }
        _store_runtime_manifest(root, "uv", record)
        return _runtime_from_manifest(root, "uv", "uvx", env) or {}

    downloads_dir = root / "downloads"
    archive_path = downloads_dir / filename
    archive_url = f"{UV_LATEST_BASE_URL}/{filename}"
    checksum_url = f"{archive_url}.sha256"
    expected = _parse_checksum_for_file(_read_url_text(checksum_url), filename)
    final_url = _download_file(archive_url, archive_path)
    _verify_checksum(archive_path, expected, filename)

    temp_parent = root / "runtimes"
    temp_parent.mkdir(parents=True, exist_ok=True)
    temp_dir = Path(tempfile.mkdtemp(prefix="uv.", suffix=".tmp", dir=str(temp_parent)))
    try:
        _safe_extract_tar(archive_path, temp_dir)
        extracted_command = _find_command(temp_dir, "uvx")
        extracted_root = extracted_command.parent
        if final_dir.exists():
            shutil.rmtree(final_dir)
        shutil.move(str(extracted_root), str(final_dir))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

    command = final_dir / "uvx"
    command.chmod(command.stat().st_mode | 0o111)
    record = {
        "kind": "uv",
        "version": _uv_version_from_url(final_url),
        "source_command": "uvx",
        "command": str(command),
        "bin_dir": str(command.parent),
        "source": archive_url,
    }
    _store_runtime_manifest(root, "uv", record)
    return _runtime_from_manifest(root, "uv", "uvx", env) or {}


def resolve_managed_stdio_runtime(
    command: str,
    env: Dict[str, Any] | None = None,
    *,
    data_dir: str | Path | None = None,
) -> Dict[str, Any]:
    clean_command = str(command or "").strip()
    base_env = {
        str(key): str(value)
        for key, value in (env or {}).items()
        if str(key).strip() and value is not None
    }
    if clean_command not in {"npx", "uvx"}:
        return {"command": clean_command, "managed_env": {}, "managed_runtime": {}}
    if sys.platform != "darwin":
        return {"command": clean_command, "managed_env": {}, "managed_runtime": {}}

    kind = "node" if clean_command == "npx" else "uv"
    root = _runtime_root(data_dir)
    command_name = clean_command
    cached = _runtime_from_manifest(root, kind, command_name, base_env)
    if cached:
        return cached

    with _LOCKS[kind]:
        cached = _runtime_from_manifest(root, kind, command_name, base_env)
        if cached:
            return cached
        if kind == "node":
            return _install_node_runtime(root, base_env)
        return _install_uv_runtime(root, base_env)
