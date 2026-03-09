# Skill: Modal Standard

Use this guide when a modal in the repo looks inconsistent with Settings/Tools baseline.

Current baseline source of truth:

- `src/COMPONENTs/settings/settings_modal.js`
- `src/COMPONENTs/toolkit/toolkit_modal.js`
- `src/BUILTIN_COMPONENTs/modal/modal.js`
- `src/BUILTIN_COMPONENTs/theme/default_mini_theme.json`

---

## 1. Standard close button spec

When the request says "align with settings/tools", use `Button` close control (not `ModalCloseButton`) and copy exact values:

```jsx
<Button
  prefix_icon="close"
  onClick={onClose}
  style={{
    position: "absolute",
    top: 12,
    right: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 6,
    opacity: 0.45,
    zIndex: 2,
    content: {
      prefixIconWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
      },
      icon: { width: 14, height: 14 },
    },
  }}
/>
```

Do not use "close enough" values.

---

## 2. Modal corner radius rule

For standardization tasks, do not hardcode modal corner radius in the target modal unless explicitly requested.

- Remove local overrides like `borderRadius: 14` / `16`.
- Let `Modal` inherit theme radius from `theme.modal.borderRadius` (currently `12` in both light/dark defaults).

---

## 3. Title typography rule

If the user asks title to match Settings, use:

- `fontSize: 22`
- `fontWeight: 600`
- `fontFamily: "NunitoSans, sans-serif"`

---

## 4. Empty-state side panel rule

If user asks to hide right detail panel when there is no data:

- Use conditional render on panel container, not just content.
- Default implementation:

```jsx
{status !== "empty" && <RightPanel />}
```

Keep loading/error behavior unchanged unless user asks otherwise.

---

## 5. Minimal-change workflow

1. Audit target modal against baseline:
- close button component + offsets
- border radius source
- title typography
- empty-state side panel behavior

2. Patch only requested mismatches in target modal.

3. Validate changed files:
- run file-level eslint on touched JS files
- run targeted tests only when behavior (not only visual style) was changed

4. Report:
- what was aligned
- exact values applied
- file references
- validation commands + results

---

## 6. Common pitfalls

- Mixing `ModalCloseButton` with Settings/Tools style requests.
- Keeping hardcoded modal radius and expecting visual parity.
- Updating title size but not font family/weight.
- Hiding only detail content in empty state while panel width still occupies layout.
