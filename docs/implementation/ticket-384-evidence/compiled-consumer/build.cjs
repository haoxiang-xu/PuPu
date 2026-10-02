const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const packageJson = require("../../../../package.json");
process.env.NODE_ENV = "production";
process.env.BABEL_ENV = "production";
process.env.PUPU_BUILD_VERSION = packageJson.version;
const webpack = require("webpack");
const makeConfig = require("react-scripts/config/webpack.config");

const repo = path.resolve(__dirname, "../../../..");
const output = path.join(repo, ".local/ticket-384-ui");
const entry = path.join(__dirname, "qa-entry.js");
const hashFile = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceFiles = [
  "src/COMPONENTs/chat-bubble/trace_chain.js",
  "src/PAGEs/chat/utils/chat_turn_utils.js",
  "src/SERVICEs/chat_storage/chat_storage_store.js",
  "src/SERVICEs/runtime_events/event_store.js",
  "src/SERVICEs/runtime_events/activity_tree.js",
  "src/SERVICEs/runtime_events/trace_chain_adapter.js",
  "src/SERVICEs/runtime_events/fixtures/ticket_384_observed_batch.json",
  "src/PAGEs/chat/hooks/use_chat_stream.js",
  "docs/implementation/ticket-384-evidence/compiled-consumer/qa-entry.js",
  "package-lock.json",
].map((file) => ({ file, sha256: hashFile(path.join(repo, file)) }));

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
const config = makeConfig("production");
config.mode = "production";
config.entry = { main: entry };
config.output.path = output;
config.output.filename = "ticket-384-consumer.js";
config.output.chunkFilename = "ticket-384-[name].chunk.js";
config.output.publicPath = "/";
config.output.clean = true;
config.devtool = false;
config.cache = false;

const flattenModules = (modules = []) => modules.flatMap((module) => [
  module,
  ...flattenModules(module.modules || []),
]);

webpack(config, (error, stats) => {
  if (error) throw error;
  if (stats.hasErrors()) {
    process.stderr.write(stats.toString({ all: false, errors: true, errorDetails: true }) + "\n");
    process.exitCode = 1;
    return;
  }
  const json = stats.toJson({ all: false, modules: true, nestedModules: true, assets: true, warnings: true });
  const moduleRecords = flattenModules(json.modules || []).map((module) => ({
    name: module.name || "",
    identifier: module.identifier || "",
    nameForCondition: module.nameForCondition || "",
  }));
  const moduleNames = moduleRecords.flatMap((module) => [module.name, module.identifier, module.nameForCondition]);
  const forbiddenModule = moduleNames.find((name) => /(?:^|[!/?\\])src[\\/](?:index\.(?:js|jsx)|electron[\\/])/i.test(name));
  if (forbiddenModule) {
    throw new Error(`QA bundle unexpectedly includes app startup or Electron source: ${forbiddenModule}`);
  }
  const wheelPath = path.join(repo, ".local/ticket-384-runtime/unchain-0.2.0-py3-none-any.whl");
  const bundlePath = path.join(output, "ticket-384-consumer.js");
  const htmlPath = path.join(output, "index.html");
  fs.writeFileSync(htmlPath, "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Ticket 384 QA</title></head><body><div id=\"root\"></div><script defer src=\"/ticket-384-consumer.js\"></script></body></html>\n");
  const report = {
    purpose: "isolated candidate-consumer fixture; not deployed bridge/runtime evidence",
    compiler: "candidate CRA webpack production configuration",
    entry: path.relative(repo, entry),
    entryAndLockHashesIncluded: true,
    appStartupImported: false,
    bridgeOrModelTransportInvoked: false,
    acceptedManifestAttribution: "accepted baseline artifact provenance recorded before this browser fixture; the browser does not load a Python manifest",
    sourceFiles,
    acceptedWheel: { file: path.relative(repo, wheelPath), sha256: hashFile(wheelPath) },
    acceptedManifestSha256: "a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be",
    output: {
      bundle: { file: path.basename(bundlePath), bytes: fs.statSync(bundlePath).size, sha256: hashFile(bundlePath) },
      html: { file: path.basename(htmlPath), bytes: fs.statSync(htmlPath).size, sha256: hashFile(htmlPath) },
    },
    moduleCount: moduleRecords.length,
    modules: moduleRecords,
    warnings: json.warnings || [],
  };
  fs.writeFileSync(path.join(output, "build-report.json"), JSON.stringify(report, null, 2) + "\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
});
