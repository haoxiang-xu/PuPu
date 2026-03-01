<#
.SYNOPSIS
  Build the miso-server binary for Windows using PyInstaller.

.DESCRIPTION
  PowerShell equivalent of build_miso_server.sh for Windows.

.PARAMETER TargetOS
  Target OS (default: windows). Only "windows" is supported on this script.

.EXAMPLE
  .\miso_runtime\scripts\build_miso_server.ps1
  .\miso_runtime\scripts\build_miso_server.ps1 windows
#>

param(
  [string]$TargetOS = "windows"
)

$ErrorActionPreference = "Stop"

if ($TargetOS -ne "windows") {
  Write-Error "This PowerShell script only supports the 'windows' target. Got: $TargetOS"
  exit 1
}

$MIN_PYTHON_MAJOR = 3
$MIN_PYTHON_MINOR = 10

# Resolve root directory (two levels up from this script)
$ROOT_DIR = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

# Miso source path
$MISO_SOURCE_PATH = if ($env:MISO_SOURCE_PATH) { $env:MISO_SOURCE_PATH } else { Join-Path $ROOT_DIR "..\miso" }
$MISO_SOURCE_PATH = [System.IO.Path]::GetFullPath($MISO_SOURCE_PATH)

if (-not (Test-Path (Join-Path $MISO_SOURCE_PATH "miso\__init__.py")) -or
    -not (Test-Path (Join-Path $MISO_SOURCE_PATH "miso\broth.py"))) {
  Write-Error "Invalid MISO source path: $MISO_SOURCE_PATH`nExpected files: miso\__init__.py and miso\broth.py"
  exit 1
}

$CAPABILITY_JSON = Join-Path $MISO_SOURCE_PATH "miso\model_capabilities.json"
$DEFAULT_PAYLOADS_JSON = Join-Path $MISO_SOURCE_PATH "miso\model_default_payloads.json"

if (-not (Test-Path $CAPABILITY_JSON) -or -not (Test-Path $DEFAULT_PAYLOADS_JSON)) {
  Write-Error "Missing required MISO model metadata files in source path: $MISO_SOURCE_PATH`nExpected:`n  $CAPABILITY_JSON`n  $DEFAULT_PAYLOADS_JSON"
  exit 1
}

# Python / venv setup
$PYTHON_BIN = if ($env:MISO_PYTHON_BIN) { $env:MISO_PYTHON_BIN } else { "python" }
$VENV_DIR = if ($env:MISO_BUILD_VENV) { $env:MISO_BUILD_VENV } else { Join-Path $ROOT_DIR ".venv-miso-build" }

$VENV_PY = Join-Path $VENV_DIR "Scripts\python.exe"
$VENV_PIP = Join-Path $VENV_DIR "Scripts\pip.exe"

if (-not (Test-Path $VENV_PY)) {
  Write-Host "Creating build venv at $VENV_DIR ..."
  & $PYTHON_BIN -m venv $VENV_DIR
  if ($LASTEXITCODE -ne 0) { Write-Error "Failed to create venv"; exit 1 }
}

if (-not (Test-Path $VENV_PY)) {
  Write-Error "Build venv is missing python executable: $VENV_DIR"
  exit 1
}

# Install dependencies
if ($env:MISO_BUILD_SKIP_INSTALL -ne "1") {
  Write-Host "Installing dependencies into build venv ..."
  & $VENV_PIP install `
    -r (Join-Path $ROOT_DIR "miso_runtime\server\requirements.txt") `
    -r (Join-Path $MISO_SOURCE_PATH "requirements.txt") `
    pyinstaller
  if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed"; exit 1 }
}

# Validate Python version
$pyVersionCheck = @"
import sys
major, minor = sys.version_info[:2]
if (major, minor) < ($MIN_PYTHON_MAJOR, $MIN_PYTHON_MINOR):
    print(f"Unsupported Python version: {sys.version.split()[0]} (required: >=$MIN_PYTHON_MAJOR.$MIN_PYTHON_MINOR)")
    raise SystemExit(1)
print(f"Using Python: {sys.version.split()[0]} ({sys.executable})")
"@
$pyVersionCheck | & $VENV_PY -
if ($LASTEXITCODE -ne 0) { exit 1 }

# Validate required modules
$depCheck = @"
import importlib.util
required_modules = ["flask", "openai", "anthropic", "PyInstaller"]
missing = [name for name in required_modules if importlib.util.find_spec(name) is None]
if missing:
    print("Missing required Python modules in build environment:", ", ".join(missing))
    raise SystemExit(1)
"@
$depCheck | & $VENV_PY -
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Dependency check failed."
  if ($env:MISO_BUILD_SKIP_INSTALL -eq "1") {
    Write-Host "MISO_BUILD_SKIP_INSTALL=1 is set, but required modules are missing."
    Write-Host "Either unset MISO_BUILD_SKIP_INSTALL or install dependencies into: $VENV_DIR"
  } else {
    Write-Host "Please ensure pip install completed successfully in: $VENV_DIR"
  }
  exit 1
}

# Prepare output directories
$DIST_DIR = Join-Path $ROOT_DIR "miso_runtime\dist\windows"
$BUILD_DIR = Join-Path $ROOT_DIR "miso_runtime\build\pyinstaller-windows"
$SPEC_DIR = Join-Path $ROOT_DIR "miso_runtime\build\spec-windows"

New-Item -ItemType Directory -Force -Path $DIST_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $BUILD_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $SPEC_DIR | Out-Null

$exePath = Join-Path $DIST_DIR "miso-server.exe"
if (Test-Path $exePath) { Remove-Item $exePath -Force }

$ENTRYPOINT = Join-Path $ROOT_DIR "miso_runtime\server\main.py"

# Set environment for PyInstaller
$env:MISO_SOURCE_PATH = $MISO_SOURCE_PATH
$existingPythonPath = $env:PYTHONPATH
if ($existingPythonPath) {
  $env:PYTHONPATH = "$MISO_SOURCE_PATH;$existingPythonPath"
} else {
  $env:PYTHONPATH = $MISO_SOURCE_PATH
}

# Build with PyInstaller
$pyinstallerArgs = @(
  "-m", "PyInstaller",
  "--clean",
  "--noconfirm",
  "--onefile",
  "--name", "miso-server",
  "--distpath", $DIST_DIR,
  "--workpath", $BUILD_DIR,
  "--specpath", $SPEC_DIR,
  "--collect-submodules", "miso",
  "--collect-submodules", "openai",
  "--collect-submodules", "anthropic",
  "--collect-data", "miso",
  "--add-data", "${CAPABILITY_JSON};miso",
  "--add-data", "${DEFAULT_PAYLOADS_JSON};miso",
  "--hidden-import", "miso",
  "--hidden-import", "miso.broth",
  "--hidden-import", "miso.tool",
  "--hidden-import", "miso.response_format",
  "--hidden-import", "miso.media",
  "--hidden-import", "miso.mcp",
  "--hidden-import", "openai",
  "--hidden-import", "anthropic",
  $ENTRYPOINT
)

Write-Host "Running PyInstaller ..."
& $VENV_PY @pyinstallerArgs
if ($LASTEXITCODE -ne 0) { Write-Error "PyInstaller failed"; exit 1 }

Write-Host "Built Miso server:"
Write-Host "  $DIST_DIR\miso-server.exe"
