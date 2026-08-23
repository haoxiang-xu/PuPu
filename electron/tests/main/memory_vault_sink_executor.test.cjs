const {
  createVaultSinkExecutor,
  createVaultSinkExecutors,
  VAULT_SINK_KINDS,
  VAULT_SINK_WORKER_MAX_RESPONSE_BYTES,
} = require("../../main/services/memory_vault/vault_sink_executor");
const childProcess = require("child_process");

const SECRET = "wrapper-secret +/✓";
const DATA_DIR = "/tmp/pupu-vault-worker-data";
const MCP_RUNTIME_DIR = "/tmp/pupu-mcp-runtime";

const framedChildScript = `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const frame = Buffer.concat(chunks);
  const size = frame.readUInt32BE(0);
  const request = JSON.parse(frame.subarray(4, 4 + size).toString("utf8"));
  const plaintexts = request.plaintext_bindings.map((item) => item.plaintext);
  process.stderr.write(plaintexts.join(""));
  const result = {
    ok: true,
    sink_kind: request.sink_kind,
    result: {
      pid: process.pid,
      version: request.version,
      fields: request.plaintext_bindings.map((item) => item.field),
      plaintext_lengths: plaintexts.map((item) => Buffer.byteLength(item, "utf8")),
      audit_arguments: request.audit_arguments,
      toolkit_metadata: request.toolkit_metadata,
      env_keys: Object.keys(process.env).sort(),
      data_dir: process.env.UNCHAIN_DATA_DIR,
      argv_has_plaintext: plaintexts.some((value) => process.argv.some((arg) => arg.includes(value))),
      env_has_plaintext: plaintexts.some((value) => Object.values(process.env).some((item) => item.includes(value))),
    },
  };
  const body = Buffer.from(JSON.stringify(result), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
});
`;

const responseChildScript = (responseExpression, suffixExpression = 'Buffer.alloc(0)') => `
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const requestFrame = Buffer.concat(chunks);
  const size = requestFrame.readUInt32BE(0);
  const request = JSON.parse(requestFrame.subarray(4, 4 + size).toString("utf8"));
  const response = ${responseExpression};
  const body = Buffer.from(JSON.stringify(response), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body, ${suffixExpression}]));
});
`;

const descendantChildScript = `
const childProcess = require("child_process");
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const frame = Buffer.concat(chunks);
  const size = frame.readUInt32BE(0);
  const request = JSON.parse(frame.subarray(4, 4 + size).toString("utf8"));
  const descendant = childProcess.spawn("/bin/sleep", ["30"], {stdio: "ignore"});
  descendant.unref();
  const response = {
    ok: true,
    sink_kind: request.sink_kind,
    result: {descendant_pid: descendant.pid},
  };
  const body = Buffer.from(JSON.stringify(response), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  process.stdout.end(Buffer.concat([header, body]));
});
`;

const entrypoint = (script) => ({
  command: process.execPath,
  args: ["-e", script],
  cwd: null,
  dataDir: DATA_DIR,
  mcpRuntimeDir: MCP_RUNTIME_DIR,
});

const shellPayload = () => ({
  intentId: "pvi1_0123456789abcdef0123456789abcdef",
  interactionId: "interaction-1",
  ownerChatId: "chat-1",
  sessionId: "session-1",
  attemptId: "attempt-1",
  runId: "run-1",
  callId: "call-1",
  sinkKind: "shell_secret_env",
  auditArguments: {
    action: "run",
    command: "printenv TOKEN",
    run_in_background: false,
    secret_fields: ["TOKEN"],
  },
  targetHash: "a".repeat(64),
  schemaFingerprint: "",
  secrets: [{ field: "TOKEN", plaintext: SECRET }],
});

const mcpPayload = () => ({
  ...shellPayload(),
  sinkKind: "mcp_schema_secret",
  auditArguments: {
    channel: "alerts",
    toolkit_id: "mcp.example.secure",
    tool_name: "deliver",
    secret_fields: ["token"],
  },
  schemaFingerprint: "f".repeat(64),
  secrets: [{ field: "token", plaintext: SECRET }],
});

describe("memory vault sink executor", () => {
  test("uses one framed process, stdin-only plaintext, and a minimal worker env", async () => {
    const environmentSource = {
      PATH: process.env.PATH || "/usr/bin:/bin",
      LANG: "en_US.UTF-8",
      PUPU_VAULT_SINK_BROKER_KEY: "must-not-propagate",
      PUPU_VAULT_SINK_BROKER_URL: "http://127.0.0.1:1",
      UNRELATED_SECRET: SECRET,
    };
    const spawn = jest.fn((...spawnArguments) =>
      childProcess.spawn(...spawnArguments),
    );
    const executor = createVaultSinkExecutor({
      ...entrypoint(framedChildScript),
      environmentSource,
      timeoutMs: 5000,
      spawn,
    });

    const first = await executor(shellPayload());
    const second = await executor(shellPayload());

    expect(first.ok).toBe(true);
    expect(first.result).toMatchObject({
      version: 1,
      fields: ["TOKEN"],
      plaintext_lengths: [Buffer.byteLength(SECRET, "utf8")],
      data_dir: DATA_DIR,
      argv_has_plaintext: false,
      env_has_plaintext: false,
    });
    expect(first.result.env_keys).toEqual(
      expect.arrayContaining([
        "LANG",
        "PATH",
        "PUPU_MCP_RUNTIME_DIR",
        "UNCHAIN_DATA_DIR",
      ]),
    );
    expect(first.result.env_keys).not.toContain("PUPU_VAULT_SINK_BROKER_KEY");
    expect(first.result.env_keys).not.toContain("PUPU_VAULT_SINK_BROKER_URL");
    expect(first.result.env_keys).not.toContain("UNRELATED_SECRET");
    const spawnOptions = spawn.mock.calls[0][2];
    expect({ ...spawnOptions.env }).toEqual({
      LANG: "en_US.UTF-8",
      PATH: environmentSource.PATH,
      PUPU_MCP_RUNTIME_DIR: MCP_RUNTIME_DIR,
      UNCHAIN_DATA_DIR: DATA_DIR,
    });
    expect(spawnOptions).toMatchObject({
      shell: false,
      stdio: ["pipe", "pipe", "ignore"],
    });
    expect(first.result.pid).not.toBe(second.result.pid);
    expect(JSON.stringify(first)).not.toContain(SECRET);
  });

  test("derives exact MCP toolkit metadata without forwarding service identity", async () => {
    const resolveEntrypoint = jest.fn(async () => entrypoint(framedChildScript));
    const executor = createVaultSinkExecutor({
      resolveEntrypoint,
      environmentSource: {},
      timeoutMs: 5000,
    });

    const response = await executor(mcpPayload());

    expect(resolveEntrypoint).toHaveBeenCalledTimes(1);
    expect(response.result.audit_arguments).toEqual(
      mcpPayload().auditArguments,
    );
    expect(response.result.toolkit_metadata).toEqual({
      toolkit_id: "mcp.example.secure",
      tool_name: "deliver",
      secret_fields: ["token"],
      schema_fingerprint: "f".repeat(64),
    });
    expect(response.result.audit_arguments).not.toHaveProperty("intentId");
    expect(response.result.audit_arguments).not.toHaveProperty("targetHash");
  });

  test("returns a closed executor registry for all reviewed sink kinds", () => {
    const registry = createVaultSinkExecutors({
      ...entrypoint(framedChildScript),
      environmentSource: {},
    });

    expect(Object.isFrozen(registry)).toBe(true);
    expect(typeof registry.close).toBe("function");
    expect(registry.activeChildCount()).toBe(0);
    expect(registry.isClosed()).toBe(false);

    const executors = registry.executors;
    expect(Object.keys(executors).sort()).toEqual([...VAULT_SINK_KINDS].sort());
    expect(new Set(Object.values(executors)).size).toBe(1);
    expect(Object.isFrozen(executors)).toBe(true);
  });

  test("registry tracks live worker process groups and empties on every terminal path", async () => {
    const registry = createVaultSinkExecutors({
      ...entrypoint(framedChildScript),
      environmentSource: {},
      timeoutMs: 5000,
    });

    const pending = registry.executors.shell_secret_env(shellPayload());
    // Tracked while in flight, released once the worker reaches its terminal
    // path — otherwise close() would grow unboundedly across a long session.
    expect(registry.activeChildCount()).toBe(1);
    await expect(pending).resolves.toMatchObject({ ok: true });
    expect(registry.activeChildCount()).toBe(0);

    const failing = createVaultSinkExecutors({
      ...entrypoint("process.stdin.resume();process.exit(3);"),
      environmentSource: {},
      timeoutMs: 5000,
    });
    await expect(
      failing.executors.shell_secret_env(shellPayload()),
    ).rejects.toMatchObject({ code: "vault_worker_failed" });
    expect(failing.activeChildCount()).toBe(0);
  });

  test("close() synchronously kills every tracked process group and empties the registry", async () => {
    if (process.platform === "win32") return;
    // A worker that accepts the frame and then hangs — the exact shape that
    // will-quit has to reap, because no terminal path will ever run.
    const registry = createVaultSinkExecutors({
      ...entrypoint("process.stdin.resume();setTimeout(()=>{},60000);"),
      environmentSource: {},
      timeoutMs: 20000,
    });

    const pending = registry.executors.shell_secret_env(shellPayload());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(registry.activeChildCount()).toBe(1);

    // Synchronous: will-quit does not await promises.
    const terminated = registry.close();
    expect(terminated).toBe(1);
    expect(registry.activeChildCount()).toBe(0);
    expect(registry.isClosed()).toBe(true);

    await expect(pending).rejects.toMatchObject({
      message: expect.not.stringContaining(SECRET),
    });

    // A drained registry never frames plaintext again.
    const spawn = jest.fn();
    const closedRegistry = createVaultSinkExecutors({
      ...entrypoint(framedChildScript),
      environmentSource: {},
      spawn,
    });
    closedRegistry.close();
    await expect(
      closedRegistry.executors.shell_secret_env(shellPayload()),
    ).rejects.toMatchObject({
      code: "vault_worker_unavailable",
      message: expect.not.stringContaining(SECRET),
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test("close() is idempotent and safe with nothing in flight", () => {
    const registry = createVaultSinkExecutors({
      ...entrypoint(framedChildScript),
      environmentSource: {},
    });
    expect(registry.close()).toBe(0);
    expect(registry.close()).toBe(0);
    expect(registry.activeChildCount()).toBe(0);
  });

  test("rejects malformed, trailing, oversized, and secret-bearing responses", async () => {
    const cases = [
      {
        script: "process.stdin.resume();process.stdin.on('end',()=>process.stdout.write(Buffer.from([0,0,0,5,123])));",
        code: "vault_worker_protocol_error",
      },
      {
        script: responseChildScript(
          "({ok:true,sink_kind:request.sink_kind,result:{status:'safe'}})",
          "Buffer.from('x')",
        ),
        code: "vault_worker_protocol_error",
      },
      {
        script: `process.stdin.resume();process.stdin.on('end',()=>{const h=Buffer.alloc(4);h.writeUInt32BE(${VAULT_SINK_WORKER_MAX_RESPONSE_BYTES + 1},0);process.stdout.write(h);});`,
        code: "vault_worker_protocol_error",
      },
      {
        script: responseChildScript(
          "({ok:true,sink_kind:request.sink_kind,result:{echo:request.plaintext_bindings[0].plaintext}})",
        ),
        code: "vault_worker_secret_leak",
      },
      {
        script: responseChildScript(
          "({ok:true,sink_kind:request.sink_kind,result:{echo:[...Buffer.from(request.plaintext_bindings[0].plaintext)].map(b=>'%'+b.toString(16).padStart(2,'0')).join('')}})",
        ),
        code: "vault_worker_secret_leak",
      },
      {
        script: responseChildScript(
          "({ok:true,sink_kind:request.sink_kind,result:{echo:request.plaintext_bindings[0].plaintext.replace('✓',String.fromCharCode(92)+'u2713')}})",
        ),
        code: "vault_worker_secret_leak",
      },
    ];

    for (const item of cases) {
      const executor = createVaultSinkExecutor({
        ...entrypoint(item.script),
        environmentSource: {},
        timeoutMs: 5000,
      });
      await expect(executor(shellPayload())).rejects.toMatchObject({
        code: item.code,
        message: expect.not.stringContaining(SECRET),
      });
    }
  });

  test("maps worker failures to static codes and kills timed-out workers", async () => {
    const failureExecutor = createVaultSinkExecutor({
      ...entrypoint(
        responseChildScript(
          "({ok:false,error:{code:'vault_mcp_schema_mismatch'}})",
        ),
      ),
      environmentSource: {},
      timeoutMs: 5000,
    });
    await expect(failureExecutor(shellPayload())).rejects.toMatchObject({
      code: "vault_mcp_schema_mismatch",
      message: "[vault_mcp_schema_mismatch] vault sink worker failed",
    });

    const timeoutExecutor = createVaultSinkExecutor({
      ...entrypoint("process.stdin.resume();setTimeout(()=>{},10000);"),
      environmentSource: {},
      timeoutMs: 1000,
    });
    const started = Date.now();
    await expect(timeoutExecutor(shellPayload())).rejects.toMatchObject({
      code: "vault_worker_timeout",
      message: expect.not.stringContaining(SECRET),
    });
    expect(Date.now() - started).toBeLessThan(4000);
  });

  test("cleans the detached worker process group after a valid response", async () => {
    if (process.platform === "win32") return;
    const executor = createVaultSinkExecutor({
      ...entrypoint(descendantChildScript),
      environmentSource: {},
      timeoutMs: 5000,
    });

    const response = await executor(shellPayload());
    const descendantPid = response.result.descendant_pid;
    let state = "";
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const status = childProcess.spawnSync(
        "ps",
        ["-p", String(descendantPid), "-o", "stat="],
        { encoding: "utf8" },
      );
      state = String(status.stdout || "").trim();
      if (status.status !== 0 || !state || state.startsWith("Z")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(!state || state.startsWith("Z")).toBe(true);
  });

  test("handles lone surrogates without crashing secret-leak detection", async () => {
    const executor = createVaultSinkExecutor({
      ...entrypoint(framedChildScript),
      environmentSource: {},
      timeoutMs: 5000,
    });
    const payload = shellPayload();
    payload.secrets = [{ field: "TOKEN", plaintext: "\ud800" }];

    const response = await executor(payload);

    expect(response.ok).toBe(true);
    expect(response.result.plaintext_lengths).toEqual([3]);
    expect(JSON.stringify(response)).not.toContain("\\ud800");

    const leakingExecutor = createVaultSinkExecutor({
      ...entrypoint(
        responseChildScript(
          "({ok:true,sink_kind:request.sink_kind,result:{echo:request.plaintext_bindings[0].plaintext}})",
        ),
      ),
      environmentSource: {},
      timeoutMs: 5000,
    });
    await expect(leakingExecutor(payload)).rejects.toMatchObject({
      code: "vault_worker_secret_leak",
    });
  });

  test("fails closed on Windows before spawning until tree containment exists", async () => {
    const spawn = jest.fn();
    const executor = createVaultSinkExecutor({
      ...entrypoint(framedChildScript),
      environmentSource: {},
      platform: "win32",
      spawn,
    });

    await expect(executor(shellPayload())).rejects.toMatchObject({
      code: "vault_worker_containment_unavailable",
      message: expect.not.stringContaining(SECRET),
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test("rejects plaintext or encoded plaintext in audit data before spawn", async () => {
    const spawn = jest.fn();
    const executor = createVaultSinkExecutor({
      ...entrypoint(framedChildScript),
      environmentSource: {},
      spawn,
    });
    const payload = shellPayload();
    payload.auditArguments.note = Buffer.from(SECRET, "utf8").toString("base64");

    await expect(executor(payload)).rejects.toMatchObject({
      code: "vault_audit_contains_plaintext",
      message: expect.not.stringContaining(SECRET),
    });
    expect(spawn).not.toHaveBeenCalled();
  });

  test("rejects relative or NUL-bearing MCP runtime paths", () => {
    for (const mcpRuntimeDir of ["relative/runtime", "/tmp/runtime\0escape"]) {
      expect(() =>
        createVaultSinkExecutor({
          ...entrypoint(framedChildScript),
          mcpRuntimeDir,
          environmentSource: {},
        }),
      ).toThrow(
        expect.objectContaining({ code: "vault_worker_unavailable" }),
      );
    }
  });

  // The leak check no longer carries its own encoding list — it consumes the
  // shared generator, so a worker that base64url-encodes (unpadded) or
  // upper-cases its hex is caught here exactly as the Vault service's result
  // redaction and the deposit label guard would catch it.
  describe("shared encoding coverage (secret_variants)", () => {
    const leakingExecutorFor = (encodeExpression) =>
      createVaultSinkExecutor({
        ...entrypoint(
          responseChildScript(
            `({ok:true,sink_kind:request.sink_kind,result:{echo:${encodeExpression}}})`,
          ),
        ),
        environmentSource: {},
        timeoutMs: 5000,
      });

    const P = "request.plaintext_bindings[0].plaintext";
    const encodings = {
      raw: P,
      base64: `Buffer.from(${P},"utf8").toString("base64")`,
      base64Unpadded: `Buffer.from(${P},"utf8").toString("base64").replace(/=+$/,"")`,
      base64url: `Buffer.from(${P},"utf8").toString("base64url")`,
      base64urlUnpadded: `Buffer.from(${P},"utf8").toString("base64url").replace(/=+$/,"")`,
      hexLower: `Buffer.from(${P},"utf8").toString("hex")`,
      hexUpper: `Buffer.from(${P},"utf8").toString("hex").toUpperCase()`,
      uriComponent: `encodeURIComponent(${P})`,
      formEncoded: `encodeURIComponent(${P}).replace(/%20/g,"+")`,
      fullPercent: `[...Buffer.from(${P},"utf8")].map((b)=>"%"+b.toString(16).padStart(2,"0")).join("")`,
      embedded: `("prefix "+${P}+" suffix")`,
    };

    for (const [name, expression] of Object.entries(encodings)) {
      test(`detects a ${name}-encoded secret in the worker response`, async () => {
        await expect(leakingExecutorFor(expression)(shellPayload())).rejects.toMatchObject(
          { code: "vault_worker_secret_leak" },
        );
      });
    }

    test("a response with no secret in any encoding still succeeds", async () => {
      const executor = createVaultSinkExecutor({
        ...entrypoint(
          responseChildScript(
            '({ok:true,sink_kind:request.sink_kind,result:{echo:"delivered to #alerts"}})',
          ),
        ),
        environmentSource: {},
        timeoutMs: 5000,
      });
      const response = await executor(shellPayload());
      expect(response.ok).toBe(true);
      expect(response.result.echo).toBe("delivered to #alerts");
    });

    test("lone surrogates are safe in every shared variant, and still detected", async () => {
      const {
        secretVariants,
        containsAnySecret,
        redactVariants,
      } = require("../../main/services/memory_vault/secret_variants");

      // A lone high surrogate, a lone low surrogate, and a mixed string: none
      // may throw while generating variants (encodeURIComponent would).
      for (const hostile of ["\ud800", "\udfff", "a\ud800b", "\ud800\ud800"]) {
        let variants;
        expect(() => {
          variants = secretVariants([hostile]);
        }).not.toThrow();
        expect(variants.length).toBeGreaterThan(0);
        expect(variants.every((variant) => variant.length > 0)).toBe(true);
        // Sorted longest-first so redaction cannot chop a long variant apart.
        for (let i = 1; i < variants.length; i += 1) {
          expect(variants[i - 1].length).toBeGreaterThanOrEqual(
            variants[i].length,
          );
        }
        // The bytes a child runtime actually observes are still covered.
        const utf8Hex = Buffer.from(hostile, "utf8").toString("hex");
        expect(containsAnySecret(`out=${utf8Hex}`, [hostile])).toBe(true);
        expect(redactVariants(`out=${utf8Hex}`, variants)).not.toContain(
          utf8Hex,
        );
      }
    });

    test("variants are deduplicated, never empty, and cover NFC/NFKC forms", () => {
      const {
        secretVariants,
        containsAnySecret,
      } = require("../../main/services/memory_vault/secret_variants");

      // "é" as base letter + combining acute (NFD) vs precomposed (NFC).
      const decomposed = "clé";
      const precomposed = "clé";
      expect(containsAnySecret(`key=${precomposed}`, [decomposed])).toBe(true);

      // NFKC folds compatibility forms (fullwidth "ａ" → "a").
      expect(containsAnySecret("value=abc", ["ａbc"])).toBe(true);

      const variants = secretVariants(["secret"]);
      expect(new Set(variants).size).toBe(variants.length);
      expect(variants).not.toContain("");

      // Empty / non-string inputs are skipped rather than producing an
      // empty variant that would match every string.
      expect(secretVariants(["", null, undefined, 42])).toEqual([]);
      expect(containsAnySecret("anything at all", [""])).toBe(false);
    });

    test("comparison is case-insensitive but does not match on case alone", () => {
      const { containsAnySecret } = require("../../main/services/memory_vault/secret_variants");
      // A transport that upper-cased the secret must not slip through.
      expect(containsAnySecret("TOKEN=SK-LIVE-ABC", ["sk-live-abc"])).toBe(true);
      // …while an unrelated value is still not a match.
      expect(containsAnySecret("TOKEN=SK-TEST-XYZ", ["sk-live-abc"])).toBe(false);
    });
  });
});
