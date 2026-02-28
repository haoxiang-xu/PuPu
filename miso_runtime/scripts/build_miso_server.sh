#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  build_miso_server.sh [macos|linux|windows] [x86_64|arm64|universal2]

Environment variables:
  MISO_SOURCE_PATH      Path to miso source repo (default: ../miso)
  MISO_PYTHON_BIN       Python executable to create build venv (default: python3)
  MISO_BUILD_VENV       Build venv path (default: ./.venv-miso-build)
  MISO_TARGET_ARCH      macOS target arch for PyInstaller
  MISO_BUILD_SKIP_INSTALL
                        Set to 1 to skip pip install step
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET_OS="${1:-}"
TARGET_ARCH="${2:-${MISO_TARGET_ARCH:-}}"

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

PYTHON_BIN="${MISO_PYTHON_BIN:-python3}"
VENV_DIR="${MISO_BUILD_VENV:-"$ROOT_DIR/.venv-miso-build"}"
if [[ ! -x "$VENV_DIR/bin/python" && ! -x "$VENV_DIR/Scripts/python.exe" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

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

if [[ "${MISO_BUILD_SKIP_INSTALL:-0}" != "1" ]]; then
  "$VENV_PIP" install \
    -r "$ROOT_DIR/miso_runtime/server/requirements.txt" \
    -r "$MISO_SOURCE_PATH/requirements.txt" \
    pyinstaller
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
  --hidden-import openai
  --hidden-import anthropic
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
