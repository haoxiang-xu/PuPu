param()

$ErrorActionPreference = "Stop"

$ROOT_DIR = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VENV_DIR = Join-Path $ROOT_DIR ".venv"
$REQUIREMENTS_FILE = Join-Path $ROOT_DIR "miso_runtime\server\requirements.txt"

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

  throw "Python 3.12.x is required but was not found. Install Python 3.12 and re-run this script."
}

Write-Host "Initializing .venv with Python 3.12.x ..."
$resolved = Resolve-Python312Command
$VENV_PY = Join-Path $VENV_DIR "Scripts\python.exe"

if ((Test-Path $VENV_PY) -and -not (Test-Python312Command -Command $VENV_PY)) {
  Write-Host "Existing .venv uses a non-3.12 interpreter. Rebuilding ..."
  Remove-Item $VENV_DIR -Recurse -Force
}

if (-not (Test-Path $VENV_PY)) {
  if (Test-Path $VENV_DIR) {
    Remove-Item $VENV_DIR -Recurse -Force
  }
  & $resolved.Command @($resolved.Arguments + @("-m", "venv", $VENV_DIR))
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to create .venv with Python 3.12."
  }
}

& $VENV_PY -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "Failed to upgrade pip in .venv."
}

& $VENV_PY -m pip install -r $REQUIREMENTS_FILE
if ($LASTEXITCODE -ne 0) {
  throw "Failed to install Python dependencies."
}

Write-Host "Ready: $(& $VENV_PY --version)"
Write-Host "Activate with: .\.venv\Scripts\Activate.ps1"
