import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error("invalid probe schema: unexpected or missing fields");
  }
}

export function summarizeIntelCloudKitProbe(payload) {
  exactKeys(payload, ["samples", "baseline", "tcp", "transport"]);
  const { samples, baseline, tcp, transport } = payload;
  if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new Error("invalid samples");
  for (const rows of [baseline, tcp]) {
    if (!Array.isArray(rows) || rows.length !== samples) throw new Error("incomplete probe samples");
    for (const [index, row] of rows.entries()) {
      exactKeys(row, ["attempt", "staple_exit", "validate_exit", "duration_ms", "cloudkit_lookup", "transient_network_failure"]);
      if (row.attempt !== index + 1 || !Number.isInteger(row.staple_exit) || row.staple_exit < 0
          || !(row.validate_exit === null || Number.isInteger(row.validate_exit) && row.validate_exit >= 0)
          || !Number.isFinite(row.duration_ms) || row.duration_ms < 0
          || typeof row.cloudkit_lookup !== "boolean" || typeof row.transient_network_failure !== "boolean") {
        throw new Error("invalid probe sample");
      }
    }
  }
  exactKeys(transport, ["pf_rule_active", "tcp_packets", "udp_packets"]);
  if (typeof transport.pf_rule_active !== "boolean"
      || ![transport.tcp_packets, transport.udp_packets].every((n) => Number.isInteger(n) && n >= 0)) {
    throw new Error("invalid transport proof");
  }
  const failed = (row) => row.staple_exit !== 0 || row.validate_exit !== 0;
  const baseline_failures = baseline.filter(failed).length;
  const tcp_failures = tcp.filter(failed).length;
  const counts = { baseline_failures, tcp_failures };
  if (tcp_failures) return { status: "failed", verdict: "tcp-probe-failed", ...counts };
  if (!transport.pf_rule_active || transport.tcp_packets === 0 || transport.udp_packets !== 0
      || tcp.some((row) => !row.cloudkit_lookup)) {
    return { status: "incomplete", verdict: "transport-proof-incomplete", ...counts };
  }
  const reproduced = baseline.some((row) => failed(row) && row.transient_network_failure);
  return {
    status: "passed",
    verdict: reproduced ? "tcp-workaround-supported" : "tcp-usable-baseline-not-reproduced",
    ...counts,
  };
}

function execute(binary, args, timeout = 20_000) {
  const result = spawnSync(binary, args, { encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024 });
  return {
    status: result.status ?? (result.error?.code === "ETIMEDOUT" ? 124 : 125),
    stdout: result.stdout || "",
    output: `${result.stdout || ""}${result.stderr || ""}${result.error ? `\n${result.error.message}` : ""}`,
  };
}

function checked(binary, args, timeout) {
  const result = execute(binary, args, timeout);
  if (result.status !== 0) throw new Error(`${path.basename(binary)} failed (${result.status}): ${result.output}`);
  return result;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function capturePackets(root, phase, iface) {
  const packetPath = path.join(root, `${phase}.pcap`);
  const pidPath = path.join(root, `${phase}.capture.pid`);
  const logFd = fs.openSync(path.join(root, `${phase}.capture.log`), "w");
  // Capture only Apple-addressed TLS/QUIC packet headers. No payload/pcap is uploaded.
  const child = spawn("/usr/bin/sudo", [
    "-n", "/bin/sh", "-c", 'echo "$$" > "$1"; shift; exec /usr/sbin/tcpdump "$@"',
    "pupu-probe-capture", pidPath, "-i", iface, "-nn", "-s", "96", "-U", "-w", packetPath,
    "net 17.0.0.0/8 and port 443",
  ], { stdio: ["ignore", logFd, logFd] });
  fs.closeSync(logFd);
  let spawnError;
  const finished = new Promise((resolve) => {
    child.once("error", (error) => { spawnError = error; resolve(); });
    child.once("close", resolve);
  });
  await delay(800);
  if (spawnError || child.exitCode !== null || !fs.existsSync(pidPath)) throw new Error("packet capture failed to start");
  const pid = fs.readFileSync(pidPath, "utf8").trim();
  if (!/^\d+$/.test(pid)) throw new Error("invalid capture process identity");
  return async () => {
    checked("/usr/bin/sudo", ["-n", "/bin/kill", "-INT", pid]);
    await Promise.race([finished, delay(5000).then(() => { throw new Error("packet capture did not finish"); })]);
    const read = (protocol) => checked("/usr/sbin/tcpdump", ["-nn", "-r", packetPath, `${protocol} port 443`]).stdout;
    const tcp = read("tcp");
    const udp = read("udp");
    fs.writeFileSync(path.join(root, `${phase}.packets.txt`), `Apple IPv4 TCP443:\n${tcp}\nApple IPv4 UDP443:\n${udp}`);
    const count = (text) => text.trim() ? text.trim().split("\n").length : 0;
    return { tcp_packets: count(tcp), udp_packets: count(udp) };
  };
}

async function runIntelCloudKitProbe() {
  // No privileged command, application copy, or network probe is allowed locally.
  const env = process.env;
  if (process.platform !== "darwin" || process.arch !== "x64" || env.GITHUB_ACTIONS !== "true"
      || env.RUNNER_ENVIRONMENT !== "github-hosted" || env.GITHUB_REPOSITORY !== "haoxiang-xu/PuPu"
      || env.GITHUB_REF !== "refs/heads/codex/intel-cloudkit-tcp-probe"
      || !/^\d+$/.test(env.GITHUB_RUN_ID || "") || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT || "")) {
    throw new Error("probe is restricted to the exact temporary GitHub-hosted Intel branch");
  }
  if (!env.RUNNER_TEMP) throw new Error("RUNNER_TEMP is required");
  const root = path.join(fs.realpathSync(env.RUNNER_TEMP), `pupu-intel-cloudkit-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`);
  fs.mkdirSync(root); // A repeated invocation must not reuse evidence or fixture state.
  const metadata = {
    schema: "pupu.intel-cloudkit-tcp-diagnostic.v1", run_id: env.GITHUB_RUN_ID,
    run_attempt: env.GITHUB_RUN_ATTEMPT, commit: env.GITHUB_SHA, image_version: env.ImageVersion || null,
    architecture: process.arch, os: checked("/usr/bin/sw_vers", []).output,
    xcode: checked("/usr/bin/xcodebuild", ["-version"]).output,
    transport_filter: "Apple IPv4 17.0.0.0/8 port 443; zero matching packets is INCOMPLETE",
  };
  fs.writeFileSync(path.join(root, "metadata.json"), JSON.stringify(metadata, null, 2));
  const source = "/Applications/Firefox.app";
  if (!fs.existsSync(source)) throw new Error("preinstalled Firefox fixture is missing; no fixture download/build is permitted");
  const fixtureVerification = checked("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", source], 90_000);
  fs.writeFileSync(path.join(root, "fixture.log"), fixtureVerification.output);
  const route = checked("/sbin/route", ["-n", "get", "default"]).stdout;
  const iface = route.match(/interface:\s*([a-zA-Z0-9]+)\b/)?.[1];
  if (!iface) throw new Error("default network interface was not resolved");
  const anchor = `com.apple/pupu-intel-tcp-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  const samples = 5;
  let pfToken;
  let anchorLoaded = false;
  let cleanupError;
  let stopCapture;
  let report;
  const runPhase = async (phase) => {
    stopCapture = await capturePackets(root, phase, iface);
    const results = [];
    for (let attempt = 1; attempt <= samples; attempt += 1) {
      const copy = path.join(root, `fixture-${phase}-${attempt}.app`);
      checked("/usr/bin/ditto", [source, copy], 90_000);
      const start = Date.now();
      const staple = execute("/usr/bin/xcrun", ["stapler", "staple", "-v", copy], 90_000);
      const validate = staple.status === 0 ? execute("/usr/bin/xcrun", ["stapler", "validate", "-v", copy], 30_000) : null;
      fs.writeFileSync(path.join(root, `${phase}-${attempt}.log`), `${staple.output}\nVALIDATE:\n${validate?.output || "NOT_RUN"}`);
      const row = {
        attempt, staple_exit: staple.status, validate_exit: validate?.status ?? null, duration_ms: Date.now() - start,
        cloudkit_lookup: /Domain is api\.apple-cloudkit\.com/.test(staple.output),
        transient_network_failure: /NSURLErrorDomain Code=-(?:1001|1003|1004|1005|1009)\b/.test(staple.output),
      };
      results.push(row);
      console.log(`${phase} ${attempt}/${samples}: staple=${row.staple_exit} validate=${row.validate_exit} duration_ms=${row.duration_ms}`);
      // Only remove the exact disposable fixture created in this fresh evidence directory.
      fs.rmSync(copy, { recursive: true });
    }
    const packets = await stopCapture();
    stopCapture = null;
    fs.writeFileSync(path.join(root, `${phase}.json`), JSON.stringify({ results, packets }, null, 2));
    return { results, packets };
  };
  try {
    const baseline = await runPhase("baseline");
    const rootRules = checked("/usr/bin/sudo", ["-n", "/sbin/pfctl", "-sr"]).output;
    fs.writeFileSync(path.join(root, "pf-root-before.txt"), rootRules);
    if (!/anchor "com\.apple\/\*"/.test(rootRules)) throw new Error("safe PF parent anchor is missing; refusing to replace the main ruleset");
    const ruleFile = path.join(root, "udp443.pf");
    fs.writeFileSync(ruleFile, "block return out quick proto udp from any to any port 443\n");
    checked("/usr/bin/sudo", ["-n", "/sbin/pfctl", "-a", anchor, "-f", ruleFile]);
    anchorLoaded = true;
    const enabled = checked("/usr/bin/sudo", ["-n", "/sbin/pfctl", "-E"]).output;
    pfToken = enabled.match(/Token\s*:\s*(\d+)/i)?.[1];
    if (!pfToken) throw new Error("PF enable reference token is missing");
    const rules = checked("/usr/bin/sudo", ["-n", "/sbin/pfctl", "-a", anchor, "-sr"]).output;
    fs.writeFileSync(path.join(root, "pf-active.txt"), rules);
    const pf_rule_active = /block.*quick.*proto udp.*port\s*(?:=\s*)?(?:443|https)\b/.test(rules);
    if (!pf_rule_active) throw new Error("temporary UDP443 block was not verified");
    const tcp = await runPhase("tcp");
    report = {
      ...metadata,
      observations: { samples, baseline: baseline.results, tcp: tcp.results, transport: { pf_rule_active, ...tcp.packets } },
    };
    report.result = summarizeIntelCloudKitProbe(report.observations);
  } finally {
    try { if (stopCapture) await stopCapture(); } catch (error) { cleanupError = error; }
    try { if (anchorLoaded) checked("/usr/bin/sudo", ["-n", "/sbin/pfctl", "-a", anchor, "-F", "rules"]); } catch (error) { cleanupError = error; }
    try { if (pfToken) checked("/usr/bin/sudo", ["-n", "/sbin/pfctl", "-X", pfToken]); } catch (error) { cleanupError = error; }
  }
  if (cleanupError) throw cleanupError;
  fs.writeFileSync(path.join(root, "report.json"), JSON.stringify(report, null, 2));
  const summary = `## Intel CloudKit TCP diagnostic\n\nVerdict: **${report.result.verdict}**\n\nDefault failures: ${report.result.baseline_failures}/${samples}; TCP failures: ${report.result.tcp_failures}/${samples}.\n\nDiagnostic only: this is not PuPu package acceptance or release evidence.\n`;
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  console.log(JSON.stringify(report.result));
  if (report.result.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runIntelCloudKitProbe().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
