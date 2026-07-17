from __future__ import annotations


class ComputerControlError(RuntimeError):
    """Structured error for the computer-control ("hand") sidecar module.

    Mirrors the ``code`` / ``message`` / ``status`` shape used elsewhere in the
    sidecar (see ``mcp_managed_runtime.McpManagedRuntimeError``) so callers can
    translate it into a stable machine-readable payload without string parsing.
    """

    def __init__(self, code: str, message: str, status: int = 500):
        super().__init__(message)
        self.code = code
        self.status = status

    def to_dict(self) -> dict:
        return {"code": self.code, "message": str(self), "status": self.status}
