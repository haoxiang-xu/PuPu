const { CHANNELS } = require("../../../shared/channels");

const createOllamaService = ({ app, shell, spawn, http, https, fs, path }) => {
  let ollamaProcess = null;
  let ollamaStatus = "checking";
  const OLLAMA_BASE_URL = "http://localhost:11434";

  const requestOllamaJson = (pathname, timeoutMs = 3000) =>
    new Promise((resolve, reject) => {
      const url = `${OLLAMA_BASE_URL}${pathname}`;
      const req = http.get(url, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`Ollama request failed (${res.statusCode || "unknown"})`));
            return;
          }
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (error) {
            reject(new Error("Ollama returned invalid JSON"));
          }
        });
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error("Ollama request timed out"));
      });
      req.on("error", reject);
    });

  const pingOllama = () =>
    new Promise((resolve) => {
      const req = http.get(OLLAMA_BASE_URL, (res) => {
        res.resume();
        resolve(true);
      });
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
      req.on("error", () => resolve(false));
    });

  const startOllama = async () => {
    const already = await pingOllama();
    if (already) {
      ollamaStatus = "already_running";
      return;
    }

    ollamaProcess = spawn("ollama", ["serve"], {
      detached: false,
      stdio: "ignore",
      env: { ...process.env },
    });

    ollamaProcess.on("error", (err) => {
      ollamaStatus = err.code === "ENOENT" ? "not_found" : "error";
      ollamaProcess = null;
    });

    ollamaProcess.on("exit", () => {
      ollamaProcess = null;
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const up = await pingOllama();
    ollamaStatus = up ? "started" : "error";
  };

  const stopOllama = () => {
    if (ollamaProcess && !ollamaProcess.killed) {
      ollamaProcess.kill();
      ollamaProcess = null;
    }
  };

  const restartOllama = async () => {
    stopOllama();
    ollamaStatus = "checking";
    await startOllama();
    return ollamaStatus;
  };

  const installOllama = async (event) => {
    const platform = process.platform;
    let downloadUrl;
    let fileName;

    if (platform === "darwin") {
      downloadUrl =
        "https://github.com/ollama/ollama/releases/latest/download/Ollama-darwin.zip";
      fileName = "Ollama-darwin.zip";
    } else if (platform === "win32") {
      downloadUrl =
        "https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe";
      fileName = "OllamaSetup.exe";
    } else {
      shell.openExternal("https://github.com/ollama/ollama/releases/latest");
      return { opened: true };
    }

    const destPath = path.join(app.getPath("downloads"), fileName);

    return new Promise((resolve, reject) => {
      const doDownload = (url, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        const mod = url.startsWith("https") ? https : http;
        mod
          .get(url, { headers: { "User-Agent": "PuPu-App" } }, (res) => {
            if (
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              doDownload(res.headers.location, redirectCount + 1);
              return;
            }
            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode}`));
              return;
            }

            const total = parseInt(res.headers["content-length"] || "0", 10);
            let downloaded = 0;
            const dest = fs.createWriteStream(destPath);

            res.on("data", (chunk) => {
              downloaded += chunk.length;
              if (total > 0) {
                const pct = Math.round((downloaded / total) * 100);
                try {
                  event.sender.send(CHANNELS.OLLAMA.INSTALL_PROGRESS, pct);
                } catch {
                  // best effort
                }
              }
            });

            res.pipe(dest);
            dest.on("finish", () => {
              try {
                event.sender.send(CHANNELS.OLLAMA.INSTALL_PROGRESS, 100);
              } catch {
                // best effort
              }
              shell.openPath(destPath);
              resolve({ path: destPath });
            });
            dest.on("error", reject);
          })
          .on("error", reject);
      };
      doDownload(downloadUrl);
    });
  };

  const searchLibrary = async ({ query = "", category = "" } = {}) => {
    const q = encodeURIComponent(String(query || "").trim());
    const c = encodeURIComponent(String(category || "").trim());
    const parts = [];
    if (q) parts.push(`q=${q}`);
    if (c) parts.push(`c=${c}`);
    const url = `https://ollama.com/search${parts.length ? "?" + parts.join("&") : ""}`;

    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        { headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" } },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => resolve(data));
        },
      );
      req.setTimeout(12000, () => {
        req.destroy();
        reject(new Error("ollama library search timed out"));
      });
      req.on("error", reject);
    });
  };

  return {
    startOllama,
    stopOllama,
    restartOllama,
    getStatus: () => ollamaStatus,
    listInstalledModels: () => requestOllamaJson("/api/tags"),
    installOllama,
    searchLibrary,
  };
};

module.exports = {
  createOllamaService,
};
