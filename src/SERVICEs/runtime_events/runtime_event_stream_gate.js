import { isFeatureFlagEnabled } from "../feature_flags";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const isRuntimeEventStreamV3Enabled = () => {
  if (typeof window !== "undefined" && window.localStorage) {
    const directFlag = window.localStorage.getItem("pupu.runtime_events_v3");
    if (TRUE_VALUES.has(String(directFlag || "").trim().toLowerCase())) {
      return true;
    }
  }

  return isFeatureFlagEnabled("enable_runtime_events_v3");
};
