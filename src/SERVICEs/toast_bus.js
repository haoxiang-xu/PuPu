const subscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function emit(event) {
  for (const fn of subscribers) {
    try { fn(event); } catch (e) { console.error("[toast_bus] subscriber threw:", e); }
  }
}

export function _resetForTest() {
  subscribers.clear();
}
