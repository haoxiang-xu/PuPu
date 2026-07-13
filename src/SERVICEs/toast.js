import { emit } from "./toast_bus";

let nextId = 1;

/* all variants share one top-center stack; severity is conveyed by
   color and persistence, not by scattering piles across corners */
const DEFAULT_POSITION = "top";
const DEFAULT_DURATION = 4000;

function defaultDurationFor(type, options) {
  if (options.duration != null) return options.duration;
  if (type === "error" || type === "loading") return Infinity;
  if (options.action) return Infinity;
  return DEFAULT_DURATION;
}

function getErrorMessage(error) {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error?.message && typeof error.message === "string") {
    return error.message.trim() || "Something went wrong";
  }
  return "Something went wrong";
}

function getErrorDedupeKey(error, title, detail) {
  if (error?.code && typeof error.code === "string") {
    return `error:${title}:${error.code}`;
  }
  if (detail && detail !== title) {
    return `error:${title}:${detail}`;
  }
  return `error:${title}`;
}

function fire(type, message, options = {}) {
  const id = options.id || `toast-${nextId++}`;
  const event = {
    kind: "show",
    id,
    type,
    variant: type,
    message,
    title: options.title ?? message,
    description: options.description,
    duration: defaultDurationFor(type, options),
    position: options.position || DEFAULT_POSITION,
    action: options.action,
    progress: options.progress,
    important: !!options.important,
    material: options.material,
    dedupeKey: options.dedupeKey ?? `${type}:${message}`,
  };
  emit(event);
  return id;
}

function reportError(error, options = {}) {
  const detail = getErrorMessage(error);
  const title = options.title || options.context || detail;
  const description =
    options.description !== undefined
      ? options.description
      : title === detail
        ? undefined
        : detail;
  const dedupeKey =
    options.dedupeKey || getErrorDedupeKey(error, title, detail);

  return fire("error", title, {
    ...options,
    description,
    dedupeKey,
    important: options.important ?? true,
  });
}

export const toast = {
  success: (message, options) => fire("success", message, options),
  error:   (message, options) => fire("error", message, options),
  warning: (message, options) => fire("warning", message, options),
  info:    (message, options) => fire("info", message, options),
  loading: (message, options) => fire("loading", message, options),
  message: (message, options) => fire("default", message, options),
  reportError,
  update: (id, patch = {}) => emit({ kind: "update", id, ...patch }),
  dismiss: (id) => emit({ kind: "dismiss", id }),
  promise: (promise, messages = {}, options = {}) => {
    const id = toast.loading(messages.loading || "Loading...", options);
    const resolveText = (value, fallback, payload) =>
      typeof value === "function" ? value(payload) : value || fallback;

    Promise.resolve(promise).then(
      (value) => {
        toast.update(id, {
          type: "success",
          variant: "success",
          message: resolveText(messages.success, "Done", value),
          title: resolveText(messages.success, "Done", value),
          description: undefined,
          duration: options.successDuration,
          position: options.successPosition || DEFAULT_POSITION,
        });
      },
      (error) => {
        toast.update(id, {
          type: "error",
          variant: "error",
          message: resolveText(messages.error, "Error", error),
          title: resolveText(messages.error, "Error", error),
          description: undefined,
          duration: options.errorDuration,
          position: options.errorPosition || DEFAULT_POSITION,
        });
      },
    );
    return promise;
  },
};
