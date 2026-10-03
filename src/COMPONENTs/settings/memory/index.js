import { useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { SettingsSection } from "../appearance";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import MemoryServiceStatus from "./memory_service_status";
import LegacyMemorySettings from "./legacy_memory_settings";

export const MemorySettings = ({ onNavigate }) => {
  const { t } = useTranslation();
  const [legacyOpen, setLegacyOpen] = useState(false);

  return (
    <div>
      <MemoryServiceStatus />
      <SettingsSection title={t("memory.legacy_memory")}>
        <div
          style={{
            fontSize: 12,
            color: "var(--pupu-text-secondary)",
            padding: "12px 0",
            lineHeight: 1.5,
          }}
        >
          {t("memory.legacy_memory_desc")}
        </div>
        <Button
          label={t(
            legacyOpen
              ? "memory.hide_legacy_settings"
              : "memory.show_legacy_settings",
          )}
          onClick={() => setLegacyOpen((current) => !current)}
          dom_props={{ "aria-expanded": legacyOpen }}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 14,
            borderRadius: 6,
            root: { backgroundColor: "var(--pupu-overlay-hover)" },
            background: { hoverBackgroundColor: "var(--pupu-overlay-active)" },
          }}
        />
      </SettingsSection>
      {legacyOpen && <LegacyMemorySettings onNavigate={onNavigate} />}
    </div>
  );
};

export default MemorySettings;
