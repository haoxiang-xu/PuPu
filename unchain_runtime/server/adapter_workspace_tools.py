from __future__ import annotations

import importlib
from pathlib import Path
from typing import Any, Callable


class LegacyWorkspaceToolkit:
    def __init__(self, inner: Any, toolkit_cls: type, tool_cls: type):
        self._inner = inner
        self._toolkit = toolkit_cls()
        self._tool_cls = tool_cls
        self.tools = self._toolkit.tools
        self.workspace_root = getattr(inner, "workspace_root", None)
        self.workspace_roots = list(
            getattr(inner, "workspace_roots", [self.workspace_root] if self.workspace_root else [])
        )
        self._register_tools()

    def register(self, tool_obj: Any) -> Any:
        return self._toolkit.register(tool_obj)

    def get(self, function_name: str) -> Any:
        return self._toolkit.get(function_name)

    def execute(self, function_name: str, arguments: dict[str, Any] | str | None) -> dict[str, Any]:
        return self._toolkit.execute(function_name, arguments)

    def shutdown(self) -> None:
        shutdown = getattr(self._inner, "shutdown", None)
        if callable(shutdown):
            shutdown()

    def push_execution_context(self, context: Any) -> None:
        push = getattr(self._inner, "push_execution_context", None)
        if callable(push):
            push(context)

    def pop_execution_context(self) -> None:
        pop = getattr(self._inner, "pop_execution_context", None)
        if callable(pop):
            pop()

    @property
    def current_execution_context(self) -> Any:
        return getattr(self._inner, "current_execution_context", None)

    def _register_tools(self) -> None:
        self.register(
            self._tool_cls.from_callable(
                self.read_files,
                name="read_files",
                description="Read one or more files from the workspace.",
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.read_file,
                name="read_file",
                description="Read a single file from the workspace.",
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.read_lines,
                name="read_lines",
                description="Read a line range from a file in the workspace.",
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.search_text,
                name="search_text",
                description="Search text across files in the workspace.",
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.list_directories,
                name="list_directories",
                description="List files and directories under a workspace path.",
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.file_exists,
                name="file_exists",
                description="Check whether a file exists in the workspace.",
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.write_file,
                name="write_file",
                description="Create or overwrite a file in the workspace.",
                requires_confirmation=True,
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.delete_file,
                name="delete_file",
                description="Delete a file in the workspace.",
                requires_confirmation=True,
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.move_file,
                name="move_file",
                description="Move or rename a file in the workspace.",
                requires_confirmation=True,
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.terminal_exec,
                name="terminal_exec",
                description="Execute a shell command inside the workspace.",
                requires_confirmation=True,
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.pin_file_context,
                name="pin_file_context",
                description="Pin file context for the current session.",
            )
        )
        self.register(
            self._tool_cls.from_callable(
                self.unpin_file_context,
                name="unpin_file_context",
                description="Remove pinned file context for the current session.",
            )
        )

    def _resolve_path(self, path: str) -> Path:
        resolver = getattr(self._inner, "_resolve_workspace_path", None)
        if callable(resolver):
            return resolver(path)
        return Path(path).expanduser().resolve()

    def read_file(
        self,
        path: str,
        offset: int = 0,
        limit: int = 2000,
        max_chars: int = 30000,
        ast_mode: str = "auto",
    ) -> dict[str, Any]:
        return self._inner.read(
            path=path,
            offset=offset,
            limit=limit,
            max_chars=max_chars,
            ast_mode=ast_mode,
        )

    def read_files(
        self,
        paths: list[str] | None = None,
        path: str | None = None,
        offset: int = 0,
        limit: int = 2000,
        max_chars: int = 30000,
        ast_mode: str = "auto",
    ) -> dict[str, Any]:
        requested_paths = list(paths or [])
        if path:
            requested_paths.append(path)
        if not requested_paths:
            return {"items": [], "count": 0}

        items = [
            self.read_file(
                path=item_path,
                offset=offset,
                limit=limit,
                max_chars=max_chars,
                ast_mode=ast_mode,
            )
            for item_path in requested_paths
        ]
        return {"items": items, "count": len(items)}

    def read_lines(
        self,
        path: str,
        start: int = 1,
        end: int | None = None,
        max_chars: int = 30000,
    ) -> dict[str, Any]:
        safe_start = max(1, int(start or 1))
        safe_end = max(safe_start, int(end or safe_start))
        return self._inner.read(
            path=path,
            offset=safe_start - 1,
            limit=(safe_end - safe_start) + 1,
            max_chars=max_chars,
            ast_mode="never",
        )

    def search_text(
        self,
        query: str,
        path: str = ".",
        file_glob: str | None = None,
        max_results: int = 50,
        offset: int = 0,
        case_sensitive: bool = False,
    ) -> dict[str, Any]:
        return self._inner.grep(
            pattern=query,
            path=path,
            file_glob=file_glob,
            max_results=max_results,
            offset=offset,
            case_sensitive=case_sensitive,
        )

    def list_directories(
        self,
        path: str = ".",
        include_files: bool = True,
        max_results: int = 200,
    ) -> dict[str, Any]:
        target = self._resolve_path(path)
        if not target.exists():
            return {"error": f"path not found: {path}"}
        if not target.is_dir():
            return {"error": f"not a directory: {path}"}

        items: list[dict[str, Any]] = []
        for child in sorted(target.iterdir(), key=lambda item: item.name):
            if child.is_dir() or include_files:
                relative = child
                for root in self.workspace_roots:
                    try:
                        relative = child.relative_to(root)
                        break
                    except Exception:
                        continue
                items.append(
                    {
                        "path": str(relative),
                        "name": child.name,
                        "type": "directory" if child.is_dir() else "file",
                    }
                )
            if len(items) >= max_results:
                break

        return {
            "path": path,
            "items": items,
            "truncated": len(items) >= max_results,
        }

    def file_exists(self, path: str) -> dict[str, Any]:
        try:
            resolved = self._resolve_path(path)
        except Exception as exc:
            return {"error": str(exc), "path": path}
        return {"path": path, "exists": resolved.exists(), "is_file": resolved.is_file()}

    def write_file(
        self,
        path: str,
        content: str,
        overwrite: bool = True,
    ) -> dict[str, Any]:
        return self._inner.write(path=path, content=content, overwrite=overwrite)

    def delete_file(self, path: str, missing_ok: bool = False) -> dict[str, Any]:
        try:
            target = self._resolve_path(path)
        except Exception as exc:
            return {"error": str(exc), "path": path}
        if not target.exists():
            if missing_ok:
                return {"path": path, "deleted": False, "missing": True}
            return {"error": f"file not found: {path}"}
        if not target.is_file():
            return {"error": f"not a file: {path}"}
        target.unlink()
        return {"path": path, "deleted": True}

    def move_file(
        self,
        source_path: str,
        destination_path: str,
        overwrite: bool = False,
    ) -> dict[str, Any]:
        try:
            source = self._resolve_path(source_path)
            destination = self._resolve_path(destination_path)
        except Exception as exc:
            return {"error": str(exc)}
        if not source.exists():
            return {"error": f"file not found: {source_path}"}
        if destination.exists() and not overwrite:
            return {"error": f"destination already exists: {destination_path}"}
        destination.parent.mkdir(parents=True, exist_ok=True)
        source.rename(destination)
        return {
            "source_path": source_path,
            "destination_path": destination_path,
            "moved": True,
        }

    def terminal_exec(
        self,
        command: str,
        cwd: str = ".",
        timeout_seconds: int = 30,
        max_output_chars: int = 20000,
    ) -> dict[str, Any]:
        return self._inner.bash(
            command=command,
            cwd=cwd,
            timeout_seconds=timeout_seconds,
            max_output_chars=max_output_chars,
        )

    def pin_file_context(
        self,
        path: str,
        start: int | None = None,
        end: int | None = None,
        reason: str | None = None,
        start_with: str | None = None,
        end_with: str | None = None,
    ) -> dict[str, Any]:
        context = self.current_execution_context
        if context is None:
            return {"error": "workspace pin context unavailable"}

        try:
            pins_module = importlib.import_module("unchain.workspace.pins")
        except Exception as exc:
            return {"error": f"workspace pin helpers unavailable: {exc}"}

        try:
            target = self._resolve_path(path)
        except Exception as exc:
            return {"error": str(exc), "path": path}
        if not target.exists() or not target.is_file():
            return {"error": f"file not found: {path}"}

        content = target.read_text(encoding="utf-8", errors="replace")
        if start is None and end is None and len(content) > pins_module.MAX_FULL_FILE_PIN_CHARS:
            return {
                "error": "file too large for full-file pin",
                "path": path,
                "max_chars": pins_module.MAX_FULL_FILE_PIN_CHARS,
            }

        state, pins = pins_module.load_workspace_pins(context.session_store, context.session_id)
        if len(pins) >= pins_module.MAX_SESSION_PIN_COUNT:
            return {
                "error": "too many pinned file contexts",
                "max_count": pins_module.MAX_SESSION_PIN_COUNT,
            }

        candidate = pins_module.build_pin_record(
            path=target,
            lines=content.splitlines(keepends=True),
            start=start,
            end=end,
            reason=reason,
            start_with=start_with,
            end_with=end_with,
        )
        duplicate = pins_module.find_duplicate_pin(pins, candidate)
        if duplicate is not None:
            return {"pin_id": duplicate["pin_id"], "duplicate": True, "pin": duplicate}

        pins.append(candidate)
        pins_module.save_workspace_pins(context.session_store, context.session_id, state, pins)
        return {"pin_id": candidate["pin_id"], "duplicate": False, "pin": candidate}

    def unpin_file_context(
        self,
        pin_id: str | None = None,
        path: str | None = None,
        start: int | None = None,
        end: int | None = None,
        all: bool = False,
    ) -> dict[str, Any]:
        context = self.current_execution_context
        if context is None:
            return {"error": "workspace pin context unavailable"}

        try:
            pins_module = importlib.import_module("unchain.workspace.pins")
        except Exception as exc:
            return {"error": f"workspace pin helpers unavailable: {exc}"}

        state, pins = pins_module.load_workspace_pins(context.session_store, context.session_id)
        remaining, removed_pin_ids = pins_module.remove_pins(
            pins,
            pin_id=pin_id,
            path=path,
            start=start,
            end=end,
            remove_all=all,
        )
        pins_module.save_workspace_pins(context.session_store, context.session_id, state, remaining)
        return {
            "removed_pin_ids": removed_pin_ids,
            "removed": len(removed_pin_ids),
            "remaining": len(remaining),
        }


def build_legacy_workspace_toolkit_factory(toolkit_module: Any) -> Callable[..., Any] | None:
    dev_factory = getattr(toolkit_module, "DevToolkit", None)
    if not callable(dev_factory):
        try:
            builtin_module = importlib.import_module("unchain.toolkits.builtin")
        except Exception:
            builtin_module = None
        if builtin_module is not None:
            dev_factory = getattr(builtin_module, "DevToolkit", None)

    if not callable(dev_factory):
        return None

    tools_module = importlib.import_module("unchain.tools")
    toolkit_cls = getattr(tools_module, "Toolkit", None)
    tool_cls = getattr(tools_module, "Tool", None)
    if not callable(toolkit_cls) or not callable(tool_cls):
        return None

    def _factory(
        workspace_root: str | None = None,
        workspace_roots: list[str] | None = None,
    ) -> LegacyWorkspaceToolkit:
        kwargs: dict[str, Any] = {}
        if workspace_roots:
            kwargs["workspace_roots"] = workspace_roots
        elif workspace_root:
            kwargs["workspace_root"] = workspace_root
        inner = dev_factory(**kwargs)
        return LegacyWorkspaceToolkit(inner, toolkit_cls=toolkit_cls, tool_cls=tool_cls)

    return _factory
