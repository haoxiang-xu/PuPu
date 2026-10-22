import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { summarizeIntelCloudKitProbe } from "./intel-cloudkit-tcp-probe.mjs";

const successfulAttempt = (attempt) => ({
  attempt,
  staple_exit: 0,
  validate_exit: 0,
  duration_ms: 125,
  cloudkit_lookup: true,
  transient_network_failure: false,
});

const successfulProbe = (samples = 3) => ({
  samples,
  baseline: Array.from({ length: samples }, (_, index) => successfulAttempt(index + 1)),
  tcp: Array.from({ length: samples }, (_, index) => successfulAttempt(index + 1)),
  transport: { pf_rule_active: true, tcp_packets: 12, udp_packets: 0 },
});

test("supports the workaround only when baseline has a transient failed attempt and TCP has complete proof", () => {
  const payload = successfulProbe();
  Object.assign(payload.baseline[1], {
    staple_exit: 68,
    validate_exit: null,
    transient_network_failure: true,
  });

  assert.deepEqual(summarizeIntelCloudKitProbe(payload), {
    status: "passed",
    verdict: "tcp-workaround-supported",
    baseline_failures: 1,
    tcp_failures: 0,
  });
});

test("passing default and TCP samples prove TCP is usable without pretending the baseline problem reproduced", () => {
  assert.deepEqual(summarizeIntelCloudKitProbe(successfulProbe()), {
    status: "passed",
    verdict: "tcp-usable-baseline-not-reproduced",
    baseline_failures: 0,
    tcp_failures: 0,
  });
});

test("a non-network baseline failure does not establish support for the network workaround", () => {
  const payload = successfulProbe();
  Object.assign(payload.baseline[0], { staple_exit: 65, validate_exit: null });

  assert.deepEqual(summarizeIntelCloudKitProbe(payload), {
    status: "passed",
    verdict: "tcp-usable-baseline-not-reproduced",
    baseline_failures: 1,
    tcp_failures: 0,
  });
});

test("a transient marker on a successful baseline attempt is not a reproduced transient failure", () => {
  const payload = successfulProbe();
  Object.assign(payload.baseline[0], { staple_exit: 65, validate_exit: null });
  payload.baseline[1].transient_network_failure = true;

  assert.equal(summarizeIntelCloudKitProbe(payload).verdict, "tcp-usable-baseline-not-reproduced");
});

for (const [label, changes] of [
  ["stapler failure", { staple_exit: 68, validate_exit: null, transient_network_failure: true }],
  ["bounded command timeout", { staple_exit: 124, validate_exit: null, transient_network_failure: true }],
  ["ticket validation failure", { validate_exit: 65 }],
  ["skipped ticket validation", { validate_exit: null }],
]) {
  test(`TCP ${label} fails the probe even if other samples succeed`, () => {
    const payload = successfulProbe();
    Object.assign(payload.tcp[1], changes);

    assert.deepEqual(summarizeIntelCloudKitProbe(payload), {
      status: "failed",
      verdict: "tcp-probe-failed",
      baseline_failures: 0,
      tcp_failures: 1,
    });
  });
}

test("successful commands without a CloudKit lookup are incomplete rather than proven network success", () => {
  const payload = successfulProbe();
  payload.tcp[1].cloudkit_lookup = false;

  assert.deepEqual(summarizeIntelCloudKitProbe(payload), {
    status: "incomplete",
    verdict: "transport-proof-incomplete",
    baseline_failures: 0,
    tcp_failures: 0,
  });
});

for (const [label, transport] of [
  ["inactive PF rule", { pf_rule_active: false, tcp_packets: 12, udp_packets: 0 }],
  ["no observed TCP packets", { pf_rule_active: true, tcp_packets: 0, udp_packets: 0 }],
  ["UDP still observed", { pf_rule_active: true, tcp_packets: 12, udp_packets: 1 }],
]) {
  test(`${label} cannot be reported as proven TCP success`, () => {
    const payload = successfulProbe();
    payload.transport = transport;

    assert.deepEqual(summarizeIntelCloudKitProbe(payload), {
      status: "incomplete",
      verdict: "transport-proof-incomplete",
      baseline_failures: 0,
      tcp_failures: 0,
    });
  });
}

test("a real TCP attempt failure takes priority over incomplete transport proof", () => {
  const payload = successfulProbe();
  Object.assign(payload.tcp[0], { staple_exit: 68, validate_exit: null });
  payload.transport.pf_rule_active = false;

  assert.equal(summarizeIntelCloudKitProbe(payload).status, "failed");
  assert.equal(summarizeIntelCloudKitProbe(payload).verdict, "tcp-probe-failed");
});

test("counts each failed sample once, including simultaneous staple and validation failure", () => {
  const payload = successfulProbe();
  Object.assign(payload.baseline[0], { staple_exit: 68, validate_exit: 65 });
  Object.assign(payload.baseline[2], { staple_exit: 124, validate_exit: null });
  Object.assign(payload.tcp[0], { staple_exit: 68, validate_exit: 65 });
  Object.assign(payload.tcp[1], { validate_exit: 65 });

  const result = summarizeIntelCloudKitProbe(payload);
  assert.equal(result.baseline_failures, 2);
  assert.equal(result.tcp_failures, 2);
});

for (const samples of [1, 10]) {
  test(`accepts the closed sample-count boundary ${samples}`, () => {
    assert.equal(summarizeIntelCloudKitProbe(successfulProbe(samples)).status, "passed");
  });
}

test("does not mutate input evidence", () => {
  const payload = successfulProbe();
  const before = structuredClone(payload);
  summarizeIntelCloudKitProbe(payload);
  assert.deepEqual(payload, before);
});

for (const value of [null, undefined, [], "probe", 1]) {
  test(`rejects a non-object report: ${JSON.stringify(value)}`, () => {
    assert.throws(() => summarizeIntelCloudKitProbe(value));
  });
}

for (const key of ["samples", "baseline", "tcp", "transport"]) {
  test(`rejects a missing top-level ${key} field`, () => {
    const payload = successfulProbe();
    delete payload[key];
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });
}

test("rejects an unknown top-level field instead of accepting unvalidated evidence", () => {
  assert.throws(() => summarizeIntelCloudKitProbe({ ...successfulProbe(), assumed_tcp: true }));
});

for (const value of [0, 11, -1, 1.5, "3", null, Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`rejects an invalid sample count ${String(value)}`, () => {
    assert.throws(() => summarizeIntelCloudKitProbe({ ...successfulProbe(), samples: value }));
  });
}

for (const phase of ["baseline", "tcp"]) {
  for (const value of [null, {}, [], [successfulAttempt(1)]]) {
    test(`rejects a non-array or incomplete ${phase} sample set ${JSON.stringify(value)}`, () => {
      assert.throws(() => summarizeIntelCloudKitProbe({ ...successfulProbe(), [phase]: value }));
    });
  }

  test(`rejects extra ${phase} samples`, () => {
    const payload = successfulProbe();
    payload[phase].push(successfulAttempt(4));
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });

  test(`rejects holes in the ${phase} sample set instead of silently treating missing attempts as successful`, () => {
    const payload = successfulProbe();
    delete payload[phase][1];
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });

  test(`rejects duplicate or reordered ${phase} attempt identities`, () => {
    const payload = successfulProbe();
    payload[phase][1].attempt = 1;
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });
}

for (const key of Object.keys(successfulAttempt(1))) {
  test(`rejects a missing attempt ${key} field`, () => {
    const payload = successfulProbe();
    delete payload.tcp[0][key];
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });
}

test("rejects unknown attempt fields", () => {
  const payload = successfulProbe();
  payload.baseline[0].cache_hit = true;
  assert.throws(() => summarizeIntelCloudKitProbe(payload));
});

for (const [field, value] of [
  ["attempt", 1.5],
  ["attempt", "1"],
  ["staple_exit", "0"],
  ["staple_exit", null],
  ["staple_exit", 0.5],
  ["validate_exit", "0"],
  ["validate_exit", 0.5],
  ["duration_ms", -1],
  ["duration_ms", Number.POSITIVE_INFINITY],
  ["duration_ms", "125"],
  ["cloudkit_lookup", 1],
  ["cloudkit_lookup", "true"],
  ["transient_network_failure", 0],
  ["transient_network_failure", "false"],
]) {
  test(`rejects invalid attempt ${field}: ${String(value)}`, () => {
    const payload = successfulProbe();
    payload.tcp[0][field] = value;
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });
}

test("the temporary workflow runs only for its exact diagnostic branch and files", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/intel-cloudkit-tcp-probe.yml", import.meta.url), "utf8");
  const triggers = workflow.slice(workflow.search(/^on:/m), workflow.search(/^(?:permissions|concurrency|env|defaults|jobs):/m));

  assert.match(triggers, /^on:\s*\n\s{2}push:/m);
  assert.match(triggers, /branches:\s*(?:\n\s+-\s*|\[\s*)["']?codex\/intel-cloudkit-tcp-probe["']?/);
  assert.match(triggers, /paths:/);
  assert.doesNotMatch(triggers, /workflow_dispatch|workflow_run|workflow_call|pull_request|schedule|tags:/);
  assert.doesNotMatch(triggers, /branches:\s*\[?\s*["']?(?:main|dev|\*\*)["']?/);
});

test("the diagnostic workflow cannot acquire signing credentials or run the production release chain", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/intel-cloudkit-tcp-probe.yml", import.meta.url), "utf8");

  assert.match(workflow, /runs-on:\s*macos-15-intel/);
  assert.match(workflow, /permissions:\s*\n\s{2}contents:\s*read/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.doesNotMatch(workflow, /\bsecrets\s*\.|^\s*environment:|id-token:\s*write|contents:\s*write/m);
  assert.doesNotMatch(workflow, /npm\s+(?:ci|install|run)|pip\s+install|setup-node|setup-python|_shared-release|release-operator\.mjs|build:electron/);
});

test("sparse checkout includes the diagnostic module and the workflow read by its isolation tests", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/intel-cloudkit-tcp-probe.yml", import.meta.url), "utf8");
  const checkoutPaths = workflow.split("sparse-checkout:")[1]?.split(/\n\s*\n/)[0] || "";

  assert.match(checkoutPaths, /scripts\/diagnostics/);
  assert.match(checkoutPaths, /\.github\/workflows(?:\/intel-cloudkit-tcp-probe\.yml)?/);
});

for (const value of [null, [], false]) {
  test(`rejects a non-object transport report ${JSON.stringify(value)}`, () => {
    assert.throws(() => summarizeIntelCloudKitProbe({ ...successfulProbe(), transport: value }));
  });
}

for (const key of ["pf_rule_active", "tcp_packets", "udp_packets"]) {
  test(`rejects a missing transport ${key} field`, () => {
    const payload = successfulProbe();
    delete payload.transport[key];
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });
}

test("rejects unknown transport fields", () => {
  const payload = successfulProbe();
  payload.transport.assumed_tcp = true;
  assert.throws(() => summarizeIntelCloudKitProbe(payload));
});

for (const [field, value] of [
  ["pf_rule_active", "true"],
  ["pf_rule_active", 1],
  ["tcp_packets", -1],
  ["tcp_packets", 1.5],
  ["tcp_packets", "12"],
  ["udp_packets", -1],
  ["udp_packets", 0.5],
  ["udp_packets", "0"],
]) {
  test(`rejects invalid transport ${field}: ${String(value)}`, () => {
    const payload = successfulProbe();
    payload.transport[field] = value;
    assert.throws(() => summarizeIntelCloudKitProbe(payload));
  });
}
