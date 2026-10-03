import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { SettingsRow, SettingsSection } from "../appearance";
import contextV2Bridge from "../../../SERVICEs/bridges/context_v2_bridge";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const VALID_ROLLOUT_MODES = new Set(["all", "canary", "shadow", "off"]);

const isStatus = (value) =>
  value &&
  typeof value === "object" &&
  typeof value.available === "boolean" &&
  typeof value.readOnlyDegraded === "boolean" &&
  typeof value.featureCeiling === "string" &&
  typeof value.rolloutMode === "string";

const statusKey = (status) => {
  if (!isStatus(status)) return "unavailable";
  if (!status.available) return "unavailable";
  const mode = status.rolloutMode.trim().toLowerCase();
  const ceiling = status.featureCeiling.trim().toLowerCase();
  if (!VALID_ROLLOUT_MODES.has(mode) || !VALID_ROLLOUT_MODES.has(ceiling)) {
    return "unavailable";
  }
  if (
    ["off", "shadow"].includes(ceiling) &&
    !["off", "shadow"].includes(mode)
  ) {
    return "unavailable";
  }
  if (status.readOnlyDegraded) return "read_only";
  return mode;
};

export default function MemoryServiceStatus() {
  const { t } = useTranslation();
  const [state, setState] = useState("checking");
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const current = request.current + 1;
    request.current = current;
    setState("checking");
    try {
      const status = await contextV2Bridge.getStatus();
      if (request.current !== current) return;
      setState(statusKey(status));
    } catch {
      if (request.current !== current) return;
      setState("unavailable");
    }
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      request.current += 1;
    };
  }, [refresh]);

  return (
    <SettingsSection title={t("memory.current_memory")}>
      <SettingsRow
        label={t("memory.current_memory_status")}
        description={t("memory.current_memory_scope")}
      >
        <span
          role="status"
          aria-live="polite"
          style={{ fontSize: 12, color: "var(--pupu-text-secondary)" }}
        >
          {t(`memory.status_${state}`)}
        </span>
      </SettingsRow>
      <SettingsRow label={t("memory.current_memory_refresh")}>
        <Button
          label={t("memory.current_memory_refresh")}
          disabled={state === "checking"}
          onClick={refresh}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 14,
            borderRadius: 6,
            root: { backgroundColor: "var(--pupu-overlay-hover)" },
            background: { hoverBackgroundColor: "var(--pupu-overlay-active)" },
          }}
        />
      </SettingsRow>
    </SettingsSection>
  );
}
