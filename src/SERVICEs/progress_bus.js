const actives = new Map();
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) {
    try { fn(getActive()); } catch (e) { console.error("[progress_bus]", e); }
  }
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function start(id, label) {
  actives.set(id, label);
  notify();
}

export function stop(id) {
  if (!actives.has(id)) return;
  actives.delete(id);
  notify();
}

export function getActive() {
  return { count: actives.size, labels: Array.from(actives.values()) };
}

export function _resetForTest() {
  actives.clear();
  subscribers.clear();
}
