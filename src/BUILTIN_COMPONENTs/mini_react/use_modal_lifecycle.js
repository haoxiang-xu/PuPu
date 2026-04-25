import { useEffect } from "react";

const ensureRegistry = () => {
  if (typeof window === "undefined") return null;
  if (!window.__pupuModalRegistry) {
    const open = new Set();
    window.__pupuModalRegistry = {
      open(id) {
        open.add(id);
      },
      close(id) {
        open.delete(id);
      },
      openIds() {
        return [...open];
      },
    };
  }
  return window.__pupuModalRegistry;
};

export const getModalRegistry = () => ensureRegistry();

export const useModalLifecycle = (id, isOpen) => {
  useEffect(() => {
    if (!isOpen) return undefined;
    const reg = ensureRegistry();
    if (!reg) return undefined;
    reg.open(id);
    return () => reg.close(id);
  }, [id, isOpen]);
};
