import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { runRestartUpdateQualification } from "./run-restart-update-qualification.mjs";
import { WINDOWS_DIAGNOSTIC_SCHEMA } from "./windows-upgrade-diagnostic-identity.mjs";

export async function runWindowsUpgradeDiagnostic(options, run = runRestartUpdateQualification) {
  if (options.targetId !== "windows-x64") throw new Error("diagnostics only support windows-x64");
  const report = await run(options);
  // Deliberately not a formal restart report. The regular strict release receipt
  // validator rejects this top-level schema even when every lifecycle check passes.
  return { schema: WINDOWS_DIAGNOSTIC_SCHEMA, diagnostic_only: true, status: report.status, lifecycle: report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const names = ["candidate-dir", "fixture", "fixture-evidence", "target", "feed-port", "out", "diagnostics", "server-log"];
    const { values } = parseArgs({ options: Object.fromEntries(names.map((name) => [name, { type: "string" }])), strict: true });
    for (const name of names) if (!values[name]) throw new Error(`--${name} is required`);
    if (process.env.GITHUB_REF !== "refs/heads/dev" || process.env.GITHUB_EVENT_NAME !== "workflow_dispatch") throw new Error("diagnostics require dev dispatch");
    const report = await runWindowsUpgradeDiagnostic({
      candidateDir: values["candidate-dir"], fixturePath: values.fixture, fixtureEvidencePath: values["fixture-evidence"],
      targetId: values.target, feedPort: Number(values["feed-port"]), diagnosticsPath: values.diagnostics, serverLogPath: values["server-log"],
    });
    fs.writeFileSync(values.out, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  } catch {
    // The production runner already emits a redacted first cause and diagnostics.
    console.error("Windows upgrade diagnostic failed; inspect the retained diagnostic evidence.");
    process.exitCode = 1;
  }
}
