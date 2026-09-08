import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const {
  createFakeOpenAIResponsesServer
} = require('../test-api/fixtures/fake_openai_responses_server.js');
const {
  buildCustomProviderDefinition,
  CUSTOM_MODEL_ID
} = require('../test-api/deterministic-soak-lib.cjs');
// Supporting unpacked evidence only; this does not install or rebuild the candidate.
// Usage: node scripts/release-qa/probe-packaged-chat-off.mjs <fixed-candidate-directory>
if (process.platform !== 'win32') throw new Error('This probe requires Windows.');
if (process.argv.length !== 3) throw new Error('Usage: node probe-packaged-chat-off.mjs <fixed-candidate-directory>');
const candidateRoot = path.resolve(process.argv[2]);
const executable = path.join(candidateRoot, 'electron', 'win-unpacked', 'PuPu.exe');
if (!fs.statSync(executable).isFile()) throw new Error('Candidate PuPu.exe is missing.');
// Preserve all earlier evidence and avoid reusing chat/session state on reruns.
const root = fs.mkdtempSync(path.join(candidateRoot, 'probe-packaged-chat-off.mjs-'));
console.log(`Evidence directory: ${root}`);
const profile = `${root}/普通聊天 H4 private profile`;
fs.mkdirSync(profile, {
  recursive: true
});
const fake = createFakeOpenAIResponsesServer({});
const ready = await fake.start();
const custom = buildCustomProviderDefinition(ready.baseUrl);
const report = {
  candidateRoot,
  executable,
  scope: 'real packaged preload -> Electron -> sidecar -> deterministic local provider; unpacked supporting evidence',
  profile,
  steps: []
};
let child, browser, log;
async function close() {
  await browser?.close().catch(() => {});
  browser = null;
  if (child?.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
    windowsHide: true
  });
  child = null;
  if (log != null) fs.closeSync(log);
  log = null;
}
async function launch(label) {
  const port = await new Promise(r => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => r(p));
    });
  });
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PUPU_TEST_API_DISABLE: '1'
  };
  for (const k of Object.keys(env)) if (k.startsWith('PUPU_MEMORY_V2') || ['PUPU_FEATURE_MEMORY_V2', 'ELECTRON_RUN_AS_NODE', 'UNCHAIN_DATA_DIR'].includes(k)) delete env[k];
  log = fs.openSync(`${root}/chat-off-${label}-app.log`, 'w');
  child = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
    env,
    windowsHide: true,
    stdio: ['ignore', log, log]
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error(`app exited ${child.exitCode}`);
    try {
      if (!browser) browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
        timeout: 1500
      });
      const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('file:'));
      if (page) {
        const s = await page.evaluate(async () => window.unchainAPI ? await window.unchainAPI.getStatus() : null);
        if (s?.status === 'ready') {
          if (!s.memoryV2?.ready) throw Error('Memory V2 not ready');
          return page;
        }
      }
    } catch (e) {
      if (String(e.message).includes('Memory V2')) throw e;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw Error('startup timeout');
}
async function chat(page, chatId, label, text) {
  const before = fake.requests.length;
  const payload = {
    message: text,
    threadId: chatId,
    owner_chat_id: chatId,
    memory_v2_requested: false,
    attempt_id: `cp2-${label}-${crypto.randomUUID()}`,
    options: {
      modelId: CUSTOM_MODEL_ID,
      custom_provider: custom,
      custom_provider_api_key: 'pupu-fixture-key',
      memory_enabled: false,
      memory_long_term_enabled: false,
      mode: 'normal'
    }
  };
  const result = await page.evaluate(payload => new Promise(resolve => {
    const events = [];
    let handle;
    const timer = setTimeout(() => {
      handle?.cancel();
      resolve({
        error: {
          code: 'harness_timeout'
        },
        events
      });
    }, 45000);
    handle = window.unchainAPI.startStreamV4(payload, {
      onRuntimeEvent: e => events.push(e),
      onError: e => {
        clearTimeout(timer);
        resolve({
          error: e,
          events
        });
      },
      onDone: d => {
        clearTimeout(timer);
        resolve({
          done: d,
          events
        });
      }
    });
  }), payload);
  const requests = fake.requests.slice(before);
  report.steps.push({
    label,
    chatId,
    executionId: payload.threadId,
    attemptId: payload.attempt_id,
    ...result,
    providerRequests: requests
  });
  fs.writeFileSync(`${root}/packaged-chat-off-evidence.json`, JSON.stringify(report, null, 2));
  console.log(label, JSON.stringify({
    error: result.error,
    lifecycle: result.done?.bundle?.lifecycle,
    eventCount: result.events.length,
    providerCalls: requests.length
  }));
  if (result.error) throw Error(`${label}: ${JSON.stringify(result.error)}`);
  if (!result.events.some(e => JSON.stringify(e).includes('SOAK_FIXTURE_OK'))) throw Error(`${label}: expected response absent`);
  return result;
}
try {
  let page = await launch('first');
  await chat(page, 'cp2-chat-a', 'first', 'Remember this test marker: apricot-742.');
  await chat(page, 'cp2-chat-a', 'second', 'What test marker did I give you?');
  await chat(page, 'cp2-chat-b', 'isolated', 'A separate chat with no earlier marker.');
  await close();
  page = await launch('restart');
  await chat(page, 'cp2-chat-a', 'restart', 'After restart, what test marker did I give you?');
  report.completed = true;
} catch (e) {
  report.failure = String(e.stack || e);
  console.log(report.failure);
  process.exitCode = 1;
} finally {
  await close();
  await fake.stop();
  fs.writeFileSync(`${root}/packaged-chat-off-evidence.json`, JSON.stringify(report, null, 2));
}
