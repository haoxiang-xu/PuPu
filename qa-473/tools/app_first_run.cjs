/* QA-only B4 startup: observe the first-run Setup overlay and pass it the way
 * a user does. Reads DOM state only; the single write-like action is one real
 * pointer click on Skip for now, and only while a hit test shows it presented.
 * It never forces a click, edits DOM/React state or marks Setup complete.
 */
const fs = require('node:fs');
const path = require('node:path');

const SETUP_WAIT_MS = 60000; // Setup must mount and present within this bound
const STUCK_MS = 15000; // far beyond Modal's 260 ms transition
const EXIT_WAIT_MS = 10000;
const SAVED_WATCH_MS = 5000;
const MAX_ROWS = 5000;

// Runs in the page. Reads only: no listeners, no rAF, no style or DOM writes.
function sampleStartup() {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
  const css = (el) => {
    const s = getComputedStyle(el);
    return { opacity: s.opacity, visibility: s.visibility, pointer_events: s.pointerEvents, display: s.display,
      inline_opacity: el.style.opacity, rect: rect(el),
      running_animations: el.getAnimations().filter(a => a.playState === 'running').length };
  };
  const hitAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const button = el.closest('button');
    let inBoot = false;
    for (let node = el; node; node = node.parentElement) {
      if (node.id === 'boot-overlay' || getComputedStyle(node).zIndex === '2147483647') inBoot = true;
    }
    return { tag: el.tagName.toLowerCase(), button: button ? (button.getAttribute('aria-label') || button.textContent.trim().slice(0, 40)) : null,
      has_button: Boolean(button), in_modal: Boolean(el.closest('[data-pupu-modal-overlay-host]')), in_boot: inBoot };
  };
  const isSkip = (el) => el.textContent.trim() === 'Skip for now';
  const hosts = [...document.querySelectorAll('[data-pupu-modal-overlay-host="true"]')];
  const host = hosts.find(row => [...row.querySelectorAll('button')].some(isSkip));
  let setup = null;
  if (host) {
    const skip = [...host.querySelectorAll('button')].find(isSkip);
    const box = rect(skip);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const hit = document.elementFromPoint(center.x, center.y);
    let effective = 1;
    for (let node = skip; node; node = node.parentElement) effective *= Number(getComputedStyle(node).opacity);
    setup = { overlay: css(host), panel: css(host.firstElementChild),
      skip: { ...css(skip), center, effective_opacity: effective, hit_is_skip: Boolean(hit && hit.closest('button') === skip), hit: hit ? hit.tagName.toLowerCase() : null } };
  }
  const toggle = document.querySelector('[aria-label="Open sidebar"],[aria-label="Close sidebar"]');
  const box = toggle ? rect(toggle) : null;
  return { page_ms: performance.now(), visibility: document.visibilityState, hidden: document.hidden, focus: document.hasFocus(),
    static_boot: Boolean(document.getElementById('boot-overlay')), modal_count: hosts.length, setup,
    hit_sidebar: box ? hitAt(box.x + box.width / 2, box.y + box.height / 2) : null,
    hit_center: hitAt(innerWidth / 2, innerHeight / 2), sidebar_label: toggle ? toggle.getAttribute('aria-label') : null };
}

function bootOnTop(sample) {
  return Boolean(sample.hit_center?.in_boot || sample.hit_sidebar?.in_boot);
}

function classify(sample) {
  if (sample.error) return 'sample_error';
  const boot = bootOnTop(sample);
  if (!sample.setup) return boot ? 'no_setup_boot_on_top' : (sample.modal_count ? 'other_modal' : 'no_setup');
  const { overlay, panel, skip } = sample.setup;
  if (boot) return 'setup_under_boot';
  const moving = overlay.running_animations + panel.running_animations > 0;
  const shown = Number(overlay.opacity) >= 0.99 && Number(panel.opacity) >= 0.99;
  if (overlay.inline_opacity === '0') return moving ? 'setup_exiting' : 'setup_mounted_opacity0_idle';
  if (moving || !shown) return 'setup_entering';
  const interactive = overlay.visibility === 'visible' && overlay.pointer_events !== 'none'
    && skip.rect.width > 0 && skip.rect.height > 0 && skip.effective_opacity > 0 && skip.hit_is_skip;
  return interactive ? 'setup_presented' : 'setup_shown_not_hittable';
}

function createStartupWatch({ page, generation, out, write, mark, sleep }) {
  const started = Date.now();
  const rows = [];
  const name = (suffix) => `startup-g${generation}-${suffix}`;
  let first = null, latest = null, stopped = false, lastKey = null, lastRow = 0;

  async function sample() {
    let row;
    try { row = await page.evaluate(sampleStartup); } catch (error) { row = { error: String(error).slice(0, 300) }; }
    row.t_ms = Date.now() - started; row.state = classify(row);
    return row;
  }
  function record(row) {
    latest = row; first = first || row;
    const key = JSON.stringify([row.state, row.visibility, row.focus, row.modal_count, row.setup?.overlay.opacity, row.setup?.panel.opacity,
      row.setup?.overlay.inline_opacity, row.setup?.skip.hit_is_skip, row.hit_sidebar?.button, row.hit_sidebar?.in_boot, row.hit_sidebar?.in_modal]);
    if ((key !== lastKey || row.t_ms - lastRow >= 1000) && rows.length < MAX_ROWS) { rows.push(row); lastKey = key; lastRow = row.t_ms; }
  }
  const loop = (async () => { while (!stopped) { record(await sample()); await sleep(50); } })();

  const saveTimeline = () => write(name('timeline.json'), rows);
  async function capture(label) {
    await page.screenshot({ path: path.join(out, name(`${label}.png`)) }).catch(() => {});
    fs.writeFileSync(path.join(out, name(`${label}-aria.txt`)), await page.locator('body').ariaSnapshot().catch(String));
  }
  async function stop() { stopped = true; await loop; saveTimeline(); }
  async function fail(code, detail) {
    const last = await sample(); record(last);
    await capture('failure');
    await stop();
    write(name('failure.json'), { code, detail, last });
    throw new Error(`${code}: ${detail}`);
  }
  async function waitFor(test, limit) {
    const end = Date.now() + limit;
    while (Date.now() < end) { const row = await sample(); record(row); if (test(row)) return row; await sleep(50); }
    return null;
  }
  // Time spent continuously in `states`, measured from the timeline.
  function dwell(states) {
    let since = null;
    for (const row of rows) since = states.includes(row.state) ? (since ?? row.t_ms) : null;
    return since === null ? 0 : Date.now() - started - since;
  }

  async function saved() {
    return page.evaluate(() => {
      const snapshot = window.settingsStorageAPI.bootstrap();
      return { available: snapshot?.available, degraded: snapshot?.degraded, migration: snapshot?.migration?.state,
        setup_completed: snapshot?.namespaces?.app?.setup_completed ?? null };
    });
  }
  const rafProbe = () => page.evaluate(() => new Promise((resolve) => {
    const start = performance.now(), fired = [];
    const finish = () => resolve({ fired_ms: fired, timed_out: fired.length < 2 });
    setTimeout(finish, 2000);
    requestAnimationFrame(() => { fired.push(performance.now() - start); requestAnimationFrame(() => { fired.push(performance.now() - start); finish(); }); });
  }));

  // Call straight after the boot gate click.
  async function settle() {
    const result = { generation, first_sample: first, skip_clicked: false, skip_click_t_ms: null };
    const postGate = await sample(); record(postGate);
    result.post_gate_sample = postGate; // baseline: precedes the rAF probe below
    result.saved_before = await saved();
    write(name('baseline.json'), result);
    const booted = await waitFor(row => !row.error && !row.static_boot && !bootOnTop(row), 15000);
    if (!booted) await fail('BOOT_OVERLAY_DID_NOT_EXIT', 'boot gate still on top 15 s after its click');
    result.boot_exit_t_ms = booted.t_ms; result.sample_after_boot_exit = booted;
    result.raf_probe = await rafProbe();
    mark('startup', 'rAF probe', { generation, ...result.raf_probe });

    if (result.saved_before.setup_completed) {
      const appeared = await waitFor(row => row.setup, SAVED_WATCH_MS);
      if (appeared) await fail('SETUP_MOUNTED_THOUGH_SAVED_COMPLETE', `state ${appeared.state}`);
      result.setup_expected = false;
    } else {
      result.setup_expected = true;
      let presented = 0, ready = null;
      const end = Date.now() + SETUP_WAIT_MS;
      while (Date.now() < end) {
        const row = await sample(); record(row);
        presented = row.state === 'setup_presented' ? presented + 1 : 0;
        if (presented >= 2) { ready = row; break; }
        if (dwell(['setup_mounted_opacity0_idle', 'setup_shown_not_hittable']) >= STUCK_MS) {
          await fail('SETUP_OVERLAY_NONINTERACTIVE', `stayed ${row.state} for ${STUCK_MS} ms`);
        }
        await sleep(50);
      }
      if (!ready) await fail('SETUP_NOT_PRESENTED', `last state ${latest.state} after ${SETUP_WAIT_MS} ms`);
      result.setup_presented_t_ms = ready.t_ms; result.sample_presented = ready;
      await capture('setup-presented');
      const confirm = await sample(); record(confirm);
      if (confirm.state !== 'setup_presented') await fail('SETUP_CHANGED_BEFORE_CLICK', `state ${confirm.state}`);
      const { x, y } = confirm.setup.skip.center;
      mark('ui', 'pointer click Skip for now', { generation, at: { x, y } });
      await page.mouse.click(x, y);
      result.skip_clicked = true; result.skip_click_t_ms = Date.now() - started; result.skip_click_at = { x, y };
      const gone = await waitFor(row => !row.error && !row.setup && row.modal_count === 0, EXIT_WAIT_MS);
      if (!gone) await fail('SETUP_OVERLAY_DID_NOT_EXIT', `state ${latest.state} ${EXIT_WAIT_MS} ms after Skip`);
      result.setup_gone_t_ms = gone.t_ms;
    }
    const reachable = await waitFor(row => row.hit_sidebar?.has_button && !row.hit_sidebar.in_modal && !row.hit_sidebar.in_boot, 5000);
    if (!reachable) await fail('SIDEBAR_CONTROL_NOT_REACHABLE', JSON.stringify(latest.hit_sidebar));
    result.sidebar_reachable_t_ms = reachable.t_ms; result.sample_sidebar_reachable = reachable;
    result.saved_after = await saved();
    await capture('ready');
    await stop();
    write(name('result.json'), result);
    mark('startup', 'first-run state settled', { generation, setup_expected: result.setup_expected, skip_clicked: result.skip_clicked });
    return result;
  }
  return { settle, stop };
}

module.exports = { createStartupWatch };
