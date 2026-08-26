// Memory V2 P0 — authenticated loopback transport for one-time Vault use.
//
// This module deliberately knows nothing about decryption or tool execution.
// It only owns a process-local HTTP listener and authenticates requests before
// handing their already-parsed, bounded JSON bodies to the Vault service.
// Plaintext can therefore never be returned by an endpoint in this file.

const BROKER_HOST = "127.0.0.1";
const BROKER_PROTOCOL = "pupu.vault-sink-broker";
const BROKER_VERSION = 1;
const BROKER_MAX_BODY_BYTES = 64 * 1024;
const BROKER_CLOCK_SKEW_MS = 30 * 1000;
const BROKER_NONCE_PATTERN = /^[0-9a-f]{32}$/;
const BROKER_SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;
const BROKER_KEY_PATTERN = /^[0-9a-f]{64}$/;

const BROKER_ROUTES = Object.freeze({
  STATUS: "/v1/status",
  PREPARE: "/v1/intents/prepare",
  EXECUTE: "/v1/intents/execute",
  CANCEL: "/v1/intents/cancel",
});

const brokerError = (code, statusCode) => {
  const error = new Error(`[${code}] vault broker request failed`);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sha256Hex = (crypto, bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");

const canonicalSignatureInput = ({ method, pathname, timestamp, nonce, bodyHash }) =>
  ["v1", method, pathname, timestamp, nonce, bodyHash].join("\n");

const signVaultBrokerRequest = ({
  crypto,
  key,
  method,
  pathname,
  timestamp,
  nonce,
  body,
}) => {
  if (!crypto || !BROKER_KEY_PATTERN.test(String(key || ""))) {
    throw new Error("signVaultBrokerRequest: invalid dependencies");
  }
  const rawBody = Buffer.isBuffer(body)
    ? body
    : Buffer.from(typeof body === "string" ? body : "", "utf8");
  const bodyHash = sha256Hex(crypto, rawBody);
  return crypto
    .createHmac("sha256", Buffer.from(key, "hex"))
    .update(
      canonicalSignatureInput({
        method: String(method || "").toUpperCase(),
        pathname: String(pathname || ""),
        timestamp: String(timestamp || ""),
        nonce: String(nonce || ""),
        bodyHash,
      }),
      "utf8",
    )
    .digest("hex");
};

const createVaultSinkBroker = ({
  http,
  crypto,
  onPrepare,
  onExecute,
  onCancel,
  now = () => Date.now(),
} = {}) => {
  if (
    !http ||
    !crypto ||
    typeof onPrepare !== "function" ||
    typeof onExecute !== "function" ||
    typeof onCancel !== "function"
  ) {
    throw new Error("createVaultSinkBroker: missing dependencies");
  }

  let server = null;
  let brokerKey = null;
  let brokerUrl = null;
  const acceptedNonces = new Map();
  const sockets = new Set();

  const writeJson = (response, statusCode, payload) => {
    if (response.headersSent) return;
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    response.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
      "content-length": String(body.length),
      "cache-control": "no-store",
      connection: "close",
    });
    response.end(body);
  };

  const writeError = (response, error) => {
    const code =
      error && typeof error.code === "string"
        ? error.code
        : "vault_broker_internal_error";
    const statusCode =
      error && Number.isInteger(error.statusCode)
        ? error.statusCode
        : code === "vault_use_denied"
          ? 403
          : code === "vault_sink_unavailable" ||
              code === "secret_storage_unavailable" ||
              code === "vault_confirmation_unavailable"
            ? 503
            : code === "vault_intent_conflict" ||
                code === "vault_use_indeterminate" ||
                code === "vault_use_in_progress"
              ? 409
              : code.startsWith("invalid_") || code === "vault_intent_not_found"
                ? 400
                : 500;
    // Never serialize error.message/stack: either can contain attacker input.
    writeJson(response, statusCode, { ok: false, error: { code } });
  };

  const purgeExpiredNonces = (currentTime) => {
    const cutoff = currentTime - BROKER_CLOCK_SKEW_MS;
    for (const [nonce, acceptedAt] of acceptedNonces.entries()) {
      if (acceptedAt < cutoff) acceptedNonces.delete(nonce);
    }
  };

  const authenticate = ({ request, pathname, rawBody }) => {
    const timestamp = request.headers["x-pupu-vault-timestamp"];
    const nonce = request.headers["x-pupu-vault-nonce"];
    const signature = request.headers["x-pupu-vault-signature"];
    if (
      typeof timestamp !== "string" ||
      typeof nonce !== "string" ||
      typeof signature !== "string" ||
      !/^[0-9]{10,16}$/.test(timestamp) ||
      !BROKER_NONCE_PATTERN.test(nonce) ||
      !BROKER_SIGNATURE_PATTERN.test(signature)
    ) {
      throw brokerError("vault_broker_unauthorized", 401);
    }

    const timestampNumber = Number(timestamp);
    const currentTime = now();
    if (
      !Number.isSafeInteger(timestampNumber) ||
      Math.abs(currentTime - timestampNumber) > BROKER_CLOCK_SKEW_MS
    ) {
      throw brokerError("vault_broker_unauthorized", 401);
    }

    const expected = signVaultBrokerRequest({
      crypto,
      key: brokerKey,
      method: request.method,
      pathname,
      timestamp,
      nonce,
      body: rawBody,
    });
    const suppliedBytes = Buffer.from(signature, "hex");
    const expectedBytes = Buffer.from(expected, "hex");
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !crypto.timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      throw brokerError("vault_broker_unauthorized", 401);
    }

    purgeExpiredNonces(currentTime);
    if (acceptedNonces.has(nonce)) {
      throw brokerError("vault_broker_replay", 409);
    }
    acceptedNonces.set(nonce, currentTime);
  };

  const readBody = (request) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      request.on("data", (chunk) => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > BROKER_MAX_BODY_BYTES) {
          fail(brokerError("vault_broker_body_too_large", 413));
          return;
        }
        chunks.push(bytes);
      });
      request.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks, size));
      });
      request.on("aborted", () =>
        fail(brokerError("vault_broker_invalid_request", 400)),
      );
      request.on("error", () =>
        fail(brokerError("vault_broker_invalid_request", 400)),
      );
    });

  const parseBody = (rawBody) => {
    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (_error) {
      throw brokerError("vault_broker_invalid_request", 400);
    }
    if (!isPlainObject(payload)) {
      throw brokerError("vault_broker_invalid_request", 400);
    }
    return payload;
  };

  const handleRequest = async (request, response) => {
    let pathname;
    try {
      const parsedUrl = new URL(request.url, "http://127.0.0.1");
      if (parsedUrl.search || parsedUrl.hash) {
        throw new Error("query and fragment are forbidden");
      }
      pathname = parsedUrl.pathname;
    } catch (_error) {
      writeError(response, brokerError("vault_broker_invalid_request", 400));
      return;
    }

    const method = String(request.method || "").toUpperCase();
    const knownPath = Object.values(BROKER_ROUTES).includes(pathname);
    if (!knownPath) {
      writeError(response, brokerError("vault_broker_not_found", 404));
      return;
    }
    if (
      (pathname === BROKER_ROUTES.STATUS && method !== "GET") ||
      (pathname !== BROKER_ROUTES.STATUS && method !== "POST")
    ) {
      writeError(response, brokerError("vault_broker_method_not_allowed", 405));
      return;
    }

    try {
      const rawBody = method === "GET" ? Buffer.alloc(0) : await readBody(request);
      authenticate({ request, pathname, rawBody });

      if (pathname === BROKER_ROUTES.STATUS) {
        writeJson(response, 200, {
          ok: true,
          protocol: BROKER_PROTOCOL,
          version: BROKER_VERSION,
        });
        return;
      }

      const contentType = String(request.headers["content-type"] || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (contentType !== "application/json") {
        throw brokerError("vault_broker_invalid_request", 400);
      }
      const payload = parseBody(rawBody);
      const result =
        pathname === BROKER_ROUTES.PREPARE
          ? await onPrepare(payload)
          : pathname === BROKER_ROUTES.EXECUTE
            ? await onExecute(payload)
            : await onCancel(payload);
      writeJson(response, 200, result);
    } catch (error) {
      writeError(response, error);
    }
  };

  const start = () => {
    if (server && brokerUrl && brokerKey) {
      return Promise.resolve({ url: brokerUrl, key: brokerKey });
    }
    if (server) {
      return Promise.reject(brokerError("vault_broker_unavailable", 503));
    }

    brokerKey = crypto.randomBytes(32).toString("hex");
    return new Promise((resolve, reject) => {
      const candidate = http.createServer((request, response) => {
        void handleRequest(request, response);
      });
      server = candidate;
      candidate.on("connection", (socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
      });
      const failStart = () => {
        if (server === candidate) server = null;
        brokerKey = null;
        brokerUrl = null;
        reject(brokerError("vault_broker_unavailable", 503));
      };
      candidate.once("error", failStart);
      candidate.listen(0, BROKER_HOST, () => {
        candidate.removeListener("error", failStart);
        const address = candidate.address();
        if (!address || typeof address === "string" || address.address !== BROKER_HOST) {
          candidate.close();
          failStart();
          return;
        }
        brokerUrl = `http://${BROKER_HOST}:${address.port}`;
        resolve({ url: brokerUrl, key: brokerKey });
      });
    });
  };

  const stop = () => {
    if (!server) return Promise.resolve();
    const closingServer = server;
    server = null;
    brokerUrl = null;
    brokerKey = null;
    acceptedNonces.clear();
    return new Promise((resolve) => {
      closingServer.close(() => resolve());
      for (const socket of sockets) socket.destroy();
      sockets.clear();
    });
  };

  const getBootstrap = () => {
    if (!server || !brokerUrl || !brokerKey) return null;
    return { url: brokerUrl, key: brokerKey };
  };

  return { start, stop, getBootstrap };
};

module.exports = {
  createVaultSinkBroker,
  signVaultBrokerRequest,
  BROKER_HOST,
  BROKER_PROTOCOL,
  BROKER_VERSION,
  BROKER_MAX_BODY_BYTES,
  BROKER_CLOCK_SKEW_MS,
  BROKER_ROUTES,
};
