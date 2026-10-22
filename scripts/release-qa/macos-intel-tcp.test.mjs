import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runMacosIntelTcp, shouldEnableMacosIntelTcp } from "./macos-intel-tcp.mjs";

const hosted = {
  GITHUB_ACTIONS: "true", RUNNER_ENVIRONMENT: "github-hosted",
  GITHUB_REPOSITORY: "haoxiang-xu/PuPu", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "2",
};

function fixture(overrides = {}) {
  const events = [];
  const signals = new EventEmitter();
  const executePf = async (args, input) => {
    events.push({ kind: "pf", args, input });
    if (args[0] === "-sr") return { status: 0, stdout: 'anchor "com.apple/*" all\n' };
    if (args[0] === "-E") return { status: 0, stderr: "pf enabled\nToken : 314159\n" };
    if (args.at(-1) === "-sr") return { status: 0, stdout: "block return out quick proto udp from any to any port = 443\n" };
    return { status: 0, stdout: "" };
  };
  const spawnCommand = (command, args, options) => {
    events.push({ kind: "spawn", command, args, options });
    const child = new EventEmitter();
    child.pid = 4242;
    queueMicrotask(() => child.emit("close", 0, null));
    return child;
  };
  return {
    events, signals,
    options: {
      command: "npm", args: ["run", "build"], platform: "darwin", arch: "x64", env: hosted,
      executePf, spawnCommand, signals,
      killGroup: () => assert.fail("a successful child must not receive cancellation"),
      ...overrides,
    },
  };
}

test("only the exact hosted Intel repository context enables the workaround", () => {
  assert.equal(shouldEnableMacosIntelTcp({ platform: "darwin", arch: "x64", env: hosted }), true);
  for (const change of [
    { platform: "linux" }, { platform: "win32" }, { arch: "arm64" },
    { env: { ...hosted, GITHUB_ACTIONS: "false" } },
    { env: { ...hosted, RUNNER_ENVIRONMENT: "self-hosted" } },
    { env: { ...hosted, GITHUB_REPOSITORY: "other/PuPu" } },
  ]) {
    assert.equal(shouldEnableMacosIntelTcp({ platform: "darwin", arch: "x64", env: hosted, ...change }), false);
  }
});

test("creates a scoped PF rule, runs the exact command, then flushes only its rule and enable reference", async () => {
  const f = fixture();
  assert.deepEqual(await runMacosIntelTcp(f.options), { status: 0, enabled: true });
  const calls = f.events.filter((event) => event.kind === "pf");
  assert.deepEqual(calls[0].args, ["-sr"]);
  const anchor = calls[1].args[1];
  assert.match(anchor, /^com\.apple\/pupu-intel-tcp-123-2-[a-zA-Z0-9-]+$/);
  assert.deepEqual(calls[1].args, ["-a", anchor, "-f", "-"]);
  assert.equal(calls[1].input, "block return out quick proto udp from any to any port 443\n");
  assert.deepEqual(calls[2].args, ["-E"]);
  assert.deepEqual(calls[3].args, ["-a", anchor, "-sr"]);
  assert.deepEqual(calls[4].args, ["-a", anchor, "-F", "rules"]);
  assert.deepEqual(calls[5].args, ["-X", "314159"]);
  assert.equal(f.events.findIndex((event) => event.kind === "spawn"), 4);
  const invocation = f.events[4];
  assert.equal(invocation.command, "npm");
  assert.deepEqual(invocation.args, ["run", "build"]);
  assert.equal(invocation.options.detached, true);
  assert.equal(invocation.options.stdio, "inherit");
  assert.equal(f.signals.listenerCount("SIGINT"), 0);
  assert.equal(f.signals.listenerCount("SIGTERM"), 0);
});

test("unsupported contexts pass the command through without invoking any privileged operation", async () => {
  const f = fixture({ arch: "arm64", executePf: () => assert.fail("no PF outside hosted Intel") });
  assert.deepEqual(await runMacosIntelTcp(f.options), { status: 0, enabled: false });
  assert.deepEqual(f.events.map((event) => event.kind), ["spawn"]);
});

test("each invocation owns a distinct direct child anchor even within one run attempt", async () => {
  const first = fixture();
  const second = fixture();
  await runMacosIntelTcp(first.options);
  await runMacosIntelTcp(second.options);
  assert.notEqual(first.events[1].args[1], second.events[1].args[1]);
});

for (const field of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) {
  for (const value of [undefined, "", "0", "-1", "1;false", "1/2"]) {
    test(`fails closed before PF for an invalid ${field}: ${String(value)}`, async () => {
      const f = fixture({ env: { ...hosted, [field]: value } });
      await assert.rejects(() => runMacosIntelTcp(f.options));
      assert.deepEqual(f.events, []);
      assert.equal(f.signals.listenerCount("SIGINT"), 0);
      assert.equal(f.signals.listenerCount("SIGTERM"), 0);
    });
  }
}

test("missing parent anchor fails closed without replacing the main ruleset or starting the command", async () => {
  const calls = [];
  const f = fixture({ executePf: async (args) => { calls.push(args); return { status: 0, stdout: "" }; } });
  await assert.rejects(() => runMacosIntelTcp(f.options), /anchor/i);
  assert.deepEqual(calls, [["-sr"]]);
  assert.equal(f.events.length, 0);
});

for (const kind of ["scrub-anchor", "nat-anchor", "rdr-anchor"]) {
  test(`${kind} is not a usable filter parent anchor`, async () => {
    const f = fixture({ executePf: async () => ({ status: 0, stdout: `${kind} "com.apple/*" all\n` }) });
    await assert.rejects(() => runMacosIntelTcp(f.options), /anchor/i);
    assert.deepEqual(f.events, []);
  });
}

for (const failurePoint of ["load", "enable", "verify"]) {
  test(`cleans its own partial PF setup after ${failurePoint} failure`, async () => {
    const f = fixture();
    const normalPf = f.options.executePf;
    f.options.executePf = async (args, input) => {
      const result = await normalPf(args, input);
      if (failurePoint === "load" && args.includes("-f")
          || failurePoint === "enable" && args[0] === "-E"
          || failurePoint === "verify" && args[0] === "-a" && args.at(-1) === "-sr") {
        return { ...result, status: 1 };
      }
      return result;
    };
    await assert.rejects(() => runMacosIntelTcp(f.options));
    assert.equal(f.events.some((event) => event.kind === "spawn"), false);
    assert.equal(f.events.some((event) => event.args?.includes("-F")), true);
    assert.equal(f.events.some((event) => event.args?.[0] === "-X"), failurePoint !== "load");
    assert.equal(f.signals.listenerCount("SIGTERM"), 0);
  });
}

test("missing enable token fails closed without guessing a global disable operation", async () => {
  const f = fixture();
  const normalPf = f.options.executePf;
  f.options.executePf = async (args, input) => args[0] === "-E"
    ? (f.events.push({ kind: "pf", args, input }), { status: 0, stdout: "pf enabled" })
    : normalPf(args, input);
  await assert.rejects(() => runMacosIntelTcp(f.options), /token/i);
  assert.equal(f.events.some((event) => event.kind === "spawn"), false);
  assert.equal(f.events.some((event) => event.args?.includes("-d")), false);
  assert.equal(f.events.some((event) => event.args?.includes("-F")), true);
});

for (const rule of [
  "block return in quick proto udp from any to any port = 443\n",
  "block return out quick proto udp from any to any port = 8443\n",
  "block return out proto udp from any to any port = 443\n",
  "block return out quick proto udp from any to 192.0.2.1 port = 443\n",
]) {
  test(`refuses an ineffective rule readback: ${rule.trim()}`, async () => {
    const f = fixture();
    const normalPf = f.options.executePf;
    f.options.executePf = async (args, input) => {
      const result = await normalPf(args, input);
      return args[0] === "-a" && args.at(-1) === "-sr" ? { ...result, stdout: rule } : result;
    };
    await assert.rejects(() => runMacosIntelTcp(f.options), /verified/i);
    assert.equal(f.events.some((event) => event.kind === "spawn"), false);
    assert.deepEqual(f.events.at(-1).args, ["-X", "314159"]);
  });
}

for (const args of ["not-an-array", ["ok", 1], [null], [undefined], Array(1)]) {
  test(`rejects an invalid argument vector before PF: ${JSON.stringify(args)}`, async () => {
    const f = fixture({ args });
    await assert.rejects(() => runMacosIntelTcp(f.options), /arguments/i);
    assert.deepEqual(f.events, []);
  });
}

for (const throwing of [false, true]) {
  test(`cleans PF after a child ${throwing ? "spawn exception" : "nonzero exit"}`, async () => {
    const f = fixture({ spawnCommand: () => {
      if (throwing) throw new Error("test spawn failure");
      const child = new EventEmitter();
      child.pid = 4242;
      queueMicrotask(() => child.emit("close", 7, null));
      return child;
    } });
    if (throwing) await assert.rejects(() => runMacosIntelTcp(f.options), /spawn failure/);
    else assert.equal((await runMacosIntelTcp(f.options)).status, 7);
    assert.deepEqual(f.events.at(-2).args.slice(2), ["-F", "rules"]);
    assert.deepEqual(f.events.at(-1).args, ["-X", "314159"]);
    assert.equal(f.signals.listenerCount("SIGTERM"), 0);
  });
}

for (const failurePoint of ["flush", "release"]) {
  test(`a cleanup ${failurePoint} failure cannot be reported as successful`, async () => {
    const f = fixture();
    const normalPf = f.options.executePf;
    f.options.executePf = async (args, input) => {
      const result = await normalPf(args, input);
      if (failurePoint === "flush" && args.includes("-F") || failurePoint === "release" && args[0] === "-X") {
        return { ...result, status: 1, stderr: "test cleanup failure" };
      }
      return result;
    };
    await assert.rejects(() => runMacosIntelTcp(f.options), /cleanup/i);
    assert.deepEqual(f.events.at(-1).args, ["-X", "314159"]);
    assert.equal(f.signals.listenerCount("SIGTERM"), 0);
  });
}

for (const [signal, status] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  test(`${signal} forwards to the whole child process group, cleans PF, and returns ${status}`, async () => {
    const f = fixture();
    let child;
    const forwarded = [];
    f.options.spawnCommand = () => {
      child = new EventEmitter();
      child.pid = 4242;
      queueMicrotask(() => f.signals.emit(signal));
      return child;
    };
    f.options.killGroup = (pid, forwardedSignal) => {
      forwarded.push([pid, forwardedSignal]);
      queueMicrotask(() => child.emit("close", null, forwardedSignal));
    };
    assert.deepEqual(await runMacosIntelTcp(f.options), { status, enabled: true });
    assert.deepEqual(forwarded, [[4242, signal], [4242, "SIGKILL"]]);
    assert.deepEqual(f.events.at(-1).args, ["-X", "314159"]);
    assert.equal(f.signals.listenerCount(signal), 0);
  });
}

test("cancellation escalates an uncooperative child group after a bounded grace period, then cleans PF", { timeout: 1000 }, async () => {
  const f = fixture({ cancellationGraceMs: 5 });
  const forwarded = [];
  let child;
  f.options.spawnCommand = () => {
    child = new EventEmitter();
    child.pid = 4242;
    queueMicrotask(() => f.signals.emit("SIGTERM"));
    return child;
  };
  f.options.killGroup = (pid, signal) => {
    forwarded.push([pid, signal]);
    if (signal === "SIGKILL") queueMicrotask(() => child.emit("close", null, signal));
  };

  assert.deepEqual(await runMacosIntelTcp(f.options), { status: 143, enabled: true });
  assert.deepEqual(forwarded, [[4242, "SIGTERM"], [4242, "SIGKILL"]]);
  assert.deepEqual(f.events.at(-1).args, ["-X", "314159"]);
  assert.equal(f.signals.listenerCount("SIGTERM"), 0);
});

test("cancellation during setup does not start a build and cleans the loaded anchor", async () => {
  const f = fixture();
  const normalPf = f.options.executePf;
  f.options.executePf = async (args, input) => {
    const result = await normalPf(args, input);
    if (args.includes("-f")) f.signals.emit("SIGTERM");
    return result;
  };
  assert.equal((await runMacosIntelTcp(f.options)).status, 143);
  assert.equal(f.events.some((event) => event.kind === "spawn" || event.args?.[0] === "-E"), false);
  assert.deepEqual(f.events.at(-1).args.slice(2), ["-F", "rules"]);
});

const cli = fileURLToPath(new URL("./macos-intel-tcp.mjs", import.meta.url));
const localEnv = { ...process.env, GITHUB_ACTIONS: "false" };

test("real CLI pass-through preserves exact arguments and exit status without privileges", () => {
  const result = spawnSync(process.execPath, [cli, "--", process.execPath, "-e", "console.log(JSON.stringify(process.argv.slice(1))); process.exit(7)", "spaces stay together", "$(not-a-shell)"], {
    encoding: "utf8", env: localEnv, timeout: 10_000,
  });
  assert.equal(result.status, 7);
  assert.deepEqual(JSON.parse(result.stdout.trim()), ["spaces stay together", "$(not-a-shell)"]);
});

test("real CLI refuses a missing separator or command", () => {
  for (const args of [[], ["--"], [process.execPath, "-e", "process.exit(0)"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env: localEnv, timeout: 10_000 });
    assert.notEqual(result.status, 0);
  }
});

for (const [signal, status] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  test(`real CLI ${signal} also terminates a command grandchild`, { timeout: 15_000, skip: process.platform === "win32" }, async () => {
    const command = [
      'const {spawn}=require("node:child_process");',
      'const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});',
      'process.on("SIGINT",()=>child.once("close",()=>process.exit(0)));',
      'process.on("SIGTERM",()=>child.once("close",()=>process.exit(0)));',
      'console.log(JSON.stringify({grandchild:child.pid})); setInterval(()=>{},1000);',
    ].join("");
    const wrapper = spawn(process.execPath, [cli, "--", process.execPath, "-e", command], { env: localEnv, stdio: ["ignore", "pipe", "pipe"] });
    let grandchild;
    try {
      grandchild = await new Promise((resolve, reject) => {
        let output = "";
        wrapper.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("\n")) resolve(JSON.parse(output.split("\n")[0]).grandchild);
        });
        wrapper.once("error", reject);
        wrapper.once("close", (code) => reject(new Error(`wrapper exited before readiness: ${code}`)));
      });
      const finished = new Promise((resolve) => wrapper.once("close", (code) => resolve(code)));
      wrapper.kill(signal);
      assert.equal(await finished, status);
      assert.throws(() => process.kill(grandchild, 0), { code: "ESRCH" });
    } finally {
      if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL");
      if (grandchild) {
        try { process.kill(grandchild, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
  });
}

for (const [signal, status] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  test(`real CLI kills an ignoring grandchild even if its leader exits immediately on ${signal}`, { timeout: 15_000, skip: process.platform === "win32" }, async () => {
    const grandchildCode = 'process.on("SIGINT",()=>{});process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000);';
    const command = [
      'const {spawn}=require("node:child_process");',
      `const child=spawn(process.execPath,["-e",${JSON.stringify(grandchildCode)}],{stdio:["ignore","pipe","ignore"]});`,
      'process.on("SIGINT",()=>process.exit(0));process.on("SIGTERM",()=>process.exit(0));',
      'child.stdout.once("data",()=>console.log(JSON.stringify({grandchild:child.pid}))); setInterval(()=>{},1000);',
    ].join("");
    const wrapper = spawn(process.execPath, [cli, "--", process.execPath, "-e", command], { env: localEnv, stdio: ["ignore", "pipe", "pipe"] });
    let grandchild;
    try {
      grandchild = await new Promise((resolve, reject) => {
        let output = "";
        wrapper.stdout.on("data", (chunk) => {
          output += chunk;
          if (output.includes("\n")) resolve(JSON.parse(output.split("\n")[0]).grandchild);
        });
        wrapper.once("error", reject);
        wrapper.once("close", (code) => reject(new Error(`wrapper exited before readiness: ${code}`)));
      });
      const finished = new Promise((resolve) => wrapper.once("close", (code) => resolve(code)));
      wrapper.kill(signal);
      assert.equal(await finished, status);
      const until = Date.now() + 1000;
      let alive = true;
      while (alive && Date.now() < until) {
        try { process.kill(grandchild, 0); } catch (error) { if (error.code === "ESRCH") alive = false; else throw error; }
        if (alive) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(alive, false, "cancelled build left an ignoring grandchild alive");
    } finally {
      if (wrapper.exitCode === null && wrapper.signalCode === null) wrapper.kill("SIGKILL");
      if (grandchild) {
        try { process.kill(grandchild, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }
    }
  });
}
