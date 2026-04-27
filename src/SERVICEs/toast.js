import { emit } from "./toast_bus";

let nextId = 1;

function fire(type, message, options = {}) {
  const id = `toast-${nextId++}`;
  emit({
    kind: "show",
    id,
    type,
    message,
    duration: options.duration ?? 4000,
    dedupeKey: options.dedupeKey ?? `${type}:${message}`,
  });
  return id;
}

export const toast = {
  success: (message, options) => fire("success", message, options),
  error:   (message, options) => fire("error", message, options),
  info:    (message, options) => fire("info", message, options),
  dismiss: (id) => emit({ kind: "dismiss", id }),
};
