param(
  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
  [ValidateSet("x64", "x86")]
  [string]$PowerShellArchitecture = "x64"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
if ($env:OS -ne "Windows_NT") { throw "This native contract requires Windows." }

$productionScript = Join-Path $RepositoryRoot "installer/windows/stop-installed-sidecars.ps1"
$productionSource = Join-Path $RepositoryRoot "installer/windows/sidecar-cleanup.cs"
$windowsDirectory = if ($PowerShellArchitecture -eq "x86") { "SysWOW64" } elseif ([Environment]::Is64BitProcess) { "System32" } else { "Sysnative" }
$windowsPowerShell = Join-Path $env:SystemRoot ($windowsDirectory + "/WindowsPowerShell/v1.0/powershell.exe")
foreach ($required in @($productionScript, $productionSource, $windowsPowerShell)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing contract input: $required" }
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ("pupu-sidecar-native-" + [Guid]::NewGuid().ToString("N"))
$null = [IO.Directory]::CreateDirectory($testRoot)
$ownedProcesses = New-Object 'System.Collections.Generic.List[System.Diagnostics.Process]'
$passedCases = New-Object 'System.Collections.Generic.List[string]'
$notRunCases = New-Object 'System.Collections.Generic.List[string]'
$notRunCases.Add("forced-access-denied")
$notRunCases.Add("deterministic-pid-reuse")
$primaryFailure = $null

function Assert-Contract([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "Native sidecar contract failed: $Message" }
}

# ProcessStartInfo.Arguments uses Windows argv quoting, never PowerShell source.
function ConvertTo-WindowsArgument([string]$Value) {
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

function Start-OwnedProcess([string]$Executable, [string[]]$Arguments, [bool]$Capture = $false) {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $Executable
  $start.Arguments = (($Arguments | ForEach-Object { ConvertTo-WindowsArgument $_ }) -join " ")
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardOutput = $Capture
  $start.RedirectStandardError = $Capture
  $process = New-Object Diagnostics.Process
  $process.StartInfo = $start
  Assert-Contract ($process.Start()) "Could not start the harmless contract fixture."
  # Hold the OS handle before recording it; cleanup must not target a recycled PID.
  $null = $process.Handle
  $ownedProcesses.Add($process)
  return $process
}

function Wait-Marker([string]$Path) {
  $clock = [Diagnostics.Stopwatch]::StartNew()
  while (-not [IO.File]::Exists($Path)) {
    if ($clock.Elapsed.TotalSeconds -ge 15) { throw "Fixture readiness timed out: $Path" }
    Start-Sleep -Milliseconds 50
  }
  $fixtureId = [int][IO.File]::ReadAllText($Path)
  $process = [Diagnostics.Process]::GetProcessById($fixtureId)
  $null = $process.Handle
  $ownedProcesses.Add($process)
  return $process
}

function Assert-Alive([Diagnostics.Process]$Process, [string]$Name) {
  Assert-Contract (-not $Process.HasExited) "$Name was terminated outside the authorized installation."
}

function Assert-Exited([Diagnostics.Process]$Process, [string]$Name) {
  Assert-Contract ($Process.WaitForExit(5000)) "$Name survived cleanup."
}

function Invoke-Production([string]$InstallDirectory, [bool]$ExpectSuccess = $true) {
  $process = Start-OwnedProcess $windowsPowerShell @(
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", $productionScript, "-InstallDirectory", $InstallDirectory
  ) $true
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit(45000)) { throw "Production cleanup exceeded the native contract timeout." }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if (-not $ExpectSuccess) {
    Assert-Contract ($process.ExitCode -ne 0) "Unsafe input or live application was admitted: $InstallDirectory"
    return
  }
  Assert-Contract ($process.ExitCode -eq 0) "Production cleanup failed: $stdout $stderr"
  $lines = @($stdout -split "\r?\n" | Where-Object { $_.Trim().Length -gt 0 })
  Assert-Contract ($lines.Count -eq 1) "Success must emit exactly one JSON line."
  $report = $lines[0] | ConvertFrom-Json
  $keys = @($report.PSObject.Properties.Name | Sort-Object)
  Assert-Contract (($keys -join ",") -eq "schema,status,terminated_processes") "Success report key set drifted."
  Assert-Contract ($report.schema -eq "pupu.installer-sidecar-cleanup.v1") "Success schema drifted."
  Assert-Contract ($report.status -eq "passed") "Success status drifted."
  Assert-Contract (($report.terminated_processes -is [int] -or $report.terminated_processes -is [long]) -and $report.terminated_processes -ge 0) "Termination count must be a nonnegative integer."
  return $report
}

function Copy-Fixture([string]$Destination) {
  $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Destination))
  [IO.File]::Copy((Join-Path $testRoot "harmless-fixture.exe"), $Destination, $true)
  return $Destination
}

function Start-HoldingFixture([string]$Executable, [string]$Name) {
  $marker = Join-Path $testRoot ($Name + ".pid")
  $process = Start-OwnedProcess $Executable @("hold", $marker)
  $null = Wait-Marker $marker
  return $process
}

try {
  # This binary only starts explicit copies of itself, records readiness, and sleeps.
  # It does not load PuPu, Electron, Unchain, a model, or a network service.
  $fixtureSource = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
public static class HarmlessSidecarFixture {
  private static string Quote(string value) { return "\"" + value.Replace("\"", "\\\"") + "\""; }
  private static void Ready(string marker) {
    string temporary = marker + ".ready";
    File.WriteAllText(temporary, Process.GetCurrentProcess().Id.ToString());
    File.Move(temporary, marker);
  }
  private static void Spawn(string executable, params string[] args) {
    var quoted = Array.ConvertAll(args, Quote);
    var info = new ProcessStartInfo(executable, String.Join(" ", quoted));
    info.UseShellExecute = false;
    info.CreateNoWindow = true;
    Process.Start(info);
  }
  public static int Main(string[] args) {
    if (args.Length < 2) return 3;
    if (args[0] == "root" || args[0] == "orphan") {
      Spawn(Process.GetCurrentProcess().MainModule.FileName, "branch", args[2], args[3], args[4]);
      Ready(args[1]);
      if (args[0] == "orphan") return 0;
    } else if (args[0] == "branch") {
      Spawn(args[2], "hold", args[3]);
      Ready(args[1]);
    } else if (args[0] == "hold") {
      Ready(args[1]);
    } else return 4;
    // Bound even a test harness crash: these harmless fixtures cannot live forever.
    DateTime deadline = DateTime.UtcNow.AddMinutes(5);
    while (DateTime.UtcNow < deadline) Thread.Sleep(1000);
    return 0;
  }
}
'@
  # Compile fixtures with Windows PowerShell/.NET Framework, matching customer OS
  # availability; a pwsh/.NET Core executable is not a stand-alone Windows fixture.
  $fixtureCs = Join-Path $testRoot "harmless-fixture.cs"
  $fixtureCompiler = Join-Path $testRoot "compile-fixture.ps1"
  [IO.File]::WriteAllText($fixtureCs, $fixtureSource)
  [IO.File]::WriteAllText($fixtureCompiler, 'param([string]$Source,[string]$Output,[string]$ArchitectureOutput); $ErrorActionPreference="Stop"; Add-Type -Path $Source -OutputAssembly $Output -OutputType ConsoleApplication; [IO.File]::WriteAllText($ArchitectureOutput, [IntPtr]::Size.ToString())')
  $architectureOutput = Join-Path $testRoot "powershell-pointer-size.txt"
  $compiler = Start-OwnedProcess $windowsPowerShell @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", $fixtureCompiler, "-Source", $fixtureCs, "-Output", (Join-Path $testRoot "harmless-fixture.exe"), "-ArchitectureOutput", $architectureOutput) $true
  $compilerStdout = $compiler.StandardOutput.ReadToEndAsync()
  $compilerStderr = $compiler.StandardError.ReadToEndAsync()
  Assert-Contract ($compiler.WaitForExit(30000)) "Harmless fixture compilation timed out."
  Assert-Contract ($compiler.ExitCode -eq 0) ("Harmless fixture compilation failed: " + $compilerStdout.GetAwaiter().GetResult() + $compilerStderr.GetAwaiter().GetResult())
  $expectedPointerSize = if ($PowerShellArchitecture -eq "x64") { 8 } else { 4 }
  Assert-Contract (([int][IO.File]::ReadAllText($architectureOutput)) -eq $expectedPointerSize) "Windows redirected the selected PowerShell architecture."

  # Char codes preserve this case even when PowerShell 5.1 reads UTF-8 without BOM.
  $install = Join-Path $testRoot ("PuPu's " + [char]0x4e2d + [char]0x6587 + " installation")
  $relativeSidecar = "resources\unchain_runtime\dist\windows\unchain-server.exe"
  $sidecar = Copy-Fixture (Join-Path $install $relativeSidecar)
  $externalWorker = Copy-Fixture (Join-Path $testRoot "external-tool/worker.exe")
  $otherSidecar = Copy-Fixture (Join-Path (Join-Path $testRoot "other-install") $relativeSidecar)
  $prefixSidecar = Copy-Fixture (Join-Path ($install + "-not-this-install") $relativeSidecar)
  $other = Start-HoldingFixture $otherSidecar "unrelated-same-name"
  $prefix = Start-HoldingFixture $prefixSidecar "unrelated-prefix-collision"

  $rootMarker = Join-Path $testRoot "root.pid"
  $childMarker = Join-Path $testRoot "child.pid"
  $workerMarker = Join-Path $testRoot "worker.pid"
  $rootProcess = Start-OwnedProcess $sidecar @("root", $rootMarker, $childMarker, $externalWorker, $workerMarker)
  $null = Wait-Marker $rootMarker
  $child = Wait-Marker $childMarker
  $worker = Wait-Marker $workerMarker
  $report = Invoke-Production $install
  Assert-Contract ($report.terminated_processes -ge 3) "Expected the selected sidecar, worker, and external descendant."
  Assert-Exited $rootProcess "sidecar parent"
  Assert-Exited $child "same-image sidecar child"
  Assert-Exited $worker "external executable descendant"
  Assert-Alive $other "Other installation"
  Assert-Alive $prefix "Prefix-collision installation"
  $passedCases.Add("scoped-tree-and-quoted-unicode-path")

  $orphanChildMarker = Join-Path $testRoot "orphan-child.pid"
  $orphanWorkerMarker = Join-Path $testRoot "orphan-worker.pid"
  $orphanParent = Start-OwnedProcess $sidecar @("orphan", (Join-Path $testRoot "orphan-parent.pid"), $orphanChildMarker, $externalWorker, $orphanWorkerMarker)
  $orphanChild = Wait-Marker $orphanChildMarker
  $orphanWorker = Wait-Marker $orphanWorkerMarker
  Assert-Exited $orphanParent "self-exiting legacy launcher"
  $report = Invoke-Production $install
  Assert-Contract ($report.terminated_processes -ge 2) "Orphaned legacy sidecar was not selected by exact image identity."
  Assert-Exited $orphanChild "orphaned legacy sidecar"
  Assert-Exited $orphanWorker "orphaned sidecar descendant"
  $passedCases.Add("orphan-with-dead-parent")

  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class PuPuFixtureShortPath {
  [DllImport("kernel32.dll", EntryPoint="GetShortPathNameW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern uint Get(string longPath, StringBuilder shortPath, uint length);
}
'@
  $shortBuffer = New-Object Text.StringBuilder 32768
  $shortLength = [PuPuFixtureShortPath]::Get($install, $shortBuffer, [uint32]$shortBuffer.Capacity)
  if ($shortLength -gt 0 -and $shortLength -lt $shortBuffer.Capacity -and -not [string]::Equals($install, $shortBuffer.ToString(), [StringComparison]::OrdinalIgnoreCase)) {
    $shortInstall = $shortBuffer.ToString()
    $longPathSidecar = Start-HoldingFixture $sidecar "long-image-short-input"
    $null = Invoke-Production $shortInstall
    Assert-Exited $longPathSidecar "long-image sidecar with 8.3 install directory"
    $shortPathSidecar = Start-HoldingFixture (Join-Path $shortInstall $relativeSidecar) "short-image-long-input"
    $null = Invoke-Production $install
    Assert-Exited $shortPathSidecar "8.3-image sidecar with long install directory"
    Assert-Alive $other "Other installation during 8.3 normalization"
    Assert-Alive $prefix "Prefix-collision installation during 8.3 normalization"
    $passedCases.Add("native-8dot3-alias-both-directions")
  } else {
    # NTFS volumes may disable 8.3 names; that is missing evidence, not a pass.
    $notRunCases.Add("native-8dot3-alias-unavailable-on-this-volume")
  }

  $applicationExe = Copy-Fixture (Join-Path $install "PuPu.exe")
  $activeApplication = Start-HoldingFixture $applicationExe "active-application"
  $activeSidecar = Start-HoldingFixture $sidecar "active-sidecar"
  Invoke-Production $install $false
  Assert-Alive $activeApplication "Active PuPu installation"
  Assert-Alive $activeSidecar "Sidecar of still-active PuPu"
  $activeApplication.Kill()
  Assert-Exited $activeApplication "manually closed dummy application"
  $null = Invoke-Production $install
  Assert-Exited $activeSidecar "sidecar after application exit"
  $passedCases.Add("live-application-fails-before-sidecar-kill-and-retry")

  $repeat = Invoke-Production $install
  Assert-Contract ($repeat.terminated_processes -eq 0) "No-op retry terminated a process."
  $fresh = Invoke-Production (Join-Path $testRoot "never-created/deep/PuPu")
  Assert-Contract ($fresh.terminated_processes -eq 0) "Fresh installation terminated a process."
  $passedCases.Add("idempotent-and-fresh-install")

  $invalidDirectories = @(
    "relative\PuPu", "\\localhost\share\PuPu", [IO.Path]::GetPathRoot($testRoot),
    $env:USERPROFILE, $env:SystemRoot, $env:ProgramFiles, $env:APPDATA,
    $env:LOCALAPPDATA, [IO.Path]::GetTempPath(), ($install + "`ninvalid"),
    (Join-Path $env:SystemRoot "System32"), (Join-Path $env:SystemRoot "SysWOW64"),
    (Join-Path $env:SystemRoot "Sysnative")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
  foreach ($invalid in $invalidDirectories) {
    Invoke-Production $invalid $false
    Assert-Alive $other "Other installation during rejected-input checks"
    Assert-Alive $prefix "Prefix-collision installation during rejected-input checks"
  }
  # NUL cannot be transported intact through Windows argv: test the actual native
  # producer boundary directly rather than pretending the CLI preserved it.
  Add-Type -Path $productionSource
  $nulRejected = $false
  try { $null = [PuPu.Installer.SidecarCleanup]::Run($install + [char]0 + "invalid") }
  catch { $nulRejected = $true }
  Assert-Contract $nulRejected "Native API accepted a NUL-containing path."
  Assert-Alive $other "Other installation after all native cases"
  Assert-Alive $prefix "Prefix-collision installation after all native cases"
  $passedCases.Add("protected-and-malformed-directories")

  [ordered]@{
    schema = "pupu.installer-sidecar-cleanup-native-test.v1"
    status = "passed"
    production_powershell_architecture = $PowerShellArchitecture
    test_host_architecture = if ([Environment]::Is64BitProcess) { "x64" } else { "x86" }
    cases = @($passedCases.ToArray())
    not_run = @($notRunCases.ToArray())
  } | ConvertTo-Json -Depth 4 -Compress
} catch {
  $primaryFailure = $_
  throw
} finally {
  # Only Process objects whose handles this test retained are eligible. No taskkill
  # image-name filter, machine-wide process sweep, or real application is involved.
  foreach ($process in $ownedProcesses) {
    try {
      if (-not $process.HasExited) { $process.Kill(); $null = $process.WaitForExit(5000) }
    } catch { Write-Warning ("Could not reap an owned dummy fixture: " + $_.Exception.Message) }
    finally { $process.Dispose() }
  }
  try {
    if ([IO.Directory]::Exists($testRoot)) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
  } catch {
    if ($null -eq $primaryFailure) { throw }
    Write-Warning ("Fixture file cleanup also failed after the original contract failure: " + $_.Exception.Message)
  }
}
