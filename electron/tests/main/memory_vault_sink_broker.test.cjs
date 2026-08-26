const http = require("http");
const crypto = require("crypto");

const {
  createVaultSinkBroker,
  signVaultBrokerRequest,
  BROKER_MAX_BODY_BYTES,
  BROKER_ROUTES,
} = require("../../main/services/memory_vault/sink_broker");

const send = ({
  baseUrl,
  key,
  pathname,
  method = "POST",
  payload,
  rawBody,
  timestamp = Date.now(),
  nonce = crypto.randomBytes(16).toString("hex"),
  signature,
  contentType = "application/json",
}) =>
  new Promise((resolve, reject) => {
    const body =
      rawBody !== undefined
        ? Buffer.from(rawBody)
        : payload === undefined
          ? Buffer.alloc(0)
          : Buffer.from(JSON.stringify(payload), "utf8");
    const resolvedSignature =
      signature ||
      signVaultBrokerRequest({
        crypto,
        key,
        method,
        pathname,
        timestamp,
        nonce,
        body,
      });
    const target = new URL(pathname, baseUrl);
    const request = http.request(
      target,
      {
        method,
        headers: {
          "x-pupu-vault-timestamp": String(timestamp),
          "x-pupu-vault-nonce": nonce,
          "x-pupu-vault-signature": resolvedSignature,
          ...(method === "POST"
            ? {
                "content-type": contentType,
                "content-length": String(body.length),
              }
            : {}),
        },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            statusCode: response.statusCode,
            body: text ? JSON.parse(text) : null,
          });
        });
      },
    );
    request.on("error", reject);
    if (body.length > 0) request.write(body);
    request.end();
  });

describe("memory vault sink broker", () => {
  let broker;

  afterEach(async () => {
    if (broker) await broker.stop();
    broker = null;
  });

  const startBroker = async (overrides = {}) => {
    broker = createVaultSinkBroker({
      http,
      crypto,
      onPrepare: jest.fn(async () => ({ ok: true, status: "prepared" })),
      onExecute: jest.fn(async () => ({ ok: true, status: "complete" })),
      onCancel: jest.fn(async () => ({ ok: true, status: "cancelled" })),
      ...overrides,
    });
    return broker.start();
  };

  test("binds only an ephemeral 127.0.0.1 port and exposes child env in memory", async () => {
    const started = await startBroker();
    const parsed = new URL(started.url);
    expect(parsed.protocol).toBe("http:");
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(Number(parsed.port)).toBeGreaterThan(0);
    expect(parsed.pathname).toBe("/");
    expect(started.key).toMatch(/^[0-9a-f]{64}$/);
    expect(broker.getBootstrap()).toEqual(started);
  });

  test("authenticates method/path/timestamp/nonce/raw-body hash and rejects nonce replay", async () => {
    const onPrepare = jest.fn(async (payload) => ({
      ok: true,
      operation_id: payload.operation_id,
    }));
    const started = await startBroker({ onPrepare });
    const nonce = crypto.randomBytes(16).toString("hex");
    const payload = { operation_id: "operation-1" };
    const first = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.PREPARE,
      payload,
      nonce,
    });
    expect(first).toEqual({
      statusCode: 200,
      body: { ok: true, operation_id: "operation-1" },
    });
    expect(onPrepare).toHaveBeenCalledWith(payload);

    const replay = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.PREPARE,
      payload,
      nonce,
    });
    expect(replay.statusCode).toBe(409);
    expect(replay.body).toEqual({
      ok: false,
      error: { code: "vault_broker_replay" },
    });
    expect(onPrepare).toHaveBeenCalledTimes(1);
  });

  test("rejects forged and stale requests without poisoning their nonce", async () => {
    const now = 1900000000000;
    const onPrepare = jest.fn(async () => ({ ok: true }));
    const started = await startBroker({ onPrepare, now: () => now });
    const nonce = crypto.randomBytes(16).toString("hex");
    const payload = { operation_id: "operation-2" };
    const forged = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.PREPARE,
      payload,
      timestamp: now,
      nonce,
      signature: "0".repeat(64),
    });
    expect(forged.statusCode).toBe(401);

    const valid = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.PREPARE,
      payload,
      timestamp: now,
      nonce,
    });
    expect(valid.statusCode).toBe(200);

    const stale = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.PREPARE,
      payload,
      timestamp: now - 30001,
    });
    expect(stale.statusCode).toBe(401);
    expect(onPrepare).toHaveBeenCalledTimes(1);
  });

  test("enforces 64KiB raw bodies and JSON content type before dispatch", async () => {
    const onPrepare = jest.fn(async () => ({ ok: true }));
    const started = await startBroker({ onPrepare });
    const tooLarge = Buffer.alloc(BROKER_MAX_BODY_BYTES + 1, 0x61);
    const result = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.PREPARE,
      rawBody: tooLarge,
    });
    expect(result.statusCode).toBe(413);

    const wrongType = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.PREPARE,
      payload: {},
      contentType: "text/plain",
    });
    expect(wrongType.statusCode).toBe(400);
    expect(onPrepare).not.toHaveBeenCalled();
  });

  test("has no decrypt/read endpoint and never serializes handler messages", async () => {
    const leaked = "SECRET-MUST-NOT-LEAK";
    const started = await startBroker({
      onExecute: jest.fn(async () => {
        const error = new Error(leaked);
        error.code = "vault_sink_unavailable";
        throw error;
      }),
    });
    const missing = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: "/v1/decrypt",
      method: "GET",
    });
    expect(missing.statusCode).toBe(404);

    const failed = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.EXECUTE,
      payload: {},
    });
    expect(failed.statusCode).toBe(503);
    expect(JSON.stringify(failed.body)).not.toContain(leaked);
    expect(failed.body).toEqual({
      ok: false,
      error: { code: "vault_sink_unavailable" },
    });
  });

  test("status is authenticated and contains no key or storage metadata", async () => {
    const started = await startBroker();
    const result = await send({
      baseUrl: started.url,
      key: started.key,
      pathname: BROKER_ROUTES.STATUS,
      method: "GET",
    });
    expect(result).toEqual({
      statusCode: 200,
      body: {
        ok: true,
        protocol: "pupu.vault-sink-broker",
        version: 1,
      },
    });
    expect(JSON.stringify(result.body)).not.toContain(started.key);
  });
});
