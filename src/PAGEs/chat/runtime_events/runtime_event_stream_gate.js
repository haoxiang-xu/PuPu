const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

const parseSettings = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem("settings") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (_error) {
    return {};
  }
};

export const isRuntimeEventStreamV3Enabled = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  const directFlag = window.localStorage.getItem("pupu.runtime_events_v3");
  if (TRUE_VALUES.has(String(directFlag || "").trim().toLowerCase())) {
    return true;
  }

  const settings = parseSettings();
  const runtime =
    settings.runtime && typeof settings.runtime === "object"
      ? settings.runtime
      : {};
  return (
    runtime.enable_runtime_events_v3 === true ||
    runtime.runtime_events_v3 === true
  );
};
