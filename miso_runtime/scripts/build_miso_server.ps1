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
$MIN_PYTHON_MINOR = 12

function Test-Python312Command {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [string[]]$Arguments = @()
  )

  try {
    $null = & $Command @Arguments -c "import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)"
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Resolve-Python312Command {
  if ($env:MISO_PYTHON_BIN) {
    if (Test-Python312Command -Command $env:MISO_PYTHON_BIN) {
      return @{
        Command = $env:MISO_PYTHON_BIN
        Arguments = @()
      }
    }

    throw "MISO_PYTHON_BIN must point to Python 3.12.x: $($env:MISO_PYTHON_BIN)"
  }

  if (Get-Command py -ErrorAction SilentlyContinue) {
    if (Test-Python312Command -Command "py" -Arguments @("-3.12")) {
      return @{
        Command = "py"
        Arguments = @("-3.12")
      }
    }
  }

  foreach ($candidate in @("python3.12", "python3", "python")) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
      if (Test-Python312Command -Command $candidate) {
        return @{
          Command = $candidate
          Arguments = @()
        }
      }
    }
  }

  throw "Python 3.12.x is required to build miso-server."
}

# Resolve root directory (two levels up from this script)
$ROOT_DIR = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

# Miso source path
$MISO_SOURCE_PATH = if ($env:MISO_SOURCE_PATH) { $env:MISO_SOURCE_PATH } else { Join-Path $ROOT_DIR "..\miso" }
$MISO_SOURCE_PATH = [System.IO.Path]::GetFullPath($MISO_SOURCE_PATH)

if (-not (Test-Path (Join-Path $MISO_SOURCE_PATH "src\miso\__init__.py")) -or
    -not (Test-Path (Join-Path $MISO_SOURCE_PATH "src\miso\runtime\engine.py"))) {
  Write-Error "Invalid MISO source path: $MISO_SOURCE_PATH`nExpected files: src\miso\__init__.py and src\miso\runtime\engine.py"
  exit 1
}

$CAPABILITY_JSON = Join-Path $MISO_SOURCE_PATH "src\miso\runtime\resources\model_capabilities.json"
$DEFAULT_PAYLOADS_JSON = Join-Path $MISO_SOURCE_PATH "src\miso\runtime\resources\model_default_payloads.json"

if (-not (Test-Path $CAPABILITY_JSON) -or -not (Test-Path $DEFAULT_PAYLOADS_JSON)) {
  Write-Error "Missing required MISO model metadata files in source path: $MISO_SOURCE_PATH`nExpected:`n  $CAPABILITY_JSON`n  $DEFAULT_PAYLOADS_JSON"
  exit 1
}

# Python / venv setup
$resolvedPython = Resolve-Python312Command
$VENV_DIR = if ($env:MISO_BUILD_VENV) { $env:MISO_BUILD_VENV } else { Join-Path $ROOT_DIR ".venv-miso-build" }

$VENV_PY = Join-Path $VENV_DIR "Scripts\python.exe"
$VENV_PIP = Join-Path $VENV_DIR "Scripts\pip.exe"

if ((Test-Path $VENV_PY) -and -not (Test-Python312Command -Command $VENV_PY)) {
  Write-Host "Existing build venv does not use Python 3.12.x. Rebuilding: $VENV_DIR"
  Remove-Item $VENV_DIR -Recurse -Force
}

if (-not (Test-Path $VENV_PY)) {
  Write-Host "Creating build venv at $VENV_DIR ..."
  & $resolvedPython.Command @($resolvedPython.Arguments + @("-m", "venv", $VENV_DIR))
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
    -e $MISO_SOURCE_PATH `
    pyinstaller
  if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed"; exit 1 }
}

# Validate Python version
$pyVersionCheck = @"
import sys
major, minor = sys.version_info[:2]
if (major, minor) != ($MIN_PYTHON_MAJOR, $MIN_PYTHON_MINOR):
    print(f"Unsupported Python version: {sys.version.split()[0]} (required: $MIN_PYTHON_MAJOR.$MIN_PYTHON_MINOR.x)")
    raise SystemExit(1)
print(f"Using Python: {sys.version.split()[0]} ({sys.executable})")
"@
$pyVersionCheck | & $VENV_PY -
if ($LASTEXITCODE -ne 0) { exit 1 }

# Validate required modules
$depCheck = @"
import importlib.util
required_modules = ["flask", "openai", "anthropic", "PyInstaller", "qdrant_client"]
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
  $env:PYTHONPATH = "$MISO_SOURCE_PATH\src;$existingPythonPath"
} else {
  $env:PYTHONPATH = "$MISO_SOURCE_PATH\src"
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
  "--add-data", "${CAPABILITY_JSON};miso/runtime/resources",
  "--add-data", "${DEFAULT_PAYLOADS_JSON};miso/runtime/resources",
  "--hidden-import", "miso",
  "--hidden-import", "miso.runtime",
  "--hidden-import", "miso.runtime.engine",
  "--hidden-import", "miso.runtime.files",
  "--hidden-import", "miso.runtime.providers",
  "--hidden-import", "miso.tools",
  "--hidden-import", "miso.tools.tool",
  "--hidden-import", "miso.tools.toolkit",
  "--hidden-import", "miso.tools.registry",
  "--hidden-import", "miso.tools.catalog",
  "--hidden-import", "miso.schemas",
  "--hidden-import", "miso.schemas.response",
  "--hidden-import", "miso.input",
  "--hidden-import", "miso.input.media",
  "--hidden-import", "miso.toolkits",
  "--hidden-import", "miso.toolkits.mcp",
  "--hidden-import", "miso.memory",
  "--hidden-import", "miso.memory.manager",
  "--hidden-import", "miso.memory.qdrant",
  "--hidden-import", "openai",
  "--hidden-import", "anthropic",
  "--collect-submodules", "qdrant_client",
  "--hidden-import", "qdrant_client",
  "--hidden-import", "qdrant_client.http",
  "--hidden-import", "qdrant_client.http.models",
  "--hidden-import", "qdrant_client.local",
  "--hidden-import", "qdrant_client.local.local_collection",
  $ENTRYPOINT
)

Write-Host "Running PyInstaller ..."
& $VENV_PY @pyinstallerArgs
if ($LASTEXITCODE -ne 0) { Write-Error "PyInstaller failed"; exit 1 }

Write-Host "Built Miso server:"
Write-Host "  $DIST_DIR\miso-server.exe"
