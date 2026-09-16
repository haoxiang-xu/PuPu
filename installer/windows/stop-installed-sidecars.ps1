param([Parameter(Mandatory = $true)][string]$InstallDirectory)

$ErrorActionPreference = "Stop"
try {
    # The native source is embedded alongside this script by the signed installer.
    # -File arguments are data: installation paths are never executable PS source.
    Add-Type -Path (Join-Path $PSScriptRoot "sidecar-cleanup.cs")
    $count = [PuPu.Installer.SidecarCleanup]::Run($InstallDirectory)
    @{ schema = "pupu.installer-sidecar-cleanup.v1"; status = "passed"; terminated_processes = $count } |
        ConvertTo-Json -Compress
    exit 0
} catch {
    @{ schema = "pupu.installer-sidecar-cleanup.v1"; status = "failed"; error = $_.Exception.Message } |
        ConvertTo-Json -Compress
    exit 1
}
