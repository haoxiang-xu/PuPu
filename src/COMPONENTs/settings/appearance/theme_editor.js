import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ColorPicker from "../../../BUILTIN_COMPONENTs/color_picker/color_picker";
import Select from "../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../BUILTIN_COMPONENTs/input/segmented_button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
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
  resolveThemeDetails,
} from "../../../CONTAINERs/config/theme_semantic";
import {
  readThemeSettings,
  writeThemePreset,
  writeThemeCustomColor,
  writeThemeCustom,
  writeThemeDetails,
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
    const liveDetails = resolveThemeDetails(activeMode, {
      preset: settings.preset,
      details: settings.details,
    });
    applySemanticCssVars(livePalette, undefined, liveDetails);
  };

  const syncCommittedSettings = (next) => {
    const livePalette = resolveSemanticPalette(activeMode, {
      preset: next.preset,
      custom: next.custom,
    });
    const details = resolveThemeDetails(activeMode, {
      preset: next.preset,
      details: next.details,
    });
    applySemanticCssVars(livePalette, undefined, details);
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
        const hasDetails =
          parsed &&
          parsed.details &&
          typeof parsed.details === "object" &&
          !Array.isArray(parsed.details);
        if (!hasPreset && !hasCustom) {
          toast.error("Theme file not recognized");
          return;
        }
        if (hasPreset) writeThemePreset(parsed.preset);
        if (hasCustom) writeThemeCustom(parsed.custom);
        if (hasDetails) writeThemeDetails(parsed.details);
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

  const autoTierCount = ADVANCED_TIERS.filter((k) => advState[k].isAuto).length;

  const iconButtonStyle = (danger = false) => ({
    root: {
      width: 28,
      height: 28,
      borderRadius: 8,
      paddingVertical: 0,
      paddingHorizontal: 0,
      iconOnlyPaddingVertical: 0,
      iconOnlyPaddingHorizontal: 0,
      color: danger
        ? "var(--pupu-danger)"
        : isDark
          ? "rgba(255,255,255,0.65)"
          : "rgba(0,0,0,0.55)",
      backgroundColor: danger ? "rgba(var(--pupu-danger-rgb),0.12)" : undefined,
    },
    background: {
      hoverBackgroundColor: danger
        ? "rgba(var(--pupu-danger-rgb),0.18)"
        : isDark
          ? "rgba(255,255,255,0.10)"
          : "rgba(0,0,0,0.06)",
      activeBackgroundColor: danger
        ? "rgba(var(--pupu-danger-rgb),0.22)"
        : isDark
          ? "rgba(255,255,255,0.14)"
          : "rgba(0,0,0,0.09)",
    },
    content: {
      icon: { width: 17, height: 17 },
    },
  });

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

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 12,
        }}
      >
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
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Button
            prefix_icon="import_tray"
            ariaLabel="Import theme"
            title="Import theme"
            onClick={() => importInputRef.current && importInputRef.current.click()}
            style={iconButtonStyle()}
          />
          <Button
            prefix_icon="export_tray"
            ariaLabel="Export theme"
            title="Export theme"
            onClick={onExport}
            style={iconButtonStyle()}
          />
          <Button
            prefix_icon="undo"
            ariaLabel={confirmingReset ? "Confirm reset" : "Reset to default"}
            title={confirmingReset ? "Confirm reset" : "Reset to default"}
            onClick={onResetClick}
            style={iconButtonStyle(confirmingReset)}
          />
        </div>
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
          ariaLabel="Background layers"
          onClick={() => setAdvancedOpen((o) => !o)}
          style={{
            root: {
              width: "100%",
              boxSizing: "border-box",
              borderRadius: 9,
              paddingVertical: 8,
              paddingHorizontal: 10,
              border: "1px solid rgba(var(--pupu-text-rgb),0.07)",
              backgroundColor: "rgba(var(--pupu-text-rgb),0.03)",
            },
            background: {
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.05)"
                : "rgba(0,0,0,0.03)",
            },
            content: {
              children: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              },
            },
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13, color: "rgba(var(--pupu-text-rgb),0.75)" }}>
              Background layers
            </span>
            {autoTierCount > 0 && (
              <span
                style={{
                  fontSize: 10,
                  borderRadius: 99,
                  padding: "2px 6px",
                  backgroundColor: "rgba(var(--pupu-accent-rgb),0.14)",
                  color: "rgba(var(--pupu-accent-rgb),0.9)",
                }}
              >
                auto ×{autoTierCount}
              </span>
            )}
          </span>
          <Icon
            src="arrow_down"
            color="rgba(var(--pupu-text-rgb),0.5)"
            style={{
              width: 14,
              height: 14,
              transform: advancedOpen ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          />
        </Button>
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

      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        onChange={onImport}
        style={{ display: "none" }}
      />
    </div>
  );
};

export default ThemeEditor;
