#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  build_miso_server.sh [macos|linux|windows] [x86_64|arm64|universal2]

Environment variables:
  MISO_SOURCE_PATH      Path to miso source repo (default: ../miso)
  MISO_PYTHON_BIN       Python 3.12 executable to create build venv
                        (default resolution: python3.12 -> python3 -> python)
  MISO_BUILD_VENV       Build venv path (default: ./.venv-miso-build)
  MISO_TARGET_ARCH      macOS target arch for PyInstaller
  MISO_BUILD_SKIP_INSTALL
                        Set to 1 to skip pip install step
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_OS="${1:-}"
TARGET_ARCH="${2:-${MISO_TARGET_ARCH:-}}"
MIN_PYTHON_MAJOR=3
MIN_PYTHON_MINOR=12

is_python312() {
  local python_bin="$1"
  "$python_bin" - <<'PY' >/dev/null 2>&1
import sys
raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)
PY
}

resolve_python312() {
  local candidate

  if [[ -n "${MISO_PYTHON_BIN:-}" ]]; then
    if is_python312 "${MISO_PYTHON_BIN}"; then
      printf '%s\n' "${MISO_PYTHON_BIN}"
      return 0
    fi
    echo "MISO_PYTHON_BIN must point to Python 3.12.x: ${MISO_PYTHON_BIN}" >&2
    return 1
  fi

  for candidate in python3.12 python3 python; do
    if is_python312 "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "Python 3.12.x is required to build miso-server." >&2
  return 1
}

if [[ -z "$TARGET_OS" ]]; then
  case "$(uname -s)" in
    Darwin) TARGET_OS="macos" ;;
    Linux) TARGET_OS="linux" ;;
    MINGW*|MSYS*|CYGWIN*) TARGET_OS="windows" ;;
    *)
      echo "Unsupported host OS: $(uname -s)"
      usage
      exit 1
      ;;
  esac
fi

if [[ "$TARGET_OS" != "macos" && "$TARGET_OS" != "linux" && "$TARGET_OS" != "windows" ]]; then
  echo "Unsupported target: $TARGET_OS"
  usage
  exit 1
fi

if [[ -n "$TARGET_ARCH" ]]; then
  if [[ "$TARGET_OS" != "macos" ]]; then
    echo "TARGET_ARCH is only supported for macos builds. Current target: $TARGET_OS"
    usage
    exit 1
  fi
  if [[ "$TARGET_ARCH" != "x86_64" && "$TARGET_ARCH" != "arm64" && "$TARGET_ARCH" != "universal2" ]]; then
    echo "Unsupported macOS target arch: $TARGET_ARCH"
    usage
    exit 1
  fi
fi

MISO_SOURCE_PATH="${MISO_SOURCE_PATH:-"$ROOT_DIR/../miso"}"
if [[ ! -f "$MISO_SOURCE_PATH/miso/__init__.py" || ! -f "$MISO_SOURCE_PATH/miso/broth.py" ]]; then
  echo "Invalid MISO source path: $MISO_SOURCE_PATH"
  echo "Expected files: miso/__init__.py and miso/broth.py"
  exit 1
fi

CAPABILITY_JSON="$MISO_SOURCE_PATH/miso/model_capabilities.json"
DEFAULT_PAYLOADS_JSON="$MISO_SOURCE_PATH/miso/model_default_payloads.json"
if [[ ! -f "$CAPABILITY_JSON" || ! -f "$DEFAULT_PAYLOADS_JSON" ]]; then
  echo "Missing required MISO model metadata files in source path: $MISO_SOURCE_PATH"
  echo "Expected files:"
  echo "  $CAPABILITY_JSON"
  echo "  $DEFAULT_PAYLOADS_JSON"
  exit 1
fi

PYTHON_BIN="$(resolve_python312)"
VENV_DIR="${MISO_BUILD_VENV:-"$ROOT_DIR/.venv-miso-build"}"
if [[ -x "$VENV_DIR/bin/python" ]]; then
  VENV_PY="$VENV_DIR/bin/python"
  VENV_PIP="$VENV_DIR/bin/pip"
elif [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then
  VENV_PY="$VENV_DIR/Scripts/python.exe"
  VENV_PIP="$VENV_DIR/Scripts/pip.exe"
else
  VENV_PY=""
  VENV_PIP=""
fi

if [[ -n "$VENV_PY" ]] && ! is_python312 "$VENV_PY"; then
  echo "Existing build venv does not use Python 3.12.x. Rebuilding: $VENV_DIR"
  rm -rf "$VENV_DIR"
  VENV_PY=""
  VENV_PIP=""
fi

if [[ -z "$VENV_PY" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"

  if [[ -x "$VENV_DIR/bin/python" ]]; then
    VENV_PY="$VENV_DIR/bin/python"
    VENV_PIP="$VENV_DIR/bin/pip"
  elif [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then
    VENV_PY="$VENV_DIR/Scripts/python.exe"
    VENV_PIP="$VENV_DIR/Scripts/pip.exe"
  else
    echo "Build venv is missing python executable: $VENV_DIR"
    exit 1
  fi
fi

if [[ "${MISO_BUILD_SKIP_INSTALL:-0}" != "1" ]]; then
  "$VENV_PIP" install \
    -r "$ROOT_DIR/miso_runtime/server/requirements.txt" \
    -r "$MISO_SOURCE_PATH/requirements.txt" \
    pyinstaller
fi

# Validate the resolved Python runtime early to avoid confusing startup failures.
"$VENV_PY" - <<PY
import sys

major, minor = sys.version_info[:2]
if (major, minor) != (${MIN_PYTHON_MAJOR}, ${MIN_PYTHON_MINOR}):
    print(
        f"Unsupported Python version: {sys.version.split()[0]} "
        f"(required: ${MIN_PYTHON_MAJOR}.${MIN_PYTHON_MINOR}.x)"
    )
    raise SystemExit(1)

print(f"Using Python: {sys.version.split()[0]} ({sys.executable})")
PY

if ! "$VENV_PY" - <<'PY'
import importlib.util
required_modules = ["flask", "openai", "anthropic", "PyInstaller", "qdrant_client"]
missing = [name for name in required_modules if importlib.util.find_spec(name) is None]
if missing:
    print("Missing required Python modules in build environment:", ", ".join(missing))
    raise SystemExit(1)
PY
then
  echo ""
  echo "Dependency check failed."
  if [[ "${MISO_BUILD_SKIP_INSTALL:-0}" == "1" ]]; then
    echo "MISO_BUILD_SKIP_INSTALL=1 is set, but required modules are missing."
    echo "Either unset MISO_BUILD_SKIP_INSTALL or install dependencies into: $VENV_DIR"
  else
    echo "Please ensure pip install completed successfully in: $VENV_DIR"
  fi
  exit 1
fi

DIST_DIR="$ROOT_DIR/miso_runtime/dist/$TARGET_OS"
BUILD_DIR="$ROOT_DIR/miso_runtime/build/pyinstaller-$TARGET_OS"
SPEC_DIR="$ROOT_DIR/miso_runtime/build/spec-$TARGET_OS"

mkdir -p "$DIST_DIR" "$BUILD_DIR" "$SPEC_DIR"
rm -f "$DIST_DIR/miso-server" "$DIST_DIR/miso-server.exe"

ENTRYPOINT="$ROOT_DIR/miso_runtime/server/main.py"

if [[ "$TARGET_OS" == "windows" ]]; then
  PYTHONPATH_SEP=";"
  PYI_DATA_SEP=";"
else
  PYTHONPATH_SEP=":"
  PYI_DATA_SEP=":"
fi

export MISO_SOURCE_PATH
export PYTHONPATH="$MISO_SOURCE_PATH${PYTHONPATH:+$PYTHONPATH_SEP$PYTHONPATH}"

PYINSTALLER_ARGS=(
  --clean
  --noconfirm
  --onefile
  --name miso-server
  --distpath "$DIST_DIR"
  --workpath "$BUILD_DIR"
  --specpath "$SPEC_DIR"
  --collect-submodules miso
  --collect-submodules openai
  --collect-submodules anthropic
  --collect-data miso
  --add-data "${CAPABILITY_JSON}${PYI_DATA_SEP}miso"
  --add-data "${DEFAULT_PAYLOADS_JSON}${PYI_DATA_SEP}miso"
  --hidden-import miso
  --hidden-import miso.broth
  --hidden-import miso.tool
  --hidden-import miso.response_format
  --hidden-import miso.media
  --hidden-import miso.mcp
  --hidden-import miso.memory
  --hidden-import miso.memory_qdrant
  --hidden-import openai
  --hidden-import anthropic
  --collect-submodules qdrant_client
  --hidden-import qdrant_client
  --hidden-import qdrant_client.http
  --hidden-import qdrant_client.http.models
  --hidden-import qdrant_client.local
  --hidden-import qdrant_client.local.local_collection
)

if [[ -n "$TARGET_ARCH" ]]; then
  PYINSTALLER_ARGS+=(--target-arch "$TARGET_ARCH")
fi

"$VENV_PY" -m PyInstaller "${PYINSTALLER_ARGS[@]}" "$ENTRYPOINT"

if [[ "$TARGET_OS" != "windows" && -f "$DIST_DIR/miso-server" ]]; then
  chmod +x "$DIST_DIR/miso-server"
fi

echo "Built Miso server:"
if [[ "$TARGET_OS" == "windows" ]]; then
  echo "  $DIST_DIR/miso-server.exe"
else
  echo "  $DIST_DIR/miso-server"
fi
