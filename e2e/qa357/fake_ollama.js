const http = require("node:http");

/* QA-only (#357): a loopback stand-in for Ollama's native API, so a stored
 * Agent whose Kernel profile is the build's own Ollama profile can run with no
 * external route and no key. It answers exactly two ways and records every
 * request body as it arrived:
 *
 *   - a chat that offers tools and has no tool result yet gets one call of
 *     the `read` tool (or the first tool offered);
 *   - any other chat gets one plain answer that quotes the latest tool result,
 *     or the latest user text, behind the marker QA357_FINAL.
 *
 * It listens on the default Ollama port on both loopback families, because
 * the profile's endpoint is the default http://localhost:11434. */

const MODEL = "deepseek-r1:14b";
const PORT = 11434;

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  request.on("error", reject);
});

const textOf = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (part && (part.text || part.content)) || "").join("");
  return content == null ? "" : JSON.stringify(content);
};

function answer(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const toolResults = messages.filter((message) => message && message.role === "tool");
  if (tools.length > 0 && toolResults.length === 0) {
    const names = tools.map((tool) => tool && tool.function && tool.function.name).filter(Boolean);
    const name = names.find((candidate) => candidate === "read" || candidate.endsWith("read")) || names[0];
    return { kind: "tool_call", tool: name, lines: [
      { model: MODEL, created_at: new Date().toISOString(), done: false,
        message: { role: "assistant", content: "", tool_calls: [{ id: "qa357-call-1", function: { name, arguments: { path: "qa357-probe.txt" } } }] } },
    ] };
  }
  const last = toolResults.length > 0
    ? textOf(toolResults[toolResults.length - 1].content)
    : textOf((messages.filter((message) => message && message.role === "user").pop() || {}).content);
  const text = `QA357_FINAL ${toolResults.length > 0 ? "tool" : "user"}: ${last.slice(0, 160)}`;
  return { kind: "final", lines: [
    { model: MODEL, created_at: new Date().toISOString(), done: false, message: { role: "assistant", content: text } },
    { model: MODEL, created_at: new Date().toISOString(), done: true, done_reason: "stop",
      message: { role: "assistant", content: "" }, prompt_eval_count: 12, eval_count: 6 },
  ] };
}

function createFakeOllama() {
  const log = [];
  const servers = [];
  const handler = async (request, response) => {
    const raw = await readBody(request);
    const entry = { at: new Date().toISOString(), method: request.method, url: request.url, body: raw };
    log.push(entry);
    const json = (status, value) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && request.url === "/api/version") return json(200, { version: "0.0.0-qa357" });
    if (request.method === "GET" && request.url === "/api/tags") {
      return json(200, { models: [{ name: MODEL, model: MODEL, modified_at: "2026-01-01T00:00:00Z", size: 1,
        digest: "qa357", details: { family: "qa357", parameter_size: "14B", quantization_level: "Q4" } }] });
    }
    if (request.method === "GET" && request.url === "/api/ps") return json(200, { models: [] });
    if (request.method === "POST" && request.url === "/api/show") {
      return json(200, { modelfile: "", parameters: "", template: "", details: { family: "qa357" },
        model_info: { "general.architecture": "qa357", "qa357.context_length": 128000 }, capabilities: ["completion", "tools"] });
    }
    if (request.method === "POST" && request.url === "/api/chat") {
      let body;
      try { body = JSON.parse(raw); } catch (_error) { return json(400, { error: "invalid JSON" }); }
      const reply = answer(body);
      entry.reply = reply;
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const line of reply.lines) response.write(`${JSON.stringify(line)}\n`);
      return response.end();
    }
    return json(404, { error: `qa357 fake has no ${request.method} ${request.url}` });
  };
  const listen = (host) => new Promise((resolve) => {
    const server = http.createServer(handler);
    server.once("error", (error) => resolve({ host, error: error.code || error.message }));
    server.listen(PORT, host, () => { servers.push(server); resolve({ host, listening: true }); });
  });
  return {
    log,
    start: async () => [await listen("127.0.0.1"), await listen("::1")],
    stop: async () => { await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))); },
  };
}

module.exports = { createFakeOllama, MODEL };
