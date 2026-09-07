import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const server = path.join(here, "fixtures", "fake-secret-mcp-server.mjs");

const rpc = (child, pending, message) =>
  new Promise((resolve, reject) => {
    if (message.id !== undefined) pending.set(message.id, { resolve, reject });
    child.stdin.write(`${JSON.stringify(message)}\n`);
    if (message.id === undefined) resolve(null);
  });

test("fake MCP server declares one x-pupu-secret tool and records only a digest", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-fake-mcp-"));
  const receiptFile = path.join(dir, "receipts.txt");
  const child = spawn(process.execPath, [server, "--receipt-file", receiptFile], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  const pending = new Map();
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    stdoutChunks.push(chunk);
    buffer += chunk.toString("utf8");
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
  const token = `PUPU-SINK-${crypto.randomBytes(24).toString("base64url")}`;
  try {
    const init = await rpc(child, pending, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    assert.equal(init.result.protocolVersion, "2025-03-26");
    assert.deepEqual(init.result.capabilities, { tools: {} });
    await rpc(child, pending, { jsonrpc: "2.0", method: "notifications/initialized" });
    const list = await rpc(child, pending, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    assert.equal(list.result.tools.length, 1);
    const tool = list.result.tools[0];
    assert.equal(tool.name, "use_token");
    assert.equal(tool.inputSchema.properties.token["x-pupu-secret"], true);
    assert.equal(tool.inputSchema.properties.token.type, "string");
    assert.deepEqual(tool.inputSchema.required, ["token"]);

    const call = await rpc(child, pending, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "use_token", arguments: { token, note: "cell mcp.success" } },
    });
    assert.equal(call.result.isError, false);
    const payload = JSON.parse(call.result.content[0].text);
    assert.equal(payload.ok, true);
    assert.equal(payload.token_length, token.length);
    assert.equal(payload.note, "cell mcp.success");
    const digest = crypto.createHash("sha256").update(token, "utf8").digest("hex");
    assert.equal(payload.digest_prefix, digest.slice(0, 16));
    assert.equal(fs.readFileSync(receiptFile, "utf8"), `${digest}\n`);

    const missing = await rpc(child, pending, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "use_token", arguments: { note: "no token" } },
    });
    assert.equal(missing.result.isError, true);
    assert.equal(fs.readFileSync(receiptFile, "utf8").split("\n").filter(Boolean).length, 1);

    const unknown = await rpc(child, pending, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "other" } });
    assert.equal(unknown.error.code, -32602);
  } finally {
    child.stdin.end();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  assert.ok(!stdout.includes(token), "token leaked on stdout");
  assert.ok(!stderr.includes(token), "token leaked on stderr");
  assert.ok(!stdout.includes(Buffer.from(token, "utf8").toString("base64")));
});
