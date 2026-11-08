/* QA-only B4: find the real Send by its ArrowUp icon, wait for it and for the
 * startup recovery hint to clear, then press Enter once. Reads only; never
 * clicks Stop, never presses again.
 */
const fs = require('node:fs');
const path = require('node:path');

const ARROW_UP = 'M11.9999 10.8284L7.0502';
const STOP_ICON = 'M6 7V17C6 17.5523';
const RECOVERY_HINT = 'Waiting to retry restoring the interrupted run...';
const READY_LIMIT_MS = 30000;
const ACCEPT_LIMIT_MS = 5000;

function readComposer([arrowUp, hint]) {
  const box = document.querySelector('textarea');
  const buttons = box ? [...document.querySelectorAll('button')]
    .filter(button => box.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
    .filter(button => (button.querySelector('path')?.getAttribute('d') || '').startsWith(arrowUp)) : [];
  const sends = buttons.map((button) => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return { disabled: button.disabled, opacity: getComputedStyle(button).opacity, hit_is_button: Boolean(hit && hit.closest('button') === button) };
  });
  return { value: box ? box.value : null, sends, hint_visible: document.body.innerText.includes(hint) };
}

async function sendOnce({ page, input, label, out, mark, sleep, write }) {
  const read = () => page.evaluate(readComposer, [ARROW_UP, RECOVERY_HINT]);
  const ready = (row) => row.sends.length === 1 && !row.sends[0].disabled && row.sends[0].hit_is_button && !row.hint_visible;
  const startedWait = Date.now();
  let row = await read();
  while (!ready(row) && Date.now() - startedWait < READY_LIMIT_MS) { await sleep(50); row = await read(); }
  const record = { label, wait_ms: Date.now() - startedWait, before: row };
  const evidence = async (code) => {
    record.rows = await page.evaluate(() => window.__qa356Enter.rows);
    write(`send-${label}.json`, record);
    await page.screenshot({ path: path.join(out, `send-${label}.png`) }).catch(() => {});
    fs.writeFileSync(path.join(out, `send-${label}-aria.txt`), await page.locator('body').ariaSnapshot().catch(String));
    if (code) throw new Error(`${code}: ${label}`);
  };
  if (!ready(row)) await evidence('SEND_NOT_READY');
  await page.evaluate(name => window.__qa356Enter.snapshot(name, false), `pre_enter_${label}`);
  mark('ui', 'Send ready', { label, wait_ms: record.wait_ms });
  mark('ui', 'Enter', { label }); record.enter_ms = Date.now(); await input.press('Enter');
  const end = Date.now() + ACCEPT_LIMIT_MS;
  do { await sleep(50); row = await read(); } while (row.value !== '' && Date.now() < end);
  record.after = row; record.accepted_ms = Date.now();
  await evidence(row.value === '' ? '' : 'SEND_NOT_ACCEPTED');
}

module.exports = { sendOnce, STOP_ICON };
