#!/usr/bin/env node
// Minimal stdio MCP server for the installed-candidate Vault sink matrix.
//
// It declares exactly one tool, `use_token`, whose `token` field carries the
// `x-pupu-secret: true` marker that PuPu's MCP toolkit layer turns into a Vault
// sink field (unchain_runtime/server/mcp_toolkits.py::_vault_secret_fields).
// When called it proves the plaintext reached the MCP process by appending
// `sha256(token)` to --receipt-file, and it never echoes the token on stdout,
// stderr, in the tool result or in any file.
//
// Wire format: newline-delimited JSON-RPC 2.0 on stdin/stdout (the MCP stdio
// transport). Diagnostics go to stderr only.

import crypto from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import readline from "node:readline";

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index].startsWith("--")) {
      args[argv[index].slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return args;
};

const args = parseArgs(process.argv.slice(2));
const receiptFile = args["receipt-file"];
if (!receiptFile) {
  process.stderr.write("fake-secret-mcp-server: --receipt-file is required\n");
  process.exit(2);
}

export const TOOL_NAME = "use_token";
export const SERVER_NAME = "pupu-sink-matrix-fake-mcp";

const TOOL = {
  name: TOOL_NAME,
  description:
    "Sink matrix probe: proves a Vault-resolved token reached this MCP process. " +
    "Records only a digest of the token.",
  inputSchema: {
    type: "object",
    properties: {
      token: {
        type: "string",
        description: "Secret token resolved by the PuPu Vault.",
        "x-pupu-secret": true,
      },
      note: { type: "string", description: "Public note, echoed back." },
    },
    required: ["token"],
    additionalProperties: false,
  },
};

const send = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const replyError = (id, code, message) =>
  send({ jsonrpc: "2.0", id, error: { code, message } });

const handle = (message) => {
  if (!message || message.jsonrpc !== "2.0") return;
  const { id, method, params } = message;
  if (method === "initialize") {
    reply(id, {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: "1.0.0" },
    });
    return;
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return;
  }
  if (method === "ping") {
    reply(id, {});
    return;
  }
  if (method === "tools/list") {
    reply(id, { tools: [TOOL] });
    return;
  }
  if (method === "tools/call") {
    const name = params?.name;
    const callArguments = params?.arguments || {};
    if (name !== TOOL_NAME) {
      replyError(id, -32602, `unknown tool ${String(name)}`);
      return;
    }
    const token = callArguments.token;
    if (typeof token !== "string" || token.length === 0) {
      reply(id, {
        content: [{ type: "text", text: JSON.stringify({ ok: false, error: "token_missing" }) }],
        isError: true,
      });
      return;
    }
    const digest = crypto.createHash("sha256").update(token, "utf8").digest("hex");
    fs.appendFileSync(receiptFile, `${digest}\n`, "utf8");
    reply(id, {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            ok: true,
            token_length: token.length,
            digest_prefix: digest.slice(0, 16),
            note: typeof callArguments.note === "string" ? callArguments.note : "",
          }),
        },
      ],
      isError: false,
    });
    return;
  }
  if (id !== undefined) replyError(id, -32601, `method not found: ${String(method)}`);
};

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch (_error) {
    process.stderr.write("fake-secret-mcp-server: ignoring non-JSON line\n");
    return;
  }
  try {
    handle(message);
  } catch (error) {
    process.stderr.write(`fake-secret-mcp-server: ${error.message}\n`);
    if (message.id !== undefined) replyError(message.id, -32603, "internal error");
  }
});
lines.on("close", () => process.exit(0));
