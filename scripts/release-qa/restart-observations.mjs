import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function redactRestartObservation(value, limit = 2048) {
  return String(value ?? "")
    .replace(/(bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(/((?:token|password|secret|api[_-]?key|authorization)["']?\s*(?:[=:]\s*|\s+))(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s"']+/gi, (url) => url.replace(/([?&][^=&#]+)=([^&#]*)/g, "$1=[redacted]"))
    .slice(0, limit);
}

export function createRestartObservationRecorder({ now = Date.now, maxSnapshots = 48, intervalMs = 5000 } = {}) {
  const snapshots = [];
  let last = -Infinity;
  return {
    snapshots,
    capture(label, rows, knownPids = [], force = false) {
      const time = now();
      if (!force && time - last < intervalMs) return;
      last = time;
      const known = new Set(knownPids);
      const related = rows.filter((row) => known.has(row.pid) ||
        /pupu|old-uninstaller|fixture-installer/i.test(`${row.name || ""} ${row.executablePath || ""} ${row.command || ""}`));
      snapshots.push({ at: new Date(time).toISOString(), stage: label,
        total_processes: rows.length, related_processes: related.length, truncated: related.length > 64,
        processes: related.slice(0, 64).map((row) => ({
          pid: row.pid, ppid: row.ppid,
          name: redactRestartObservation(row.name, 128),
          executable_path: redactRestartObservation(row.executablePath, 1024),
          created_at: redactRestartObservation(row.createdAt, 128),
          session_id: Number.isSafeInteger(row.sessionId) ? row.sessionId : null,
          command: redactRestartObservation(row.command),
          observed_old_pid: known.has(row.pid),
        })),
      });
      if (snapshots.length > maxSnapshots) snapshots.shift();
    },
  };
}

// Observation only: no Stop-Process, installer replay, dialogs clicked, or file
// mutation. Errors collecting evidence must never become upgrade success.
export const WINDOWS_UPGRADE_OBSERVATION_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class PuPuDiagnosticWindows {
  private delegate bool Callback(IntPtr handle, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr parameter);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  public static string[] Read(IntPtr parent) {
    var lines = new List<string>();
    int visited = 0;
    EnumChildWindows(parent, (handle, parameter) => {
      if (++visited > 128) return false;
      var text = new StringBuilder(1024);
      GetWindowText(handle, text, text.Capacity);
      if (text.Length > 0) lines.Add(text.ToString());
      return lines.Count < 24;
    }, IntPtr.Zero);
    return lines.ToArray();
  }
}
'@
$windows = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.ProcessName -match '(?i)pupu|uninstall|setup|fixture' -or $_.MainWindowTitle -match '(?i)pupu|install') } | Select-Object -First 24 Id,ProcessName,MainWindowTitle,Responding,SessionId,@{n='DialogText';e={@([PuPuDiagnosticWindows]::Read($_.MainWindowHandle))}})
$events = @()
$eventError = $null
try {
  $events = @(Get-WinEvent -FilterHashtable @{LogName='Application'; StartTime=(Get-Date).AddMinutes(-20); Level=1,2} -MaxEvents 100 -ErrorAction Stop | Where-Object { $_.Message -match '(?i)pupu|sidecar|uninstall|fixture-installer' } | Select-Object -First 12 @{n='Time';e={$_.TimeCreated.ToUniversalTime().ToString('o')}},Id,ProviderName,@{n='Message';e={if ($_.Message.Length -gt 4096) {$_.Message.Substring(0,4096)} else {$_.Message}}})
} catch { $eventError = $_.Exception.Message }
@{windows=$windows; application_errors=$events; event_query_error=$eventError} | ConvertTo-Json -Depth 5 -Compress
`;

export function collectWindowsUpgradeObservations({ platform = process.platform, spawn = spawnSync, roots = [] } = {}) {
  if (platform !== "win32") return { available: false, reason: "not-windows" };
  const result = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_UPGRADE_OBSERVATION_SCRIPT], {
    encoding: "utf8", windowsHide: true, timeout: 15000, maxBuffer: 256 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`Windows observation failed: ${redactRestartObservation(result.error?.message || result.stderr || result.status)}`);
  const raw = JSON.parse(result.stdout);
  if (!Array.isArray(raw.windows) || !Array.isArray(raw.application_errors)) throw new Error("invalid Windows observation arrays");
  return {
    available: true,
    windows: raw.windows.slice(0, 24).map((item) => ({ pid: Number(item.Id), name: redactRestartObservation(item.ProcessName, 128),
      title: redactRestartObservation(item.MainWindowTitle, 1024), responding: item.Responding === true, session_id: Number(item.SessionId),
      dialog_text: (Array.isArray(item.DialogText) ? item.DialogText : []).slice(0, 24).map((line) => redactRestartObservation(line, 1024)) })),
    application_errors: raw.application_errors.slice(0, 12).map((item) => ({ at: redactRestartObservation(item.Time, 128),
      id: Number(item.Id), provider: redactRestartObservation(item.ProviderName, 128), message: redactRestartObservation(item.Message, 4096) })),
    event_query_error: raw.event_query_error ? redactRestartObservation(raw.event_query_error) : null,
    directories: roots.filter(Boolean).slice(0, 2).map((root) => {
      try {
        const entries = fs.readdirSync(root);
        return { path: root, exists: true, entries: entries.slice(0, 40).map((name) => redactRestartObservation(name, 256)), truncated: entries.length > 40,
          executable_exists: fs.existsSync(path.join(root, "PuPu.exe")), asar_exists: fs.existsSync(path.join(root, "resources", "app.asar")) };
      } catch (error) { return { path: root, error: redactRestartObservation(error.message) }; }
    }),
  };
}
