#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  build_unchain_server.sh [macos|linux|windows] [x86_64|arm64|universal2]

Environment variables:
  UNCHAIN_SOURCE_PATH      Path to unchain source repo (default: ../unchain)
  UNCHAIN_PYTHON_BIN       Python 3.12 executable to create build venv
                        (default resolution: python3.12 -> python3 -> python)
  UNCHAIN_BUILD_VENV       Build venv path (default: ./.venv-unchain-build)
  UNCHAIN_TARGET_ARCH      macOS target arch for PyInstaller
  UNCHAIN_BUILD_SKIP_INSTALL
                        Set to 1 to skip pip install step
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_OS="${1:-}"
TARGET_ARCH="${2:-${UNCHAIN_TARGET_ARCH:-}}"
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

  if [[ -n "${UNCHAIN_PYTHON_BIN:-}" ]]; then
    if is_python312 "${UNCHAIN_PYTHON_BIN}"; then
      printf '%s\n' "${UNCHAIN_PYTHON_BIN}"
      return 0
    fi
    echo "UNCHAIN_PYTHON_BIN must point to Python 3.12.x: ${UNCHAIN_PYTHON_BIN}" >&2
    return 1
  fi

  for candidate in python3.12 python3 python; do
    if is_python312 "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  echo "Python 3.12.x is required to build unchain-server." >&2
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

UNCHAIN_SOURCE_PATH="${UNCHAIN_SOURCE_PATH:-"$ROOT_DIR/../unchain"}"
if [[ ! -f "$UNCHAIN_SOURCE_PATH/src/unchain/__init__.py" || ! -f "$UNCHAIN_SOURCE_PATH/src/unchain/__init__.py" ]]; then
  echo "Invalid unchain source path: $UNCHAIN_SOURCE_PATH"
  echo "Expected files: src/unchain/__init__.py and src/unchain/__init__.py"
  exit 1
fi

CAPABILITY_JSON="$UNCHAIN_SOURCE_PATH/src/unchain/runtime/resources/model_capabilities.json"
DEFAULT_PAYLOADS_JSON="$UNCHAIN_SOURCE_PATH/src/unchain/runtime/resources/model_default_payloads.json"
if [[ ! -f "$CAPABILITY_JSON" || ! -f "$DEFAULT_PAYLOADS_JSON" ]]; then
  echo "Missing required unchain model metadata files in source path: $UNCHAIN_SOURCE_PATH"
  echo "Expected files:"
  echo "  $CAPABILITY_JSON"
  echo "  $DEFAULT_PAYLOADS_JSON"
  exit 1
fi

PYTHON_BIN="$(resolve_python312)"
VENV_DIR="${UNCHAIN_BUILD_VENV:-"$ROOT_DIR/.venv-unchain-build"}"
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

if [[ "${UNCHAIN_BUILD_SKIP_INSTALL:-0}" != "1" ]]; then
  "$VENV_PIP" install \
    -r "$ROOT_DIR/unchain_runtime/server/requirements.txt" \
    -e "$UNCHAIN_SOURCE_PATH" \
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
  if [[ "${UNCHAIN_BUILD_SKIP_INSTALL:-0}" == "1" ]]; then
    echo "UNCHAIN_BUILD_SKIP_INSTALL=1 is set, but required modules are missing."
    echo "Either unset UNCHAIN_BUILD_SKIP_INSTALL or install dependencies into: $VENV_DIR"
  else
    echo "Please ensure pip install completed successfully in: $VENV_DIR"
  fi
  exit 1
fi

DIST_DIR="$ROOT_DIR/unchain_runtime/dist/$TARGET_OS"
BUILD_DIR="$ROOT_DIR/unchain_runtime/build/pyinstaller-$TARGET_OS"
SPEC_DIR="$ROOT_DIR/unchain_runtime/build/spec-$TARGET_OS"

mkdir -p "$DIST_DIR" "$BUILD_DIR" "$SPEC_DIR"
rm -f "$DIST_DIR/unchain-server" "$DIST_DIR/unchain-server.exe"

ENTRYPOINT="$ROOT_DIR/unchain_runtime/server/main.py"

if [[ "$TARGET_OS" == "windows" ]]; then
  PYTHONPATH_SEP=";"
  PYI_DATA_SEP=";"
else
  PYTHONPATH_SEP=":"
  PYI_DATA_SEP=":"
fi

export UNCHAIN_SOURCE_PATH
export PYTHONPATH="$UNCHAIN_SOURCE_PATH/src${PYTHONPATH:+$PYTHONPATH_SEP$PYTHONPATH}"

PYINSTALLER_ARGS=(
  --clean
  --noconfirm
  --onefile
  --name unchain-server
  --distpath "$DIST_DIR"
  --workpath "$BUILD_DIR"
  --specpath "$SPEC_DIR"
  --collect-submodules unchain
  --collect-submodules openai
  --collect-submodules anthropic
  --collect-data unchain
  --add-data "${CAPABILITY_JSON}${PYI_DATA_SEP}unchain/runtime/resources"
  --add-data "${DEFAULT_PAYLOADS_JSON}${PYI_DATA_SEP}unchain/runtime/resources"
  --hidden-import unchain
  --hidden-import unchain.runtime
  --hidden-import unchain.runtime.engine
  --hidden-import unchain.runtime.files
  --hidden-import unchain.runtime.providers
  --hidden-import unchain.tools
  --hidden-import unchain.tools.tool
  --hidden-import unchain.tools.toolkit
  --hidden-import unchain.tools.registry
  --hidden-import unchain.tools.catalog
  --hidden-import unchain.schemas
  --hidden-import unchain.schemas.response
  --hidden-import unchain.input
  --hidden-import unchain.input.media
  --hidden-import unchain.toolkits
  --hidden-import unchain.memory
  --hidden-import unchain.memory.manager
  --hidden-import unchain.memory.qdrant
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

if [[ "$TARGET_OS" != "windows" && -f "$DIST_DIR/unchain-server" ]]; then
  chmod +x "$DIST_DIR/unchain-server"
fi

echo "Built Miso server:"
if [[ "$TARGET_OS" == "windows" ]]; then
  echo "  $DIST_DIR/unchain-server.exe"
else
  echo "  $DIST_DIR/unchain-server"
fi
