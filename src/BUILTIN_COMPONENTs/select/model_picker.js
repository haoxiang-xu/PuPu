import React, { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { useTranslation } from "../mini_react/use_translation";
import Select from "./select";

export function modelPickerTriggerStyle({ isDark, color, floating = false }) {
  const fill = isDark ? 0.07 : 0.05;
  const wash = (target) => `rgba(var(--pupu-text-rgb),${Math.round(((target - fill) / (1 - fill)) * 1000) / 1000})`;
  return {
    height: 32,
    fontSize: 12,
    color,
    backgroundColor: `rgba(var(--pupu-text-rgb),${fill})`,
    borderRadius: floating ? 999 : 16,
    outline: "none",
    padding: "0 10px",
    hoverBackgroundColor: wash(isDark ? 0.14 : 0.1),
    activeBackgroundColor: wash(isDark ? 0.2 : 0.14),
  };
}

// Both Chat and Builder use this picker; only their catalogs and writes differ.
export default function ModelPicker({ style, floating = false, ...props }) {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  return <Select
    placeholder={t("chat.attach.select_model")}
    filterable
    filter_mode="panel"
    search_placeholder={t("model_providers.search_models")}
    show_trigger_icon
    dropdown_position="top"
    {...props}
    variant="palette"
    palette_chip="model"
    palette_rail
    keep_open_on_select
    style={{ ...modelPickerTriggerStyle({ isDark: onThemeMode === "dark_mode", color: theme?.color, floating }), maxWidth: 180, ...style }}
  />;
}
