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

from net_tls import annotate_tls_error, get_outbound_ssl_context


class McpManagedRuntimeError(RuntimeError):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.status = status


RUNTIME_ROOT_NAME = "mcp_runtime"
BUNDLED_RUNTIME_DIR_ENV = "PUPU_MCP_RUNTIME_DIR"
BUNDLED_RUNTIME_MANIFEST = "manifest.json"
NODE_INDEX_URL = "https://nodejs.org/dist/index.json"
NODE_DIST_BASE_URL = "https://nodejs.org/dist"
UV_LATEST_BASE_URL = "https://github.com/astral-sh/uv/releases/latest/download"

_NETWORK_ENV_KEYS = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "all_proxy",
)
_CUSTOM_CA_ENV_KEYS = (
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
    "PIP_CERT",
)

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
        with urllib.request.urlopen(
            request,
            timeout=timeout,
            context=get_outbound_ssl_context(),
        ) as response:
            return response.read().decode("utf-8")
    except Exception as exc:
        raise McpManagedRuntimeError(
            "mcp_runtime_install_failed",
            annotate_tls_error(
                f"Unable to fetch managed MCP runtime metadata from {url}: {exc}",
                exc,
            ),
        ) from exc


def _download_file(url: str, path: Path, timeout: int = 300) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "PuPu-MCP-Runtime"},
    )
    try:
        with urllib.request.urlopen(
            request,
            timeout=timeout,
            context=get_outbound_ssl_context(),
        ) as response:
            final_url = str(response.geturl() or url)
            with path.open("wb") as handle:
                shutil.copyfileobj(response, handle)
            return final_url
    except Exception as exc:
        raise McpManagedRuntimeError(
            "mcp_runtime_install_failed",
            annotate_tls_error(
                f"Unable to download managed MCP runtime from {url}: {exc}",
                exc,
            ),
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
                if member.issym():
                    # Tar symlinks resolve from the member's parent directory.
                    link_destination = (
                        destination.parent / member.linkname
                    ).resolve()
                elif member.islnk():
                    # Tar hardlinks resolve from the archive extraction root.
                    link_destination = (target_dir / member.linkname).resolve()
                else:
                    continue
                if (
                    link_destination != root
                    and not link_destination.is_relative_to(root)
                ):
                    raise McpManagedRuntimeError(
                        "mcp_runtime_install_failed",
                        f"Archive contains unsafe link: {member.name}",
                    )
            archive.extractall(target_dir, members=members, filter="data")
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


def _platform_target() -> str:
    machine = platform.machine().lower()
    if machine in {"arm64", "aarch64"}:
        arch = "arm64"
    elif machine in {"x86_64", "amd64", "x64"}:
        arch = "x64"
    else:
        raise McpManagedRuntimeError(
            "mcp_runtime_unsupported_platform",
            f"PuPu-managed MCP runtime does not support architecture: {machine}",
            400,
        )

    platform_name = {
        "darwin": "darwin",
        "win32": "win32",
        "linux": "linux",
    }.get(sys.platform)
    if not platform_name:
        raise McpManagedRuntimeError(
            "mcp_runtime_unsupported_platform",
            f"PuPu-managed MCP runtime does not support platform: {sys.platform}",
            400,
        )
    if platform_name in {"win32", "linux"} and arch == "arm64":
        raise McpManagedRuntimeError(
            "mcp_runtime_unsupported_platform",
            f"PuPu-managed MCP runtime does not support target: {platform_name}-{arch}",
            400,
        )
    return f"{platform_name}-{arch}"


def _path_env(bin_dir: Path, env: Dict[str, str]) -> str:
    current = env.get("PATH") or os.environ.get("PATH", "")
    return str(bin_dir) if not current else str(bin_dir) + os.pathsep + current


def _node_env(
    root: Path,
    bin_dir: Path,
    env: Dict[str, str],
    *,
    runtime_identity: str = "",
) -> Dict[str, str]:
    cache_dir = root / "cache" / "npm"
    clean_identity = str(runtime_identity or "").strip()
    if clean_identity:
        cache_scope = hashlib.sha256(
            clean_identity.encode("utf-8")
        ).hexdigest()[:12]
        cache_dir = cache_dir / cache_scope
    return {
        "PATH": _path_env(bin_dir, env),
        "NPM_CONFIG_CACHE": str(cache_dir),
        "npm_config_cache": str(cache_dir),
        # Pinned PuPu Node releases must support these switches. They preserve
        # Node's public roots while also accepting administrator-installed
        # enterprise roots and standard proxy environment variables.
        "NODE_USE_SYSTEM_CA": "1",
        "NODE_USE_ENV_PROXY": "1",
    }


def _uv_env(
    root: Path,
    bin_dir: Path,
    env: Dict[str, str],
    *,
    python_command: Path | None = None,
    python_bootstrap: Path | None = None,
    python_identity: str = "",
) -> Dict[str, str]:
    tool_scope = "default"
    if python_command is not None:
        tool_scope = hashlib.sha256(
            (
                f"{python_command.resolve()}\0{str(python_identity or '').strip()}"
            ).encode("utf-8")
        ).hexdigest()[:12]
    tool_dir = root / "tools" / tool_scope
    managed_env = {
        "PATH": _path_env(bin_dir, env),
        "UV_CACHE_DIR": str(root / "cache" / "uv"),
        "UV_TOOL_DIR": str(tool_dir),
        "UV_TOOL_BIN_DIR": str(tool_dir / "bin"),
        "UV_PYTHON_INSTALL_DIR": str(root / "python"),
        "UV_NO_MODIFY_PATH": "1",
        "UV_NO_PROGRESS": "1",
        "UV_SYSTEM_CERTS": "true",
    }
    if python_command is not None:
        managed_env.update(
            {
                "UV_PYTHON": str(python_command),
                # A packaged PuPu must never bootstrap a second Python from the
                # network after installation.
                "UV_PYTHON_DOWNLOADS": "never",
            }
        )
    if python_bootstrap is not None:
        managed_env.update(
            {
                # sitecustomize installs native trust for the Python MCP server
                # itself; UV_SYSTEM_CERTS only covers uv's package downloads.
                "PYTHONPATH": str(python_bootstrap),
                # The bundled interpreter lives inside the signed application.
                # Never let imports create or update __pycache__ there.
                "PYTHONDONTWRITEBYTECODE": "1",
                "PYTHONNOUSERSITE": "1",
                "PYTHONUTF8": "1",
            }
        )
    return managed_env


def _ephemeral_network_env(
    env: Dict[str, str],
    *,
    kind: str,
) -> Dict[str, str]:
    """Return network overrides without making them persistent MCP metadata.

    Proxy URLs may contain credentials and certificate paths can expose account
    names. They are therefore rebuilt for every install/connect operation and
    never included in ``managed_env``, which is stored on disk.
    """
    result: Dict[str, str] = {}
    for key in (*_NETWORK_ENV_KEYS, *_CUSTOM_CA_ENV_KEYS):
        raw = env.get(key)
        if raw is None:
            raw = os.environ.get(key)
        value = str(raw or "").strip()
        if value:
            result[key] = value
    if kind == "node" and "NODE_EXTRA_CA_CERTS" not in result:
        cafile = result.get("SSL_CERT_FILE", "")
        if cafile:
            result["NODE_EXTRA_CA_CERTS"] = cafile
    if kind == "uv":
        cafile = result.get("SSL_CERT_FILE", "")
        if cafile:
            result.setdefault("REQUESTS_CA_BUNDLE", cafile)
            result.setdefault("CURL_CA_BUNDLE", cafile)
            result.setdefault("PIP_CERT", cafile)
    return result


def _bundled_runtime_root() -> Path | None:
    raw = str(os.environ.get(BUNDLED_RUNTIME_DIR_ENV, "") or "").strip()
    return Path(raw) if raw else None


def _bundled_path(root: Path, raw: Any, label: str) -> Path:
    text = str(raw or "").strip()
    candidate = Path(text)
    if not text or candidate.is_absolute():
        raise McpManagedRuntimeError(
            "mcp_runtime_bundle_invalid",
            f"Bundled MCP runtime has invalid {label}",
            500,
        )
    resolved_root = root.resolve()
    resolved = (root / candidate).resolve()
    if resolved != resolved_root and not resolved.is_relative_to(resolved_root):
        raise McpManagedRuntimeError(
            "mcp_runtime_bundle_invalid",
            f"Bundled MCP runtime {label} escapes its resource directory",
            500,
        )
    if not resolved.exists():
        raise McpManagedRuntimeError(
            "mcp_runtime_bundle_missing",
            f"PuPu installation is missing bundled MCP runtime {label}: {text}",
            500,
        )
    return resolved


def _bundled_runtime_record(root: Path, kind: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    manifest_path = root / BUNDLED_RUNTIME_MANIFEST
    manifest = _read_json_file(manifest_path)
    if not manifest:
        raise McpManagedRuntimeError(
            "mcp_runtime_bundle_missing",
            "PuPu installation is missing the bundled MCP runtime manifest; reinstall or update PuPu",
            500,
        )
    if manifest.get("schema_version") != 1:
        raise McpManagedRuntimeError(
            "mcp_runtime_bundle_invalid",
            "Bundled MCP runtime manifest uses an unsupported schema; reinstall or update PuPu",
            500,
        )
    expected_target = _platform_target()
    actual_target = str(manifest.get("target") or "").strip()
    if actual_target != expected_target:
        raise McpManagedRuntimeError(
            "mcp_runtime_bundle_invalid",
            f"Bundled MCP runtime target mismatch: expected {expected_target}, got {actual_target or 'unknown'}",
            500,
        )
    runtimes = manifest.get("runtimes")
    runtimes = runtimes if isinstance(runtimes, dict) else {}
    record = runtimes.get(kind)
    if not isinstance(record, dict):
        raise McpManagedRuntimeError(
            "mcp_runtime_bundle_missing",
            f"PuPu installation does not contain the bundled {kind} MCP runtime",
            500,
        )
    return manifest, record


def _resolve_bundled_runtime(
    root: Path,
    kind: str,
    source_command: str,
    data_root: Path,
    env: Dict[str, str],
) -> Dict[str, Any]:
    manifest, record = _bundled_runtime_record(root, kind)
    command = _bundled_path(root, record.get("command"), f"{kind} command")
    bin_dir = _bundled_path(
        root,
        record.get("bin_dir") or Path(str(record.get("command") or "")).parent,
        f"{kind} bin directory",
    )
    raw_prefix = record.get("args_prefix")
    raw_prefix = raw_prefix if isinstance(raw_prefix, list) else []
    args_prefix = []
    for index, raw_arg in enumerate(raw_prefix):
        text = str(raw_arg or "")
        if text.startswith("-"):
            args_prefix.append(text)
            continue
        args_prefix.append(
            str(_bundled_path(root, text, f"{kind} args_prefix[{index}]"))
        )

    python_command = None
    python_bootstrap = None
    python_identity = ""
    if kind == "uv":
        runtimes = manifest.get("runtimes")
        python_record = (
            runtimes.get("python")
            if isinstance(runtimes, dict)
            else None
        )
        if not isinstance(python_record, dict):
            raise McpManagedRuntimeError(
                "mcp_runtime_bundle_missing",
                "PuPu installation is missing bundled Python required by uv MCP toolkits",
                500,
            )
        python_command = _bundled_path(
            root,
            python_record.get("command"),
            "python command",
        )
        python_bootstrap = _bundled_path(
            root,
            python_record.get("bootstrap_dir"),
            "python bootstrap directory",
        )
        python_identity = ":".join(
            value
            for value in (
                str(python_record.get("version") or "").strip(),
                str(
                    python_record.get("staged_tree_sha256")
                    or python_record.get("tree_sha256")
                    or ""
                ).strip(),
            )
            if value
        )

    runtime_identity = ":".join(
        value
        for value in (
            str(manifest.get("target") or "").strip(),
            str(record.get("version") or "").strip(),
            str(
                record.get("staged_tree_sha256")
                or record.get("tree_sha256")
                or ""
            ).strip(),
        )
        if value
    )
    managed_env = (
        _node_env(
            data_root,
            bin_dir,
            env,
            runtime_identity=runtime_identity,
        )
        if kind == "node"
        else _uv_env(
            data_root,
            bin_dir,
            env,
            python_command=python_command,
            python_bootstrap=python_bootstrap,
            python_identity=python_identity,
        )
    )
    return {
        "command": str(command),
        "args_prefix": args_prefix,
        "managed_env": managed_env,
        "ephemeral_env": _ephemeral_network_env(env, kind=kind),
        "managed_runtime": {
            "kind": kind,
            "version": str(record.get("version") or ""),
            "source": "bundled",
            "source_command": source_command,
            "target": str(manifest.get("target") or ""),
        },
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
        "args_prefix": [],
        "managed_env": managed_env,
        "ephemeral_env": _ephemeral_network_env(env, kind=kind),
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
        return {
            "command": clean_command,
            "args_prefix": [],
            "managed_env": {},
            "ephemeral_env": {},
            "managed_runtime": {},
        }

    kind = "node" if clean_command == "npx" else "uv"
    root = _runtime_root(data_dir)
    bundled_root = _bundled_runtime_root()
    if bundled_root is not None:
        return _resolve_bundled_runtime(
            bundled_root,
            kind,
            clean_command,
            root,
            base_env,
        )

    if sys.platform != "darwin":
        return {
            "command": clean_command,
            "args_prefix": [],
            "managed_env": {},
            "ephemeral_env": _ephemeral_network_env(base_env, kind=kind),
            "managed_runtime": {},
        }

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
