import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ColorPicker from "../../../BUILTIN_COMPONENTs/color_picker/color_picker";
import Select from "../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../BUILTIN_COMPONENTs/input/segmented_button";
import Explorer from "../../../BUILTIN_COMPONENTs/explorer/explorer";
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
  persistBootPalette,
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

/* Tokens that become Explorer folder nodes with derived-tier children. Only
   "background" has any today (sidebar/surface are derived from it), but
   structuring this as a map — rather than hardcoding "background" inline —
   lets a future token join the same folder treatment without touching the
   data-building loop below. */
const DERIVED_CHILDREN = { background: ["sidebar", "surface"] };

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
    persistBootPalette(livePalette);
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

  /* icon + short text variant of the toolbar buttons */
  const textToolButtonStyle = (danger = false) => ({
    root: {
      height: 28,
      borderRadius: 8,
      paddingVertical: 0,
      paddingHorizontal: 10,
      fontSize: 12,
      gap: 6,
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
      icon: { width: 15, height: 15 },
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
  /* palette variant: maxHeight bounds the listbox only — panel look (radius
     22 frosted blur, hairline, sliding row highlight) is the variant's own,
     identical to the attach panel's dropdowns. */
  const selectDropdownStyle = { width: 224, maxHeight: 220 };
  const selectOptionStyle = { height: 34 };

  const autoBadgeStyle = {
    fontSize: 10,
    borderRadius: 99,
    padding: "2px 6px",
    backgroundColor: "rgba(var(--pupu-accent-rgb),0.14)",
    color: "rgba(var(--pupu-accent-rgb),0.9)",
  };

  /* Token tree for the BUILTIN Explorer (src/BUILTIN_COMPONENTs/explorer/explorer.js).
     Root is the flat list of top-level tokens themselves — not wrapped in a
     "Colors" header folder — so there is no collapsible root row to begin
     with (the CEO's "root can never collapse" constraint is met by
     construction, not by locking a folder). "background" is the one real
     folder, left freely collapsible; only its sidebar/surface children are
     nested under it. */
  const topLevelKeys = SEMANTIC_TOKEN_KEYS.filter(
    (k) => !ADVANCED_TIERS.includes(k),
  );
  const explorerRoot = [];
  const explorerData = {};
  for (const key of topLevelKeys) {
    explorerRoot.push(key);
    const childKeys = DERIVED_CHILDREN[key];

    if (!childKeys) {
      explorerData[key] = {
        label: TOKEN_LABELS[key],
        trailing: (
          <ColorPicker
            label={TOKEN_LABELS[key]}
            value={palette[key]}
            panel="rectangular"
            show_alpha={false}
            onPreview={(v) => previewThemeColor(editMode, key, v)}
            onCommit={(v) => commitThemeColor(key, v)}
          />
        ),
      };
      continue;
    }

    /* "background" folder row: keeps its "auto ×N" pill next to its own
       ColorPicker in the trailing slot, alongside the sidebar/surface tiers
       nested as children. Normal explorer expand/collapse — this is the one
       token allowed to fold. */
    explorerData[key] = {
      label: TOKEN_LABELS[key],
      children: childKeys,
      trailing: (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {autoTierCount > 0 && (
            <span style={autoBadgeStyle}>auto ×{autoTierCount}</span>
          )}
          <ColorPicker
            label={`${TOKEN_LABELS[key]} color`}
            value={palette[key]}
            panel="rectangular"
            show_alpha={false}
            onPreview={(v) => previewThemeColor(editMode, key, v)}
            onCommit={(v) => commitThemeColor(key, v)}
          />
        </div>
      ),
    };

    for (const childKey of childKeys) {
      explorerData[childKey] = {
        label: TOKEN_LABELS[childKey],
        custom_label: (
          <span>
            {TOKEN_LABELS[childKey]}
            {advState[childKey].isAuto && (
              <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 6 }}>
                auto
              </span>
            )}
          </span>
        ),
        trailing: (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!advState[childKey].isAuto && (
              <Button
                label="Auto"
                onClick={() => onResetTier(childKey)}
                style={smallBtnStyle}
              />
            )}
            <ColorPicker
              label={TOKEN_LABELS[childKey]}
              value={advState[childKey].value}
              panel="rectangular"
              show_alpha={false}
              onPreview={(v) => previewThemeColor(editMode, childKey, v)}
              onCommit={(v) => commitThemeColor(childKey, v)}
            />
          </div>
        ),
      };
    }
  }

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
          variant="palette"
          filterable={true}
          filter_mode="panel"
          style={selectStyle}
          dropdown_style={selectDropdownStyle}
            option_style={selectOptionStyle}
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
            label="Import"
            ariaLabel="Import theme"
            onClick={() => importInputRef.current && importInputRef.current.click()}
            style={textToolButtonStyle()}
          />
          <Button
            label="Export"
            ariaLabel="Export theme"
            onClick={onExport}
            style={textToolButtonStyle()}
          />
          <Button
            label={confirmingReset ? "Confirm?" : "Reset"}
            ariaLabel={confirmingReset ? "Confirm reset" : "Reset to default"}
            onClick={onResetClick}
            style={textToolButtonStyle(confirmingReset)}
          />
        </div>
      </div>

      <Explorer data={explorerData} root={explorerRoot} row_height={48} row_radius={9} style={{ width: "100%" }} />

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
