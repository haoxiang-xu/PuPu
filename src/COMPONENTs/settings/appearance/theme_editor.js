import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ColorPicker from "../../../BUILTIN_COMPONENTs/color_picker/color_picker";
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
} from "./storage";

const TOKEN_LABELS = {
  accent: "Accent",
  background: "Background",
  surface: "Surface",
  text: "Text",
  textMuted: "Muted text",
  border: "Border",
  success: "Success",
  danger: "Danger",
};

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

  const syncLivePreview = (next) => {
    const livePalette = resolveSemanticPalette(activeMode, {
      preset: next.preset,
      custom: next.custom,
    });
    applySemanticCssVars(livePalette);
    if (setTheme && theme) {
      setTheme(applySemanticPaletteToTheme(theme, livePalette));
    }
  };

  const onColorChange = (key, value) => {
    const next = writeThemeCustomColor(editMode, key, value);
    setSettings(next);
    syncLivePreview(next);
  };

  const onPresetChange = (preset) => {
    const next = writeThemePreset(preset);
    setSettings(next);
    syncLivePreview(next);
  };

  const onReset = () => {
    const next = resetThemeSettings();
    setSettings(next);
    syncLivePreview(next);
  };

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
        if (
          parsed &&
          typeof parsed.preset === "string" &&
          SEMANTIC_PRESETS[parsed.preset]
        ) {
          writeThemePreset(parsed.preset);
        }
        if (parsed && parsed.custom) {
          writeThemeCustom(parsed.custom);
        }
        const next = readThemeSettings();
        setSettings(next);
        syncLivePreview(next);
      } catch (_err) {
        /* ignore malformed file */
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const tabStyle = (mode) => ({
    padding: "4px 12px",
    fontSize: 12,
    borderRadius: 7,
    cursor: "pointer",
    border: "none",
    backgroundColor:
      editMode === mode
        ? isDark
          ? "rgba(255,255,255,0.12)"
          : "rgba(0,0,0,0.08)"
        : "transparent",
    color: isDark ? "#fff" : "#222",
  });

  const btnStyle = {
    padding: "4px 12px",
    fontSize: 12,
    borderRadius: 7,
    cursor: "pointer",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
    backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    color: isDark ? "#fff" : "#222",
  };

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 12, opacity: 0.6, color: isDark ? "#fff" : "#222" }}>
          Preset
        </span>
        <select
          value={settings.preset}
          onChange={(e) => onPresetChange(e.target.value)}
          style={{ ...btnStyle, cursor: "pointer" }}
        >
          {Object.keys(SEMANTIC_PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button type="button" style={tabStyle("light_mode")} onClick={() => setEditMode("light_mode")}>
          Light
        </button>
        <button type="button" style={tabStyle("dark_mode")} onClick={() => setEditMode("dark_mode")}>
          Dark
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SEMANTIC_TOKEN_KEYS.map((key) => (
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
              onChange={(v) => onColorChange(key, v)}
            />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <label style={{ ...btnStyle, display: "inline-flex", alignItems: "center" }}>
          Import JSON
          <input type="file" accept="application/json" onChange={onImport} style={{ display: "none" }} />
        </label>
        <button type="button" style={btnStyle} onClick={onExport}>
          Export JSON
        </button>
        <button type="button" style={btnStyle} onClick={onReset}>
          Reset to default
        </button>
      </div>
    </div>
  );
};

export default ThemeEditor;
