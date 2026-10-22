// Root-operated QA inspection: fresh browser context, no app/profile/sidecar.
const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { chromium } = require('playwright');

const repo = path.resolve(__dirname, '../../../..');
const output = path.join(repo, '.local/ticket-384-ui');
const origin = 'http://127.0.0.1:2924';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const hashFile = file => hash(fs.readFileSync(file));
const executablePath = process.env.TICKET384_CHROMIUM || '/Users/red/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

(async () => {
  const compiled = JSON.parse(fs.readFileSync(path.join(output, 'build-report.json')));
  for (const source of compiled.sourceFiles) {
    assert.equal(hashFile(path.join(repo, source.file)), source.sha256, source.file);
  }
  assert.equal(hashFile(path.join(repo, compiled.acceptedWheel.file)), compiled.acceptedWheel.sha256);
  assert.equal(hashFile(path.join(output, compiled.output.bundle.file)), compiled.output.bundle.sha256);
  assert.equal(compiled.appStartupImported, false);
  assert(compiled.moduleCount > 100);

  const browser = await chromium.launch({ headless: true, executablePath });
  const diagnostics = [];
  const blockedRequests = [];
  const requestedResources = [];
  const records = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, serviceWorkers: 'block' });
    await context.route('**/*', route => {
      const request = route.request();
      const url = request.url();
      const parsed = new URL(url);
      requestedResources.push({ method: request.method(), url, type: request.resourceType() });
      if (parsed.origin === origin && request.method() === 'GET' &&
          ['/', `/${compiled.output.bundle.file}`].includes(parsed.pathname)) return route.continue();
      blockedRequests.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => diagnostics.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') diagnostics.push(message.text()); });
    const loadedBundle = page.waitForResponse(response => response.url() === `${origin}/${compiled.output.bundle.file}`);
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(hash(await (await loadedBundle).body()), compiled.output.bundle.sha256);
    assert.deepEqual(await page.evaluate(() => ({
      unchain: typeof window.unchainAPI,
      electron: typeof window.electron,
      ollama: typeof window.ollamaAPI,
    })), { unchain: 'undefined', electron: 'undefined', ollama: 'undefined' });

    for (const scenario of ['generic', 'nested', 'approval']) {
      await page.getByTestId(`scenario-${scenario}`).click();
      await page.waitForFunction(name => document.querySelector('[data-testid="metadata"]')?.dataset.scenario === name, scenario);
      const original = await page.getByTestId('persisted').innerText();
      const saved = JSON.parse(original);
      assert.equal(saved.id, `assistant-${scenario}-384`);
      assert.equal(saved.status, 'cancelled');
      assert.equal(saved.content, '');
      assert.deepEqual(saved.traceFrames.filter(frame => frame.payload?.call_id).slice(0, 3).map(frame => [frame.type, frame.payload.call_id]), [
        ['tool_call', 'qa-completed-call'], ['tool_result', 'qa-completed-call'], ['tool_call', 'qa-pending-call'],
      ]);
      assert.deepEqual(saved.traceFrames.find(frame => frame.type === 'tool_result' && frame.payload.call_id === 'qa-completed-call').payload.result,
        { content: 'fixture contents for fixture-1.txt' });
      assert(!saved.traceFrames.some(frame => frame.type === 'tool_result' && frame.payload.call_id === 'qa-pending-call'));
      if (scenario === 'nested') {
        assert.equal(saved.subagentFrames['qa-worker-run'][0].payload.call_id, 'qa-child-call');
        assert.equal(saved.subagentMetaByRunId['qa-worker-run'].status, 'running');
      }

      await page.getByTestId('switch-away').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="metadata"]')?.dataset.status === 'missing');
      assert.equal(await page.locator('section').innerText(), 'Choose a scenario to seed a persisted record.');
      await page.getByTestId('return').click();
      await page.waitForFunction(() => document.querySelector('[data-testid="metadata"]')?.dataset.status === 'cancelled');
      assert.equal(await page.getByTestId('persisted').innerText(), original, 'return must read identical persisted bytes');

      await Promise.all([
        page.waitForEvent('load'),
        page.getByTestId('reload').click(),
      ]);
      await page.waitForFunction(() => document.querySelector('[data-testid="metadata"]')?.dataset.status === 'cancelled');
      assert.equal(await page.getByTestId('persisted').innerText(), original, 'reload must read identical persisted bytes');
      assert.equal(await page.getByTestId('metadata').getAttribute('data-action-count'), '0');
      const section = page.locator('section');
      assert((await section.innerText()).includes('Interrupted'));
      assert(!(await section.innerText()).includes('Thinking…'));
      if (scenario === 'nested') assert(await section.getByText('cancelled', { exact: true }).isVisible());
      assert.equal(await section.getByRole('button', { name: /approve|reject|allow|deny|submit/i }).count(), 0);

      // Open the actual production detail controls after cold remount.
      let expandedDetails = 0;
      while (await section.getByRole('button', { name: 'detail', exact: true }).count()) {
        assert(expandedDetails < 8);
        await section.getByRole('button', { name: 'detail', exact: true }).first().click();
        expandedDetails += 1;
      }
      // isVisible alone can pass during the fold's opening transition. Let
      // finite CSS transitions finish before inspecting/saving actual pixels.
      await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        await Promise.all(document.getAnimations()
          .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map(animation => animation.finished.catch(() => {})));
      });
      assert(await section.getByText('fixture-1.txt', { exact: true }).isVisible());
      assert(await section.getByText('fixture-2.txt', { exact: true }).isVisible());
      assert(await section.getByText('fixture contents for fixture-1.txt', { exact: true }).isVisible());
      if (scenario === 'nested') assert(await section.getByText('worker.txt', { exact: true }).isVisible());
      if (scenario === 'approval') {
        assert(await section.getByText('echo approval', { exact: true }).isVisible());
        assert(await section.getByText('Pending', { exact: true }).isVisible());
      }
      const trace = await section.innerText();
      assert.equal((trace.match(/\bRESULT\b/g) || []).length, 1, 'only the observed completed call may have a result');
      const screenshot = `${scenario}-after-reload.png`;
      await page.screenshot({ path: path.join(output, screenshot), fullPage: false });
      records.push({ scenario, saved_sha256: hash(original), message_id: saved.id, root_call_order: saved.traceFrames.filter(frame => frame.payload?.call_id).map(frame => frame.payload.call_id),
        switched_trace_absent: true, return_bytes_identical: true, reload_bytes_identical: true, expanded_details: expandedDetails,
        truthful_interrupted_status: true, approval_actions: 0, trace, screenshot, screenshot_sha256: hashFile(path.join(output, screenshot)) });
    }
    assert.deepEqual(diagnostics, []);
    assert.deepEqual(blockedRequests, []);
    const result = {
      source_checkpoint: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
      production_basis: 'ce9e434c069c14cf0ae6bf7997671d6d065d1394',
      entry: compiled.entry, entry_sha256: hashFile(path.join(repo, compiled.entry)), verifier_sha256: hashFile(__filename),
      bundle_sha256: compiled.output.bundle.sha256, served_bundle_matches: true,
      browser: await browser.version(), profile: 'Playwright temporary context; no persistent or user profile',
      permitted_origin: origin, blocked_requests: blockedRequests, diagnostics,
      requested_resources: requestedResources,
      bridges_absent: true, provider_or_approval_requests: 0, records,
      limitations: ['Isolated compiled consumer and fallback localStorage only.', 'Actual Stop timing is covered by real-hook tests, not this seeded QA entry.', 'No Electron/shared profile, deployed sidecar cancellation, MemoryV2 journal replay or cold sidecar restart.'],
    };
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ passed: records.length, bundle_sha256: result.bundle_sha256, diagnostics, blockedRequests, cases: records.map(record => ({ scenario: record.scenario, switched_trace_absent: true, return_bytes_identical: true, reload_bytes_identical: true, expanded_details: record.expanded_details })) }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
