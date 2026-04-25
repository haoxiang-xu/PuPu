const http = require("http");
const { URL } = require("url");

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });

const writeJson = (res, status, body) => {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": buf.length,
  });
  res.end(buf);
};

const writeBinary = (res, { contentType, buffer }) => {
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": buffer.length,
  });
  res.end(buffer);
};

const createServer = ({ registry, isReady }) =>
  new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!isReady()) {
          writeJson(res, 503, {
            error: {
              code: "not_ready",
              message: "renderer test bridge not ready",
            },
          });
          return;
        }
        const url = new URL(req.url, "http://127.0.0.1");
        const raw = await readBody(req);
        let body = null;
        if (raw.length > 0) {
          try {
            body = JSON.parse(raw.toString("utf8"));
          } catch (_) {
            writeJson(res, 400, {
              error: {
                code: "invalid_json",
                message: "request body is not valid JSON",
              },
            });
            return;
          }
        }
        const query = Object.fromEntries(url.searchParams.entries());
        const result = await registry.dispatch({
          method: req.method,
          path: url.pathname,
          body,
          query,
          raw,
        });
        if (result.body && result.body.__binary) {
          writeBinary(res, result.body);
        } else {
          writeJson(res, result.status, result.body);
        }
      } catch (e) {
        writeJson(res, 500, {
          error: { code: "server_error", message: e.message },
        });
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });

module.exports = { createServer };
