import os
import sys
from pathlib import Path
from typing import Dict, Iterable, List

RUNTIME_ROOT = Path(__file__).resolve().parents[1]
if str(RUNTIME_ROOT) not in sys.path:
    sys.path.insert(0, str(RUNTIME_ROOT))

_ENGINE_IMPORT_ERROR = None
MisoEngine = None

try:
    from miso.engine import MisoEngine  # type: ignore
except Exception as import_error:  # pragma: no cover
    _ENGINE_IMPORT_ERROR = import_error

_ENGINE = MisoEngine(os.environ.get("MISO_MODEL", "miso-local-dev")) if MisoEngine else None


def get_model_name() -> str:
    if _ENGINE is None:
        return "miso-unavailable"
    return _ENGINE.model_name


def stream_chat(
    *,
    message: str,
    history: List[Dict[str, str]],
    options: Dict[str, float],
) -> Iterable[str]:
    if _ENGINE_IMPORT_ERROR is not None:
        raise RuntimeError(f"Failed to import local Miso runtime: {_ENGINE_IMPORT_ERROR}")
    if _ENGINE is None:
        raise RuntimeError("Miso engine is not initialized")
    return _ENGINE.stream_reply(message=message, history=history, options=options)
