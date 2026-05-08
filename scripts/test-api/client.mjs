import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const portFilePath = () => {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library/Application Support/pupu/test-api-port",
    );
  }
  if (platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData/Roaming"),
      "pupu/test-api-port",
    );
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    "pupu/test-api-port",
  );
};

const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
};

export const discoverBaseUrl = () => {
  const file = portFilePath();
  if (!fs.existsSync(file)) {
    throw new Error(
      `PuPu test API port file not found: ${file} (is PuPu running in dev mode?)`,
    );
  }
  const { port, pid } = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!isAlive(pid)) {
    throw new Error(`port file references dead PID ${pid}; restart PuPu`);
  }
  return `http://127.0.0.1:${port}/v1`;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const request = async (
  method,
  endpointPath,
  body,
  { retryOn503 = true, baseUrl } = {},
) => {
  const base = baseUrl || discoverBaseUrl();
  const url = `${base}${endpointPath}`;
  const init = {
    method,
    headers: body == null ? {} : { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(url, init);
    if (res.status === 503 && retryOn503) {
      await sleep(200);
      continue;
    }
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json")
      ? await res.json()
      : await res.arrayBuffer();
    if (!res.ok) {
      const err = new Error(
        typeof data === "object" && data && data.error
          ? data.error.message
          : String(data),
      );
      Object.assign(err, { status: res.status, body: data });
      throw err;
    }
    return data;
  }
  throw new Error("test API not ready after 6s");
};

export const client = {
  baseUrl: discoverBaseUrl,
  request,
  GET: (p, opts) => request("GET", p, null, opts),
  POST: (p, body, opts) => request("POST", p, body, opts),
  PATCH: (p, body, opts) => request("PATCH", p, body, opts),
  DELETE: (p, opts) => request("DELETE", p, null, opts),
};
