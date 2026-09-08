import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const {
  buildCustomProviderDefinition,
  CUSTOM_MODEL_ID
} = require('../test-api/deterministic-soak-lib.cjs');
// Supporting unpacked evidence only; this does not install or rebuild the candidate.
// Usage: node scripts/release-qa/probe-packaged-interactions-v2.mjs <fixed-candidate-directory>
if (process.platform !== 'win32') throw new Error('This probe requires Windows.');
if (process.argv.length !== 3) throw new Error('Usage: node probe-packaged-interactions-v2.mjs <fixed-candidate-directory>');
const candidateRoot = path.resolve(process.argv[2]);
const executable = path.join(candidateRoot, 'electron', 'win-unpacked', 'PuPu.exe');
if (!fs.statSync(executable).isFile()) throw new Error('Candidate PuPu.exe is missing.');
// Preserve all earlier evidence and avoid reusing chat/session state on reruns.
const root = fs.mkdtempSync(path.join(candidateRoot, 'probe-packaged-interactions-v2.mjs-'));
console.log(`Evidence directory: ${root}`);
const profile = `${root}/交互恢复 v2 private profile`;
fs.mkdirSync(profile, {
  recursive: true
});
const {
  buildResponseEnvelope,
  serializeSse
} = require('../test-api/fixtures/fake_openai_responses_server.js');
const calls = [];
const server = http.createServer(async (req, res) => {
  if (req.url != '/v1/responses') {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    calls.push(body);
    const index = calls.length;
    const generation = index <= 2 ? {
      ...body,
      input: [{
        role: 'user',
        content: `SOAK_CHILD|scenario=question|lane=${index === 1 ? 'A' : 'B'}|target=soak-explore-${index === 1 ? 'a' : 'b'}`
      }]
    } : {
      ...body,
      input: [{
        role: 'user',
        content: 'Finish the two-question test.'
      }]
    };
    const envelope = buildResponseEnvelope(generation);
    if (body.stream) {
      res.writeHead(200, {
        'content-type': 'text/event-stream'
      });
      res.end(serializeSse(envelope.events));
    } else {
      res.writeHead(200, {
        'content-type': 'application/json'
      });
      res.end(JSON.stringify(envelope.response));
    }
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({
      error: {
        message: String(e)
      }
    }));
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const custom = buildCustomProviderDefinition(`http://127.0.0.1:${server.address().port}/v1`);
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
  log = fs.openSync(`${root}/interaction-v2-${label}-app.log`, 'w');
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
const sessionId = 'cp2-interaction-chat';
const options = {
  modelId: CUSTOM_MODEL_ID,
  custom_provider: custom,
  custom_provider_api_key: 'pupu-fixture-key',
  memory_enabled: true,
  memory_long_term_enabled: false
};
async function stream(page, payload) {
  return page.evaluate(payload => new Promise(resolve => {
    const events = [];
    let handle;
    let settled = false;
    const finish = x => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(poller);
      resolve({
        ...x,
        events
      });
    };
    const timer = setTimeout(() => {
      handle?.cancel();
      finish({
        error: 'harness timeout'
      });
    }, 30000);
    const poller = setInterval(async () => {
      try {
        const p = await window.unchainAPI.getPendingInteraction({
          session_id: payload.threadId
        });
        if (p.status === 'awaiting_response' && p.interaction_id !== payload.interaction_id) finish({
          parked: true,
          pending: p
        });
      } catch {}
    }, 300);
    handle = window.unchainAPI.startStreamV4(payload, {
      onRuntimeEvent: e => {
        events.push(e);
        if (e.type === 'interaction.requested') finish({
          parked: true
        });
        if (e.type === 'run.failed') finish({
          error: e.payload
        });
      },
      onError: e => finish({
        error: e
      }),
      onDone: d => finish({
        done: d
      })
    });
  }), payload);
}
try {
  let page = await launch('first');
  const initialAttempt = `interaction-initial-${crypto.randomUUID()}`;
  const base = {
    threadId: sessionId,
    owner_chat_id: sessionId,
    memory_v2_requested: true,
    options
  };
  let result = await stream(page, {
    ...base,
    message: 'Ask two successive test questions, then finish.',
    attempt_id: initialAttempt
  });
  report.steps.push({
    label: 'initial',
    result
  });
  for (let n = 1; n <= 2; n++) {
    let pending = await page.evaluate(id => window.unchainAPI.getPendingInteraction({
      session_id: id
    }), sessionId);
    report.steps.push({
      label: `pending-${n}`,
      pending
    });
    if (!pending.interaction_id) throw Error(`missing pending interaction ${n}: ${JSON.stringify(pending)}`);
    await close();
    page = await launch(`cold-${n}`);
    const restored = await page.evaluate(id => window.unchainAPI.getPendingInteraction({
      session_id: id
    }), sessionId);
    if (restored.interaction_id !== pending.interaction_id) throw Error('cold pending identity changed');
    report.steps.push({
      label: `restored-${n}`,
      pending: restored
    });
    const receiptPayload = {
      session_id: sessionId,
      confirmation_id: restored.interaction_id,
      approved: true,
      modified_arguments: {
        user_response: {
          value: 'continue'
        }
      }
    };
    const receipt = await page.evaluate(p => window.unchainAPI.respondToolConfirmation(p), receiptPayload);
    const replay = await page.evaluate(p => window.unchainAPI.respondToolConfirmation(p), receiptPayload);
    report.steps.push({
      label: `receipts-${n}`,
      receipt,
      replay
    });
    const source = restored.source_run_id || restored.run_id || restored.attempt_id;
    result = await stream(page, {
      ...base,
      options: {
        ...options,
        ...restored.resume_options,
        custom_provider_api_key: "pupu-fixture-key"
      },
      mode: 'resume_interaction',
      message: '',
      history: [],
      attachments: [],
      interaction_id: restored.interaction_id,
      source_attempt_id: source,
      attempt_id: `interaction-resume-${n}-${crypto.randomUUID()}`
    });
    report.steps.push({
      label: `resume-${n}`,
      result
    });
    if (result.error) throw Error(`resume ${n} failed: ${JSON.stringify(result.error)}`);
  }
  if (result.done?.bundle?.lifecycle?.status !== 'completed') throw Error('final completion absent');
  if (calls.length !== 3) throw Error(`expected three provider calls, got ${calls.length}`);
  report.completed = true;
} catch (e) {
  report.failure = String(e.stack || e);
  process.exitCode = 1;
} finally {
  await close();
  await new Promise(r => server.close(r));
  report.providerRequests = calls;
  fs.writeFileSync(`${root}/packaged-interaction-v2-evidence.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    completed: report.completed,
    failure: report.failure,
    steps: report.steps.map(s => ({
      label: s.label,
      status: s.pending?.status,
      error: s.result?.error
    })),
    providerCalls: calls.length
  }, null, 2));
}
