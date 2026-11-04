/* QA-only checkpoint 11: record one cold-start Enter. The page side only adds
 * listeners and a timer that read state; nothing cancels events, writes the
 * DOM or React state, or calls a send function. One Enter, no retry.
 */
const fs = require('node:fs');
const path = require('node:path');

// Runs in the page, before the boot gate is clicked.
function installRecorder() {
  if (window.__qa356Enter) return;
  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (el) => { if (!ids.has(el)) ids.set(el, nextId++); return ids.get(el); };
  const describe = (el) => (el && el.tagName ? { id: idOf(el), tag: el.tagName.toLowerCase(),
    aria_label: el.getAttribute('aria-label'), placeholder: el.getAttribute('placeholder'),
    role: el.getAttribute('role'), connected: el.isConnected } : null);
  const stamp = () => ({ wall_ms: Date.now(), page_ms: performance.now() });
  const rows = [];
  const push = (row) => { if (rows.length < 20000) rows.push({ ...stamp(), ...row }); };
  const textbox = () => document.querySelector('textarea');
  const following = (box, limit) => (box ? [...document.querySelectorAll('button')]
    .filter(button => box.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).slice(0, limit) : []);
  const buttonRow = (button, withHit) => {
    const box = button.getBoundingClientRect();
    const row = { ...describe(button), disabled: button.disabled, opacity: getComputedStyle(button).opacity,
      rect: { x: box.x, y: box.y, width: box.width, height: box.height },
      icon_path: (button.querySelector('path')?.getAttribute('d') || '').slice(0, 60) };
    if (withHit) {
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      row.hit = describe(hit); row.hit_is_button = Boolean(hit && hit.closest('button') === button);
    }
    return row;
  };
  const state = (withHit) => {
    const box = textbox();
    return { active: describe(document.activeElement), document_focus: document.hasFocus(), visibility: document.visibilityState,
      box: box ? { ...describe(box), value: box.value, disabled: box.disabled, read_only: box.readOnly } : null,
      after_box: following(box, 3).map(button => buttonRow(button, withHit)) };
  };
  const onEvent = (phase) => (event) => push({ source: 'event', phase, type: event.type, target: describe(event.target),
    key: event.key, code: event.code, is_trusted: event.isTrusted, is_composing: event.isComposing, repeat: event.repeat,
    ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey, default_prevented: event.defaultPrevented });
  for (const type of ['keydown', 'keypress', 'keyup', 'beforeinput', 'input', 'compositionstart', 'compositionend', 'focusin', 'focusout']) {
    window.addEventListener(type, onEvent('window_capture'), true);
    window.addEventListener(type, onEvent('window_bubble'), false);
  }
  let last = '';
  setInterval(() => {
    const current = state(false), key = JSON.stringify(current);
    if (key !== last) { last = key; push({ source: 'sample', ...current }); }
  }, 20);
  window.__qa356Enter = { rows, snapshot(label, withChat) {
    const row = { source: 'snapshot', label, ...state(true),
      agent: document.querySelector('[data-testid="attach-agent-row"]')?.textContent?.trim() ?? null };
    if (withChat) row.active_chat_id = window.chatStorageAPI.bootstrap().activeChatId;
    push(row);
  } };
}

async function observeEnter({ page, out, control, mark, wires, sleep, expect, input, text }) {
  const node = {};
  const at = (name) => { node[name] = Date.now(); };
  const snapshot = (label, withChat = false) => page.evaluate(([name, chat]) => window.__qa356Enter.snapshot(name, chat), [label, withChat]);
  await snapshot('before_fill', true);
  at('fill_start'); await input.fill(text); at('fill_done'); mark('ui', 'composer filled', { turn: 2 });
  await expect(input.locator('xpath=following::button[2]')).toBeEnabled({ timeout: 30000 }); at('send_enabled'); mark('ui', 'Send enabled', { turn: 2 });
  await snapshot('pre_enter');
  mark('ui', 'Enter', { turn: 2 }); at('enter_start'); await input.press('Enter'); at('enter_done');
  await snapshot('post_enter');
  const started = Date.now();
  for (const after of [100, 500, 1000, 2000, 5000]) {
    await sleep(Math.max(0, after - (Date.now() - started)));
    await snapshot(`post_enter_${after}ms`, after === 5000);
  }
  at('observation_end');
  const rows = await page.evaluate(() => window.__qa356Enter.rows);
  await page.screenshot({ path: path.join(out, 'after-observation.png') });
  fs.writeFileSync(path.join(out, 'after-observation-aria.txt'), await page.locator('body').ariaSnapshot());
  fs.writeFileSync(path.join(out, 'enter-observation.json'), `${JSON.stringify({ control, text, node, rows, provider_wires: wires.length }, null, 2)}\n`);
}

module.exports = { installRecorder, observeEnter };
