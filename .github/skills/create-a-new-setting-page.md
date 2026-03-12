# Skill: Create a New Settings Page

Use this guide when adding a page to the Settings modal.

The current source of truth is:

- page registry: `src/COMPONENTs/settings/settings_modal.js`
- shared section primitives: `src/COMPONENTs/settings/appearance.js`

---

## 1. Current page registration model

The settings modal uses `BASE_SETTINGS_PAGES` in `src/COMPONENTs/settings/settings_modal.js`.

Current built-in pages are:

- `appearance`
- `model_providers`
- `runtime` (label: `Workspace`)
- `memory`
- `app_update`
- `local_storage`

There is also an optional dev page added separately when `isDevSettingsAvailable()` is true.

If you add a new page, register it in `BASE_SETTINGS_PAGES` unless it is intentionally conditional like the dev page.

---

## 2. File layout rule

Settings pages can be implemented in either of these forms:

- file-based: `src/COMPONENTs/settings/<page_name>.js`
- folder-based: `src/COMPONENTs/settings/<page_name>/index.js`

The repo already uses both patterns. `memory` is folder-based and imported as:

```js
import { MemorySettings } from "./memory";
```

`runtime` is also a useful reminder that the settings page can just wrap a shared editor:

```js
export const RuntimeSettings = () => <WorkspaceEditor isDark={isDark} />;
```

Do not force everything into a single-file convention if the page needs local helpers, storage, or hooks.

---

## 3. Registering a page

Add the import at the top of `settings_modal.js`, then add a page entry to `BASE_SETTINGS_PAGES`.

Pattern:

```js
import { MyNewSettings } from "./my_new_page";

const BASE_SETTINGS_PAGES = [
  // ...
  {
    key: "my_new_page",
    icon: "settings",
    label: "My New Page",
    component: MyNewSettings,
  },
];
```

The component is rendered automatically through:

```js
<ActivePageComponent onNavigate={setSelectedPage} />
```

That `onNavigate` prop is the supported way for one settings page to jump to another.

---

## 4. Current icon guidance

Use icon names that actually exist in `src/BUILTIN_COMPONENTs/icon/icon_manifest.js`.

Examples already used by the live settings registry:

- `color`
- `pentagon`
- `folder_2`
- `brain`
- `download_cloud`
- `data`
- `code`

Do not assume the page key and label match. The current `runtime` page is labeled `Workspace` and uses `folder_2`.

Do not copy old examples from stale docs without verifying the icon name in the manifest.

Quick check:

```bash
rg -n "download_cloud|brain|folder_2|data|pentagon|code|color" \
  src/BUILTIN_COMPONENTs/icon/icon_manifest.js
```

---

## 5. Page component contract

The current modal passes:

```js
({ onNavigate })
```

to the active page component.

Use `onNavigate("some_page_key")` when a page should send the user to another page.

Real example already in the repo:

- `MemorySettings` uses `onNavigate?.("model_providers")`

If your page does not need cross-page navigation, it can ignore the prop.

---

## 6. Layout primitives

Use the shared settings primitives from `appearance.js`:

- `SettingsSection`
- `SettingsRow`

Typical pattern:

```jsx
import { SettingsSection, SettingsRow } from "./appearance";

export const MyNewSettings = ({ onNavigate }) => {
  return (
    <div>
      <SettingsSection title="General">
        <SettingsRow label="Feature" description="What this controls">
          {/* control */}
        </SettingsRow>
      </SettingsSection>
    </div>
  );
};
```

Use `SettingsRow` for simple label/control pairs. For complex layouts, build directly inside `SettingsSection`.

---

## 7. Storage guidance

Most settings pages persist into the shared `"settings"` localStorage root, but you should still prefer page-local helpers.

Current examples:

- runtime/workspace helpers: `src/COMPONENTs/settings/runtime.js`
- model provider helpers: `src/COMPONENTs/settings/model_providers/storage.js`
- memory helpers: `src/COMPONENTs/settings/memory/storage.js`
- dev helpers: `src/COMPONENTs/settings/dev/storage.js`

If a page already has a storage helper, use it instead of adding direct `localStorage` writes inside the component.

---

## 8. Pitfalls

- Do not register the page in a stale `SETTINGS_PAGES` constant. The current registry is `BASE_SETTINGS_PAGES`.
- Do not assume every settings page is a single `.js` file. Folder-based pages are already a supported pattern.
- Do not invent your own cross-page navigation prop. Use `onNavigate`.
- Do not reference icon names that are not in `icon_manifest.js`.
- Do not assume the `runtime` page is about terminal/runtime internals; it is the Workspace settings surface.
- Do not add direct localStorage writes from settings pages when a page-specific storage helper already exists.

---

## 9. Add-a-page checklist

- [ ] Chose file-based or folder-based page structure intentionally
- [ ] Imported the page into `settings_modal.js`
- [ ] Registered it in `BASE_SETTINGS_PAGES`
- [ ] Used a valid icon from `icon_manifest.js`
- [ ] Used `SettingsSection` / `SettingsRow` where appropriate
- [ ] Used `onNavigate` for cross-settings jumps instead of custom wiring
- [ ] Added page-local storage/helpers near the page when needed
