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
// Usage: node scripts/release-qa/probe-packaged-delete.mjs <fixed-candidate-directory>
if (process.platform !== 'win32') throw new Error('This probe requires Windows.');
if (process.argv.length !== 3) throw new Error('Usage: node probe-packaged-delete.mjs <fixed-candidate-directory>');
const candidateRoot = path.resolve(process.argv[2]);
const executable = path.join(candidateRoot, 'electron', 'win-unpacked', 'PuPu.exe');
if (!fs.statSync(executable).isFile()) throw new Error('Candidate PuPu.exe is missing.');
// Preserve all earlier evidence and avoid reusing chat/session state on reruns.
const root = fs.mkdtempSync(path.join(candidateRoot, 'probe-packaged-delete.mjs-'));
console.log(`Evidence directory: ${root}`);
const profile = `${root}/删除隔离 private profile`;
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
  log = fs.openSync(`${root}/delete-${label}-app.log`, 'w');
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
    memory_v2_requested: true,
    attempt_id: `cp2-${label}-${crypto.randomUUID()}`,
    options: {
      modelId: CUSTOM_MODEL_ID,
      custom_provider: custom,
      custom_provider_api_key: 'pupu-fixture-key',
      memory_enabled: true,
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
  fs.writeFileSync(`${root}/packaged-delete-evidence.json`, JSON.stringify(report, null, 2));
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
  const page = await launch('start');
  await chat(page, 'cp2-delete-a', 'first', 'A private deletion test marker.');
  await chat(page, 'cp2-keep-b', 'isolated', 'An unrelated chat that must survive.');
  const before = await page.evaluate(async () => {
    await window.chatStorageAPI.applyOps([{
      type: 'put_chat_meta',
      chatId: 'cp2-delete-a',
      meta: {
        id: 'cp2-delete-a'
      }
    }, {
      type: 'put_chat_meta',
      chatId: 'cp2-keep-b',
      meta: {
        id: 'cp2-keep-b'
      }
    }]);
    await window.memoryVaultAPI.deposit({
      operationId: 'cp2-delete-deposit',
      scopeKind: 'chat',
      scopeId: 'cp2-delete-a',
      label: 'Synthetic delete scope',
      plaintext: 'cp2-synthetic-delete-token'
    });
    await window.memoryVaultAPI.deposit({
      operationId: 'cp2-keep-deposit',
      scopeKind: 'chat',
      scopeId: 'cp2-keep-b',
      label: 'Synthetic keep scope',
      plaintext: 'cp2-synthetic-keep-token'
    });
    return {
      deleted: await window.memoryVaultAPI.listDescriptors({
        scopeKind: 'chat',
        scopeId: 'cp2-delete-a'
      }),
      kept: await window.memoryVaultAPI.listDescriptors({
        scopeKind: 'chat',
        scopeId: 'cp2-keep-b'
      })
    };
  });
  report.before = before;
  await page.evaluate(() => window.chatStorageAPI.applyOps([{
    type: 'delete_chats',
    chatIds: ['cp2-delete-a']
  }]));
  const deadline = Date.now() + 15000;
  let after;
  while (Date.now() < deadline) {
    after = await page.evaluate(async () => ({
      deleted: await window.memoryVaultAPI.listDescriptors({
        scopeKind: 'chat',
        scopeId: 'cp2-delete-a'
      }),
      kept: await window.memoryVaultAPI.listDescriptors({
        scopeKind: 'chat',
        scopeId: 'cp2-keep-b'
      })
    }));
    if (after.deleted.descriptors?.length === 0 && after.kept.descriptors?.length === 1) break;
    await new Promise(r => setTimeout(r, 300));
  }
  report.after = after;
  if (after.deleted.descriptors?.length !== 0 || after.kept.descriptors?.length !== 1) throw Error('deletion did not drain exact Vault scope');
  report.completed = true;
} catch (e) {
  report.failure = String(e.stack || e);
  console.log(report.failure);
  process.exitCode = 1;
} finally {
  await close();
  await fake.stop();
  fs.writeFileSync(`${root}/packaged-delete-evidence.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    completed: report.completed,
    failure: report.failure
  }));
}
