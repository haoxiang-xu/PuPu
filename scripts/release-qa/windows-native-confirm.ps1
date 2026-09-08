<#
.SYNOPSIS
  Drive (or probe for) PuPu's native one-time Vault use confirmation dialog.

.DESCRIPTION
  The installed candidate must keep its real `dialog.showMessageBox`
  confirmation (title "Allow secret use?", buttons "Allow once" / "Cancel",
  Cancel is the default). CDP cannot reach a native dialog, so the installed
  sink matrix harness drives it through UI Automation as a user would.

  -Action Allow   click "Allow once"
  -Action Cancel  click "Cancel"
  -Action Probe   only report whether the dialog exists within the timeout
                  (used to prove that a renderer denial never shows a dialog)

  Output: one JSON line {found, action, elapsed_ms, owner_pid}.
  Exit codes: 0 acted / probe done; 3 dialog not found (Allow/Cancel only);
  4 button not found; 5 UI Automation unavailable.
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet("Allow", "Cancel", "Probe")][string]$Action,
  [int]$TimeoutMs = 15000,
  [int]$OwnerPid = 0,
  [string]$Title = "Allow secret use?"
)

$ErrorActionPreference = "Stop"
$started = [System.Diagnostics.Stopwatch]::StartNew()

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
} catch {
  Write-Output (@{ found = $false; action = $Action; elapsed_ms = 0; owner_pid = $OwnerPid; error = "uia_unavailable" } | ConvertTo-Json -Compress)
  exit 5
}

$root = [System.Windows.Automation.AutomationElement]::RootElement
$titleCondition = New-Object System.Windows.Automation.PropertyCondition(
  [System.Windows.Automation.AutomationElement]::NameProperty, $Title)

function Find-Dialog {
  $windows = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $titleCondition)
  foreach ($window in $windows) {
    if ($OwnerPid -gt 0) {
      $pidValue = $window.GetCurrentPropertyValue([System.Windows.Automation.AutomationElement]::ProcessIdProperty)
      if ([int]$pidValue -ne $OwnerPid) { continue }
    }
    return $window
  }
  return $null
}

$dialog = $null
while ($started.ElapsedMilliseconds -lt $TimeoutMs) {
  $dialog = Find-Dialog
  if ($dialog -ne $null) { break }
  Start-Sleep -Milliseconds 100
}

if ($dialog -eq $null) {
  Write-Output (@{ found = $false; action = $Action; elapsed_ms = $started.ElapsedMilliseconds; owner_pid = $OwnerPid } | ConvertTo-Json -Compress)
  if ($Action -eq "Probe") { exit 0 }
  exit 3
}

if ($Action -eq "Probe") {
  Write-Output (@{ found = $true; action = $Action; elapsed_ms = $started.ElapsedMilliseconds; owner_pid = $OwnerPid } | ConvertTo-Json -Compress)
  exit 0
}

$buttonName = if ($Action -eq "Allow") { "Allow once" } else { "Cancel" }
$buttonCondition = New-Object System.Windows.Automation.AndCondition(
  (New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button)),
  (New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::NameProperty, $buttonName)))

$button = $null
$buttonDeadline = $started.ElapsedMilliseconds + 5000
while ($started.ElapsedMilliseconds -lt $buttonDeadline) {
  $button = $dialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
  if ($button -ne $null) { break }
  Start-Sleep -Milliseconds 100
}
if ($button -eq $null) {
  Write-Output (@{ found = $true; action = $Action; elapsed_ms = $started.ElapsedMilliseconds; owner_pid = $OwnerPid; error = "button_not_found" } | ConvertTo-Json -Compress)
  exit 4
}

$invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
$invoke.Invoke()

# Wait for the dialog to disappear so the caller knows the click landed.
$goneDeadline = $started.ElapsedMilliseconds + 5000
while ($started.ElapsedMilliseconds -lt $goneDeadline) {
  if ((Find-Dialog) -eq $null) { break }
  Start-Sleep -Milliseconds 100
}

Write-Output (@{ found = $true; action = $Action; elapsed_ms = $started.ElapsedMilliseconds; owner_pid = $OwnerPid } | ConvertTo-Json -Compress)
exit 0
