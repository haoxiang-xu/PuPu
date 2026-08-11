import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ColorPicker from "../../../BUILTIN_COMPONENTs/color_picker/color_picker";
import Select from "../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../BUILTIN_COMPONENTs/input/segmented_button";
import Explorer from "../../../BUILTIN_COMPONENTs/explorer/explorer";
import { GradientSlider } from "../../../BUILTIN_COMPONENTs/input/slider";
import ThemePreviewCard from "./theme_preview_card";
import { toast } from "../../../SERVICEs/toast";
import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_PRESETS,
  SEMANTIC_FAMILIES,
  ALPHA_STEPS,
} from "../../../BUILTIN_COMPONENTs/theme/semantic_tokens";
import {
  roleWindow,
  SHELL_ROLES,
} from "../../../BUILTIN_COMPONENTs/theme/contrast_window";
import {
  resolveSemanticPalette,
  clampImportedCustom,
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
  writeThemeDetailValue,
  clearThemeDetailValue,
  readShowAllTiers,
  writeShowAllTiers,
} from "./storage";
import { ADVANCED_TIERS, advancedTokenState } from "./advanced_state";

/* Explorer folder nodes with derived-tier children — read from the
   SEMANTIC_FAMILIES single-source table (spec §3, P0). A future family added
   to that table gets the folder treatment here for free, without touching
   the data-building loop below. */
const DERIVED_CHILDREN = Object.fromEntries(
  Object.entries(SEMANTIC_FAMILIES).map(([root, fam]) => [root, fam.children]),
);

/* One short sentence per role, in the picker's own mono voice. The rule is
   stated up front rather than after a rejection — the point of a hard
   limit is that you never hit it by surprise. */
const LIMIT_HINTS = {
  shellDark: "Dark shell — light colors blocked",
  shellLight: "Light shell — dark colors blocked",
  text: "Body text — needs 4.5:1 on every surface",
  textMuted: "Muted text — needs 3:1 on every surface",
  hue: "Needs 1.9:1 against Background",
};

/* The editor owns the semantics and hands the picker plain luminance
   bands, so the primitive never learns what a token is. */
const constraintFor = (key, mode, palette) => {
  const bands = roleWindow(key, mode, palette);
  if (!bands.length) return undefined;
  let hint;
  if (SHELL_ROLES.includes(key)) {
    hint = mode === "dark_mode" ? LIMIT_HINTS.shellDark : LIMIT_HINTS.shellLight;
  } else if (key === "text" || key === "textMuted") {
    hint = LIMIT_HINTS[key];
  } else {
    hint = LIMIT_HINTS.hue;
  }
  return { bands, hint };
};

const MONO = "Menlo, Monaco, Consolas, monospace";

/* Compact metrics: 30px rows (Explorer's own default, same rhythm as the
   side menu) instead of 40. Two new roots land for free and the collapsed
   tree still gets SHORTER than before. */
const ROW_HEIGHT = 30;
const ROW_RADIUS = 7;
const ROW_FONT_SIZE = 13;

const OVERLAY_GROUP = "__overlay";

const alphaStepsFor = (key) =>
  ALPHA_STEPS.filter((step) => step.parent === key && !step.group);
const OVERLAY_STEPS = ALPHA_STEPS.filter((step) => step.group === "overlay");

const TOKEN_LABELS = {
  accent: "Accent",
  background: "Background",
  sidebar: "Sidebar",
  surface: "Surface",
  text: "Text",
  textMuted: "Muted text",
  border: "Border",
  success: "Success",
  warning: "Warning",
  danger: "Danger",
  info: "Info",
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

  const [showAllTiers, setShowAllTiers] = useState(() => readShowAllTiers());
  const onToggleShowAllTiers = () => {
    setShowAllTiers((prev) => {
      writeShowAllTiers(!prev);
      return !prev;
    });
  };

  /* Resolved alphas for the edited mode; a key present in
     settings.details[mode] means that step is PINNED. */
  const editDetails = resolveThemeDetails(editMode, {
    preset: settings.preset,
    details: settings.details,
  });
  const pinnedDetailKeys = new Set(
    Object.keys((settings.details && settings.details[editMode]) || {}),
  );
  const [alphaDraft, setAlphaDraft] = useState(null);

  const stepAlpha = (step) =>
    alphaDraft && alphaDraft.key === step.detailsKey
      ? alphaDraft.value
      : editDetails[step.detailsKey];

  const previewAlpha = (step, value) => {
    setAlphaDraft({ key: step.detailsKey, value });
    if (editMode !== activeMode) return;
    const liveDetails = resolveThemeDetails(activeMode, {
      preset: settings.preset,
      details: {
        ...settings.details,
        [editMode]: {
          ...((settings.details && settings.details[editMode]) || {}),
          [step.detailsKey]: value,
        },
      },
    });
    applySemanticCssVars(palette, undefined, liveDetails);
  };

  const commitAlpha = (step) => {
    if (!alphaDraft || alphaDraft.key !== step.detailsKey) return;
    const value = alphaDraft.value;
    setAlphaDraft(null);
    const next = writeThemeDetailValue(editMode, step.detailsKey, value);
    setSettings(next);
    if (editMode === activeMode) syncCommittedSettings(next);
  };

  /* Linked -> Pinned freezes the value you can currently see, so the flip
     itself is pixel-neutral; Pinned -> Linked drops the key and lets the
     value jump back to derived, which is a visible change the user just
     asked for. */
  const onToggleTierFollow = (childKey) => {
    setDraftColor(null);
    const next = advState[childKey].isLinked
      ? writeThemeCustomColor(editMode, childKey, advState[childKey].value)
      : clearThemeCustomColor(editMode, childKey);
    setSettings(next);
    if (editMode === activeMode) syncCommittedSettings(next);
  };

  const onToggleStepFollow = (step) => {
    setAlphaDraft(null);
    const next = pinnedDetailKeys.has(step.detailsKey)
      ? clearThemeDetailValue(editMode, step.detailsKey)
      : writeThemeDetailValue(editMode, step.detailsKey, editDetails[step.detailsKey]);
    setSettings(next);
    if (editMode === activeMode) syncCommittedSettings(next);
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
        let adjusted = 0;
        if (hasCustom) {
          /* A hand-edited file is the only way an illegal palette can get
             in. Rejecting the whole theme over one bad swatch is worse
             than fixing the swatch — but the fix has to be announced. */
          const clamped = clampImportedCustom(
            hasPreset ? parsed.preset : settings.preset,
            parsed.custom,
          );
          adjusted = clamped.adjusted;
          writeThemeCustom(clamped.custom);
        }
        if (hasDetails) writeThemeDetails(parsed.details);
        const next = readThemeSettings();
        setSettings(next);
        syncCommittedSettings(next);
        toast.success(
          adjusted
            ? `Theme imported · ${adjusted} color${adjusted === 1 ? "" : "s"} adjusted for readability`
            : "Theme imported",
        );
      } catch (_err) {
        toast.error("Theme file not recognized");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

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
  const selectOptionStyle = { height: 24, borderRadius: 14 };

  const linkedBadgeStyle = {
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
  /* ── row builders ──────────────────────────────────────────────────── */

  /* The accessible name carries the CHILD as well as the parent: two
     children of the same parent would otherwise be indistinguishable to a
     screen reader (and to a test). */
  const followToggle = (linked, selfLabel, parentLabel, onClick) => (
    <Button
      ariaLabel={
        linked
          ? `${selfLabel}: following ${parentLabel}, click to pin`
          : `${selfLabel}: pinned, click to follow ${parentLabel}`
      }
      title={
        linked
          ? `Following ${parentLabel} — click to pin`
          : `Pinned — click to follow ${parentLabel}`
      }
      prefix_icon={linked ? "link" : "pin"}
      onClick={onClick}
      style={{
        root: {
          width: 24,
          height: 24,
          borderRadius: 6,
          paddingVertical: 0,
          paddingHorizontal: 0,
          iconOnlyPaddingVertical: 0,
          iconOnlyPaddingHorizontal: 0,
          color: linked
            ? "rgba(var(--pupu-accent-rgb),0.70)"
            : "rgba(var(--pupu-text-rgb),0.45)",
        },
        background: {
          hoverBackgroundColor: "var(--pupu-overlay-hover)",
          activeBackgroundColor: "var(--pupu-overlay-active)",
        },
        content: { icon: { width: 14, height: 14 } },
      }}
    />
  );

  /* Family roots keep the " color" suffix so a screen reader can tell the
     picker apart from the expander row that carries the same name. Whether
     the row has children must NOT depend on the Show-all-tiers toggle, or
     the accessible name would change under the user. */
  const colorPickerFor = (key, value) => (
    <ColorPicker
      label={
        DERIVED_CHILDREN[key]
          ? `${TOKEN_LABELS[key]} color`
          : TOKEN_LABELS[key] || key
      }
      value={value}
      panel="rectangular"
      show_alpha={false}
      size="compact"
      constraint={constraintFor(key, editMode, palette)}
      onPreview={(v) => previewThemeColor(editMode, key, v)}
      onCommit={(v) => commitThemeColor(key, v)}
    />
  );

  const alphaRow = (step) => {
    const parentColor = palette[step.parent];
    const alpha = stepAlpha(step);
    const pinned = pinnedDetailKeys.has(step.detailsKey);
    return {
      label: step.label,
      custom_label: (
        <span>
          {step.label}
          {step.shared && (
            <span
              style={{
                fontSize: 10,
                opacity: 0.45,
                marginLeft: 6,
                color: "var(--pupu-text-faint)",
              }}
            >
              shared
            </span>
          )}
        </span>
      ),
      trailing: (
        <div
          style={{ display: "flex", alignItems: "center", gap: 8 }}
          onPointerUp={() => commitAlpha(step)}
        >
          {followToggle(
            !pinned,
            step.label,
            TOKEN_LABELS[step.parent] || step.parent,
            () => onToggleStepFollow(step),
          )}
          <div style={{ width: 96 }}>
            <GradientSlider
              value={Math.round(alpha * 100)}
              set_value={(v) => previewAlpha(step, Math.round(v) / 100)}
              min={0}
              max={100}
              show_tooltip={false}
              gradient={`linear-gradient(to right, transparent, ${parentColor})`}
              style={{
                gradientThumbBackground: parentColor,
                gradientTrackBorderColor: "var(--pupu-border-subtle)",
                gradientTrackBorderWidth: 2,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 11,
              minWidth: 28,
              textAlign: "right",
              color: "var(--pupu-text-secondary)",
            }}
          >
            {alpha.toFixed(2)}
          </span>
        </div>
      ),
    };
  };

  /* ── tree ──────────────────────────────────────────────────────────── */

  const topLevelKeys = SEMANTIC_TOKEN_KEYS.filter(
    (k) => !ADVANCED_TIERS.includes(k),
  );
  const explorerRoot = [];
  const explorerData = {};

  for (const key of topLevelKeys) {
    explorerRoot.push(key);
    const tierChildren = DERIVED_CHILDREN[key] || [];
    const stepChildren = showAllTiers ? alphaStepsFor(key) : [];
    const childKeys = [...tierChildren, ...stepChildren.map((s) => s.key)];

    const linkedCount = tierChildren.filter((k) => advState[k].isLinked).length;

    explorerData[key] = {
      label: TOKEN_LABELS[key],
      ...(childKeys.length ? { children: childKeys } : {}),
      trailing: (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {linkedCount > 0 && (
            <span style={linkedBadgeStyle}>linked ×{linkedCount}</span>
          )}
          {colorPickerFor(key, palette[key])}
        </div>
      ),
    };

    for (const childKey of tierChildren) {
      const linked = advState[childKey].isLinked;
      explorerData[childKey] = {
        label: TOKEN_LABELS[childKey],
        trailing: (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {followToggle(linked, TOKEN_LABELS[childKey], TOKEN_LABELS[key], () =>
              onToggleTierFollow(childKey),
            )}
            <ColorPicker
              label={TOKEN_LABELS[childKey]}
              value={advState[childKey].value}
              panel="rectangular"
              show_alpha={false}
              size="compact"
              constraint={constraintFor(childKey, editMode, palette)}
              onPreview={(v) => previewThemeColor(editMode, childKey, v)}
              onCommit={(v) => commitThemeColor(childKey, v)}
            />
          </div>
        ),
      };
    }

    for (const step of stepChildren) {
      explorerData[step.key] = alphaRow(step);
    }
  }

  /* Overlay has no root colour of its own — it is neutral ink over the
     shell, so it derives from Text. Showing it as its own reference row
     rather than burying four "fill" steps inside Text keeps the fill-vs-
     stroke distinction legible, which is the entire reason overlay and
     border are separate families. */
  if (showAllTiers) {
    explorerRoot.push(OVERLAY_GROUP);
    explorerData[OVERLAY_GROUP] = {
      label: "Overlay",
      children: OVERLAY_STEPS.map((s) => s.key),
      trailing: (
        <span
          style={{
            fontSize: 11,
            color: "var(--pupu-text-faint)",
            paddingRight: 4,
          }}
        >
          follows Text
        </span>
      ),
    };
    for (const step of OVERLAY_STEPS) {
      explorerData[step.key] = alphaRow(step);
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
            label={showAllTiers ? "Hide tiers" : "Show all tiers"}
            ariaLabel={showAllTiers ? "Hide tiers" : "Show all tiers"}
            onClick={onToggleShowAllTiers}
            style={textToolButtonStyle()}
          />
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

      <Explorer
        data={explorerData}
        root={explorerRoot}
        row_height={ROW_HEIGHT}
        row_radius={ROW_RADIUS}
        row_hover={false}
        style={{ width: "100%", fontSize: ROW_FONT_SIZE }}
      />

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
