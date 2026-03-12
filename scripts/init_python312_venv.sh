#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
REQUIREMENTS_FILE="$ROOT_DIR/miso_runtime/server/requirements.txt"

is_python312() {
  local python_bin="$1"
  "$python_bin" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)
PY
}

resolve_python312() {
  local candidate
  for candidate in python3.12 python3 python; do
    if is_python312 "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "Python 3.12.x is required but was not found." >&2
  echo "Install Python 3.12 and re-run this script." >&2
  return 1
}

echo "Initializing .venv with Python 3.12.x ..."
PYTHON_BIN="$(resolve_python312)"

if [[ -x "$VENV_DIR/bin/python" ]] && ! is_python312 "$VENV_DIR/bin/python"; then
  echo "Existing .venv uses a non-3.12 interpreter. Rebuilding ..."
  rm -rf "$VENV_DIR"
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  rm -rf "$VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/python" -m pip install -r "$REQUIREMENTS_FILE"

echo "Ready: $("$VENV_DIR/bin/python" --version 2>&1)"
echo "Activate with: source .venv/bin/activate"
