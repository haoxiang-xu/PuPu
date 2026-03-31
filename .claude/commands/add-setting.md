# Add a New Settings Page

Create a new settings section in the PuPu settings UI.

## Arguments
- $ARGUMENTS: Setting name and description (e.g. "keyboard_shortcuts Customizable keyboard shortcut bindings")

## Steps

1. Read `.github/skills/create-a-new-setting-page.md` for the full pattern
2. Read an existing settings page for reference:
   - Simple: `src/COMPONENTs/settings/memory/`
   - Complex: `src/COMPONENTs/settings/model_providers/`
3. Read `src/COMPONENTs/settings/` to understand the settings navigation structure

4. Create the settings section:
   ```
   src/COMPONENTs/settings/<name>/
     index.js           — Main settings section component
     storage.js         — localStorage read/write helpers (if needed)
     components/        — Sub-components (if needed)
   ```

5. Storage pattern — use `src/SERVICEs/` helpers:
   ```js
   // storage.js
   const STORAGE_KEY = "settings";

   export const readMySettings = () => {
     try {
       const root = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
       return root?.my_section || {};
     } catch { return {}; }
   };

   export const writeMySettings = (updates) => {
     const root = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
     root.my_section = { ...(root.my_section || {}), ...updates };
     localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
   };
   ```

6. Follow inline style convention with `isDark` from ConfigContext
7. Register in the settings navigation
8. Write a test for the storage helpers
