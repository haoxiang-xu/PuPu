# Skill: Create a New Settings Page

This guide tells you exactly how to add a new page to the Settings modal in this codebase.  
Follow every rule below — do **not** invent patterns that are not described here.

---

## 1. File & folder convention

| What                        | Where                                                                      |
| --------------------------- | -------------------------------------------------------------------------- |
| Page component file         | `src/COMPONENTs/settings/<page_name>.js`                                   |
| Shared layout primitives    | `src/COMPONENTs/settings/appearance.js` (`SettingsSection`, `SettingsRow`) |
| Modal shell + page registry | `src/COMPONENTs/settings/settings_modal.js`                                |

Name the file with **snake_case** matching the page's registry key (e.g. key `"local_storage"` → file `local_storage.js`).

---

## 2. Register the page — `settings_modal.js`

Add one entry to the `SETTINGS_PAGES` array and import the component at the top of the file.

```js
// 1. Import
import { MyNewSettings } from "./my_new_page";

// 2. Register
const SETTINGS_PAGES = [
  {
    key: "appearance",
    icon: "color",
    label: "Appearance",
    component: AppearanceSettings,
  },
  {
    key: "my_new_page",
    icon: "settings",
    label: "My New Page",
    component: MyNewSettings,
  },
  // ...
];
```

**Icon names** must exist in `src/BUILTIN_COMPONENTs/icon/icon_manifest.js`.  
Check the `UISVGs` export map at the bottom of that file for the full list.  
Available icons include: `add`, `check`, `close`, `color`, `delete`, `edit`, `eye_open`, `global`, `home`, `key`, `lock`, `moon`, `more`, `search`, `settings`, `sun`, `tool`, `user`, etc.

No other changes to `settings_modal.js` are needed — the modal renders the page automatically.

---

## 3. Page component skeleton

Every settings page file must follow this exact structure:

```js
import { useContext, useState, useCallback, useEffect } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { SettingsSection, SettingsRow } from "./appearance";

/* ━━━━ Section comment block style ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ComponentName — one-line description                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const MyNewSettings = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div>
      <SettingsSection title="Section Title">
        <SettingsRow label="Row Label" description="Optional subtitle text">
          {/* control goes here */}
        </SettingsRow>
      </SettingsSection>
    </div>
  );
};
```

**Rules:**

- Always derive `isDark` from `onThemeMode === "dark_mode"` — never hard-code colours.
- Always use `theme?.font?.fontFamily || "inherit"` for body text when you need an explicit font.
- The page component receives no props — it reads everything it needs from `ConfigContext`.

---

## 4. Layout primitives

### `SettingsSection`

Groups related rows under an uppercase label with a subtle border-top.

```jsx
<SettingsSection title="General">{/* rows */}</SettingsSection>
```

### `SettingsRow`

A horizontal row with a label on the left and a control on the right.

```jsx
<SettingsRow label="Theme Mode" description="Choose light or dark">
  <Select ... />
</SettingsRow>
```

Use `SettingsRow` for **simple label + single control** pairs.  
For more complex sub-layouts (lists, custom cards), build directly inside `SettingsSection` without `SettingsRow`.

---

## 5. Mini UI components — use these, not HTML equivalents

Always prefer the built-in Mini UI components over plain HTML elements.

### `Button` — `src/BUILTIN_COMPONENTs/input/button`

```jsx
import Button from "../../BUILTIN_COMPONENTs/input/button";

<Button label="Save" onClick={handleSave} style={{ fontSize: 13, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 7 }} />

// Icon-only
<Button prefix_icon="close" onClick={onClose} style={{ paddingVertical: 5, paddingHorizontal: 5, borderRadius: 6, content: { icon: { width: 13, height: 13 } } }} />

// Danger styling
<Button
  label="Delete"
  onClick={handleDelete}
  style={{
    fontSize: 13,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 7,
    backgroundColor:      isDark ? "rgba(220,50,50,0.40)"  : "rgba(220,50,50,0.12)",
    hoverBackgroundColor: isDark ? "rgba(220,50,50,0.58)"  : "rgba(220,50,50,0.22)",
    color:                isDark ? "rgba(255,140,140,1)"    : "rgba(180,30,30,1)",
  }}
/>
```

**Key style props for `Button`:**

- `paddingVertical` / `paddingHorizontal` — override default padding
- `iconSize` — uniform icon size shorthand
- `hoverBackgroundColor` / `activeBackgroundColor` — interaction colours
- `content.icon.width` / `content.icon.height` — precise icon sizing
- `opacity` — for muted/secondary buttons

### `Select` — `src/BUILTIN_COMPONENTs/select/select`

```jsx
import Select from "../../BUILTIN_COMPONENTs/select/select";

<Select
  options={[
    { value: "a", label: "Option A" },
    { value: "b", label: "Option B" },
  ]}
  value={current}
  set_value={(val) => setCurrent(val)}
  filterable={false}
  style={{
    minWidth: 140,
    fontSize: 13,
    paddingVertical: 4,
    paddingHorizontal: 10,
  }}
  option_style={{ height: 28, padding: "4px 8px", fontSize: 13 }}
  dropdown_style={{ padding: 4 }}
/>;
```

### `Modal` — `src/BUILTIN_COMPONENTs/modal/modal`

```jsx
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";

<Modal
  open={isOpen}
  onClose={() => setIsOpen(false)}
  style={{
    width: 360,
    padding: "28px 28px 20px",
    backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
    display: "flex",
    flexDirection: "column",
    borderRadius: 12,
  }}
>
  {/* content */}
</Modal>;
```

- `open` / `onClose` are required.
- ESC and backdrop click automatically call `onClose`.
- The modal is portal-rendered — it always floats above everything.

### `Switch` — `src/BUILTIN_COMPONENTs/input/switch`

### `Slider` — `src/BUILTIN_COMPONENTs/input/slider`

### `TextField` — `src/BUILTIN_COMPONENTs/input/textfield`

Use these for toggles, range inputs, and text inputs respectively.  
Check each file's props directly; the pattern is the same as `Button` (style object with flat keys).

---

## 6. Scrolling — always use `.scrollable`

The page content wrapper in the modal already has `className="scrollable"`.  
**Do not add another scrollable container inside a page** — the outer one is enough.

If you build a sub-section that independently scrolls, add `className="scrollable"` to **that** element and give it an explicit `height` or `maxHeight`:

```jsx
<div
  className="scrollable"
  style={{ maxHeight: 300, overflowY: "auto" }}
>
  {items.map(...)}
</div>
```

The global `Scrollable` component (mounted once in `ConfigContainer`) detects every `.scrollable` element automatically, hides the native scrollbar, and renders the Mini UI overlay thumb. No other setup is needed.

---

## 7. Delete actions — always confirm with a Modal

**Never delete immediately on button click.**  
Every destructive action must open a confirmation `Modal` first.

### Standard delete confirm

```jsx
const ConfirmDeleteModal = ({ open, onClose, onConfirm, target, isDark }) => (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 360,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      borderRadius: 12,
    }}
  >
    {/* Red trash icon badge */}
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        marginBottom: 16,
        backgroundColor: isDark
          ? "rgba(220,50,50,0.15)"
          : "rgba(220,50,50,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* inline trash SVG */}
    </div>

    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
      }}
    >
      Delete this item?
    </div>

    {/* target name chip */}
    <div
      style={{
        fontFamily: "'SF Mono','Fira Code',monospace",
        fontSize: 12,
        padding: "6px 10px",
        borderRadius: 6,
        marginBottom: 24,
        backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {target}
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label="Cancel"
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label="Delete"
        onClick={onConfirm}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          backgroundColor: isDark
            ? "rgba(220,50,50,0.40)"
            : "rgba(220,50,50,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,50,50,0.58)"
            : "rgba(220,50,50,0.22)",
          color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
        }}
      />
    </div>
  </Modal>
);
```

Usage pattern inside a row:

```jsx
const MyRow = ({ item, isDark, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete(item.id);
        }}
        target={item.name}
        isDark={isDark}
      />
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ display: "flex", alignItems: "center" }}
      >
        {/* row content */}
        <div style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
          <Button
            prefix_icon="delete"
            onClick={() => setConfirmOpen(true)}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 5,
              opacity: 0.55,
              hoverBackgroundColor: isDark
                ? "rgba(255,80,80,0.15)"
                : "rgba(220,50,50,0.10)",
              content: { icon: { width: 11, height: 11 } },
            }}
          />
        </div>
      </div>
    </>
  );
};
```

### Warning-variant confirm (non-destructive but consequential)

Use an **amber** palette (instead of red) when the action resets or changes state rather than permanently deleting data:

```jsx
// icon background
backgroundColor: isDark ? "rgba(255,160,0,0.13)" : "rgba(200,120,0,0.09)";

// confirm button
backgroundColor: isDark ? "rgba(220,140,0,0.30)" : "rgba(200,120,0,0.12)";
hoverBackgroundColor: isDark ? "rgba(220,140,0,0.48)" : "rgba(200,120,0,0.22)";
color: isDark ? "rgba(255,200,80,1)" : "rgba(140,80,0,1)";
```

---

## 8. Theme-aware colour palette

All colours must adapt to `isDark`. Use these reference values consistently:

| Element           | Dark                     | Light                  |
| ----------------- | ------------------------ | ---------------------- |
| Primary text      | `rgba(255,255,255,0.90)` | `rgba(0,0,0,0.85)`     |
| Secondary text    | `rgba(255,255,255,0.45)` | `rgba(0,0,0,0.45)`     |
| Muted text        | `rgba(255,255,255,0.30)` | `rgba(0,0,0,0.30)`     |
| Row divider       | `rgba(255,255,255,0.04)` | `rgba(0,0,0,0.04)`     |
| Subtle background | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.04)`     |
| Pill background   | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.05)`     |
| Border            | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)`     |
| Bar track         | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.08)`     |
| Bar fill          | `rgba(255,255,255,0.45)` | `rgba(0,0,0,0.30)`     |
| Danger bg         | `rgba(220,50,50,0.40)`   | `rgba(220,50,50,0.12)` |
| Danger hover      | `rgba(220,50,50,0.58)`   | `rgba(220,50,50,0.22)` |
| Danger text       | `rgba(255,140,140,1)`    | `rgba(180,30,30,1)`    |
| Warning bg        | `rgba(220,140,0,0.30)`   | `rgba(200,120,0,0.12)` |
| Warning text      | `rgba(255,200,80,1)`     | `rgba(140,80,0,1)`     |

Modal backgrounds: dark `#1a1a1a` / light `#ffffff`.  
Settings panel background: dark `#141414` / light `#ffffff`.

---

## 9. Typography

| Role             | `fontSize` | `fontFamily`                        | Notes                                                         |
| ---------------- | ---------- | ----------------------------------- | ------------------------------------------------------------- |
| Page title       | `22`       | `"NunitoSans, sans-serif"`          | `fontWeight: 600` — rendered by the modal shell, not the page |
| Section label    | `11`       | `theme?.font?.fontFamily`           | uppercase, `letterSpacing: "1.5px"`, `opacity: 0.35`          |
| Row label        | `14`       | `theme?.font?.fontFamily`           |                                                               |
| Row description  | `12`       | `theme?.font?.fontFamily`           | `opacity: 0.45`                                               |
| Body / UI text   | `13`       | `theme?.font?.fontFamily`           |                                                               |
| Monospace / keys | `12`       | `"'SF Mono','Fira Code',monospace"` | for key names, CLI commands, code values                      |
| Size pills       | `11`       | —                                   | `fontVariantNumeric: "tabular-nums"`                          |

---

## 10. Visual size bars

When showing relative sizes across a list, use a thin track + filled bar pattern:

```jsx
const SizeBar = ({ ratio, isDark }) => (
  <div
    style={{
      width: 64,
      height: 3,
      borderRadius: 99,
      overflow: "hidden",
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    }}
  >
    <div
      style={{
        width: `${Math.max(ratio * 100, 3)}%`,
        height: "100%",
        borderRadius: 99,
        backgroundColor: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.30)",
        transition: "width 0.3s ease",
      }}
    />
  </div>
);
```

`ratio` = `item.size / largestItem.size` (range 0–1). The minimum rendered width is `3%` so zero-sized items still show a sliver.

---

## 11. Status pills

Use pill badges for state indicators (loading, counts, warnings):

```jsx
// neutral
<span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99,
               backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
               color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)" }}>
  3 items
</span>

// amber warning
<span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 99,
               backgroundColor: isDark ? "rgba(255,160,0,0.12)" : "rgba(200,120,0,0.08)",
               color: isDark ? "rgba(255,180,60,0.85)" : "rgba(160,90,0,0.85)" }}>
  offline
</span>
```

---

## 12. Inline confirmation (alternative to modal)

For **bulk** actions (e.g. "Clear all") where the target is implicit, use an inline confirmation panel instead of a modal — it replaces / appears adjacent to the trigger and avoids modal overhead:

```jsx
{confirmClear ? (
  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8,
                backgroundColor: isDark ? "rgba(220,50,50,0.12)" : "rgba(220,50,50,0.07)",
                border: `1px solid ${isDark ? "rgba(220,50,50,0.25)" : "rgba(220,50,50,0.18)"}` }}>
    <span style={{ flex: 1, fontSize: 12, color: isDark ? "rgba(255,120,120,0.9)" : "rgba(180,40,40,0.9)" }}>
      Clear all local storage?
    </span>
    <Button label="Cancel" onClick={() => setConfirmClear(false)} style={{ fontSize: 12, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 5, opacity: 0.7 }} />
    <Button label="Clear" onClick={handleClearAll} style={{ fontSize: 12, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 5,
      backgroundColor: isDark ? "rgba(220,50,50,0.45)" : "rgba(220,50,50,0.15)",
      hoverBackgroundColor: isDark ? "rgba(220,50,50,0.6)" : "rgba(220,50,50,0.25)",
      color: isDark ? "rgba(255,140,140,1)" : "rgba(180,40,40,1)" }} />
  </div>
) : (
  <Button label="Clear all" onClick={() => setConfirmClear(true)} ... />
)}
```

**Rule of thumb:** use an **inline confirm** for bulk top-level actions; use a **Modal confirm** for per-item deletes.

---

## 13. Hover-reveal delete buttons

Delete buttons on list rows must be **invisible by default** and fade in on hover:

```jsx
const [hovered, setHovered] = useState(false);

<div
  onMouseEnter={() => setHovered(true)}
  onMouseLeave={() => setHovered(false)}
>
  {/* row content */}
  <div style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
    <Button prefix_icon="delete" onClick={() => setConfirmOpen(true)} ... />
  </div>
</div>
```

Always use `prefix_icon="delete"` (trash icon) for delete row actions — never `"close"`.

---

## 14. Code comment style

Section dividers use a specific Unicode box-drawing style. Keep it consistent:

```js
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ComponentName — one-line description                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
```

Use `/* { ... } */` delimiters for import groups:

```js
/* { Components } -------------------------------------------- */
import Button from "...";
/* { Components } -------------------------------------------- */
```

---

## 15. Full checklist before submitting a new page

- [ ] File created at `src/COMPONENTs/settings/<key>.js`
- [ ] Page exported as a named export
- [ ] Entry added to `SETTINGS_PAGES` in `settings_modal.js` with a valid icon key
- [ ] `isDark` derived from `onThemeMode === "dark_mode"` — no hard-coded colours
- [ ] Content wrapped in `<SettingsSection>` with a title
- [ ] All user-facing controls use Mini UI components (`Button`, `Select`, `Switch`, etc.)
- [ ] Any scrolling sub-list uses `className="scrollable"` (not a custom scrollbar)
- [ ] Every per-item delete opens a `ConfirmDeleteModal` — no immediate deletes
- [ ] Bulk destructive actions use an inline confirm panel
- [ ] Delete row button is `prefix_icon="delete"`, hidden by default, fades in on hover
- [ ] All colours follow the theme-aware palette table in §8
- [ ] No `console.log` / debug code left in
