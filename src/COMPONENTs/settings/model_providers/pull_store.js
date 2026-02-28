export const pull_store = {
  map: {},
  refs: {},
  listeners: new Set(),
  notify() {
    this.listeners.forEach((fn) => fn({ ...this.map }));
  },
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
  set(key, value) {
    this.map = { ...this.map, [key]: value };
    this.notify();
  },
  delete(key) {
    const { [key]: _, ...rest } = this.map;
    this.map = rest;
    this.notify();
  },
};

export default pull_store;
