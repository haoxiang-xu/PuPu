import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ColorPicker from "../../../BUILTIN_COMPONENTs/color_picker/color_picker";
import Select from "../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../BUILTIN_COMPONENTs/input/segmented_button";
import ThemePreviewCard from "./theme_preview_card";
import { toast } from "../../../SERVICEs/toast";
import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_PRESETS,
} from "../../../BUILTIN_COMPONENTs/theme/semantic_tokens";
import {
  resolveSemanticPalette,
  applySemanticCssVars,
  applySemanticPaletteToTheme,
} from "../../../CONTAINERs/config/theme_semantic";
import {
  readThemeSettings,
  writeThemePreset,
  writeThemeCustomColor,
  writeThemeCustom,
  resetThemeSettings,
  clearThemeCustomColor,
} from "./storage";
import { ADVANCED_TIERS, advancedTokenState } from "./advanced_state";

const TOKEN_LABELS = {
  accent: "Accent",
  background: "Background",
  sidebar: "Sidebar",
  surface: "Surface",
  text: "Text",
  textMuted: "Muted text",
  border: "Border",
  success: "Success",
  danger: "Danger",
};

const PresetDots = ({ palette }) => (
  <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
    {["accent", "background", "surface", "text"].map((key) => (
      <span
        key={key}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: palette[key],
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.18)",
        }}
      />
    ))}
  </span>
);

const prettyPresetLabel = (name) =>
  name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const ThemeEditor = () => {
  const { onThemeMode, theme, setTheme } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const activeMode = onThemeMode === "dark_mode" ? "dark_mode" : "light_mode";

  const [settings, setSettings] = useState(() => readThemeSettings());
  const [editMode, setEditMode] = useState(activeMode);

  /* Keep the edited mode aligned with the active app theme so that, if the user
     flips light/dark while this editor is open, edits land on the mode they see.
     Manual tab clicks still work — this only re-syncs when onThemeMode changes. */
  useEffect(() => {
    setEditMode(activeMode);
  }, [activeMode]);

  const palette = resolveSemanticPalette(editMode, {
    preset: settings.preset,
    custom: settings.custom,
  });

  const presetOptions = Object.keys(SEMANTIC_PRESETS).map((name) => ({
    value: name,
    label: prettyPresetLabel(name),
    icon: <PresetDots palette={SEMANTIC_PRESETS[name][editMode]} />,
  }));

  const [draftColor, setDraftColor] = useState(null);

  const cardPalette = draftColor
    ? { ...palette, [draftColor.key]: draftColor.value }
    : palette;

  const previewThemeColor = (mode, key, value) => {
    setDraftColor({ key, value });
    if (mode !== activeMode) {
      return;
    }
    const livePalette = resolveSemanticPalette(activeMode, {
      preset: settings.preset,
      custom: {
        ...settings.custom,
        [mode]: {
          ...(settings.custom?.[mode] || {}),
          [key]: value,
        },
      },
    });
    applySemanticCssVars(livePalette);
  };

  const syncCommittedSettings = (next) => {
    const livePalette = resolveSemanticPalette(activeMode, {
      preset: next.preset,
      custom: next.custom,
    });
    applySemanticCssVars(livePalette);
    if (setTheme && theme) {
      setTheme(applySemanticPaletteToTheme(theme, livePalette, activeMode));
    }
  };

  const commitThemeColor = (key, value) => {
    setDraftColor(null);
    const next = writeThemeCustomColor(editMode, key, value);
    setSettings(next);
    if (editMode === activeMode) {
      syncCommittedSettings(next);
    }
  };

  const onPresetChange = (preset) => {
    setDraftColor(null);
    const next = writeThemePreset(preset);
    setSettings(next);
    syncCommittedSettings(next);
  };

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advState = advancedTokenState(settings, editMode, palette);

  const onResetTier = (key) => {
    setDraftColor(null);
    const next = clearThemeCustomColor(editMode, key);
    setSettings(next);
    if (editMode === activeMode) {
      syncCommittedSettings(next);
    }
  };

  const onReset = () => {
    setDraftColor(null);
    const next = resetThemeSettings();
    setSettings(next);
    syncCommittedSettings(next);
  };

  const [confirmingReset, setConfirmingReset] = useState(false);
  useEffect(() => {
    if (!confirmingReset) return undefined;
    const timer = setTimeout(() => setConfirmingReset(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmingReset]);

  const onResetClick = () => {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setConfirmingReset(false);
    onReset();
  };

  const importInputRef = useRef(null);

  const onExport = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pupu-theme.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const hasPreset =
          parsed && typeof parsed.preset === "string" && SEMANTIC_PRESETS[parsed.preset];
        const hasCustom =
          parsed && parsed.custom && typeof parsed.custom === "object";
        if (!hasPreset && !hasCustom) {
          toast.error("Theme file not recognized");
          return;
        }
        if (hasPreset) writeThemePreset(parsed.preset);
        if (hasCustom) writeThemeCustom(parsed.custom);
        const next = readThemeSettings();
        setSettings(next);
        syncCommittedSettings(next);
        toast.success("Theme imported");
      } catch (_err) {
        toast.error("Theme file not recognized");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const smallBtnStyle = {
    fontSize: 12,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 7,
    ...(isDark ? { hoverBackgroundColor: "rgba(255,255,255,0.10)" } : {}),
  };

  const selectStyle = {
    minWidth: 140,
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.05)",
  };
  const selectOptionStyle = { height: 28, padding: "4px 8px", fontSize: 13 };
  const selectDropdownStyle = { padding: 4, maxHeight: 220, minWidth: 180 };

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 12, opacity: 0.6, color: isDark ? "#fff" : "#222" }}>
          Preset
        </span>
        <Select
          options={presetOptions}
          value={settings.preset}
          set_value={onPresetChange}
          filterable={false}
          style={selectStyle}
          option_style={selectOptionStyle}
          dropdown_style={selectDropdownStyle}
        />
      </div>

      <ThemePreviewCard palette={cardPalette} />

      <div style={{ marginBottom: 12 }}>
        <SegmentedButton
          options={[
            { label: "Light", value: "light_mode" },
            { label: "Dark", value: "dark_mode" },
          ]}
          value={editMode}
          on_change={setEditMode}
          style={{ fontSize: 12, padding: 2 }}
          button_style={{ padding: "4px 10px" }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SEMANTIC_TOKEN_KEYS.filter((k) => !ADVANCED_TIERS.includes(k)).map((key) => (
          <div
            key={key}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
          >
            <span style={{ fontSize: 13, color: isDark ? "#fff" : "#222" }}>
              {TOKEN_LABELS[key]}
            </span>
            <ColorPicker
              label={TOKEN_LABELS[key]}
              value={palette[key]}
              panel="rectangular"
              show_alpha={false}
              onPreview={(v) => previewThemeColor(editMode, key, v)}
              onCommit={(v) => commitThemeColor(key, v)}
            />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <Button
          label={advancedOpen ? "Hide advanced" : "Advanced background"}
          onClick={() => setAdvancedOpen((o) => !o)}
          style={smallBtnStyle}
        />
        {advancedOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {ADVANCED_TIERS.map((key) => (
              <div
                key={key}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 13, color: isDark ? "#fff" : "#222" }}>
                  {TOKEN_LABELS[key]}
                  {advState[key].isAuto && (
                    <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>auto</span>
                  )}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {!advState[key].isAuto && (
                    <Button
                      label="Auto"
                      onClick={() => onResetTier(key)}
                      style={smallBtnStyle}
                    />
                  )}
                  <ColorPicker
                    label={TOKEN_LABELS[key]}
                    value={advState[key].value}
                    panel="rectangular"
                    show_alpha={false}
                    onPreview={(v) => previewThemeColor(editMode, key, v)}
                    onCommit={(v) => commitThemeColor(key, v)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button label="Export JSON" onClick={onExport} style={smallBtnStyle} />
        <Button
          label="Import JSON"
          onClick={() => importInputRef.current && importInputRef.current.click()}
          style={smallBtnStyle}
        />
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          onChange={onImport}
          style={{ display: "none" }}
        />
        <Button
          label={confirmingReset ? "Confirm reset" : "Reset to default"}
          onClick={onResetClick}
          style={{
            ...smallBtnStyle,
            ...(confirmingReset ? { color: "var(--pupu-danger)" } : {}),
          }}
        />
      </div>
    </div>
  );
};

export default ThemeEditor;
