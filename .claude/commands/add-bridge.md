# Add a New Electron IPC Bridge

Create a new IPC bridge between the React renderer and Electron main process.

## Arguments
- $ARGUMENTS: Bridge name and description (e.g. "clipboard System clipboard read/write access")

## Steps

1. Read `.github/skills/electron-ipc-runtime-boundary.md` for the IPC pattern
2. Read existing bridges for reference:
   - `electron/preload/bridges/miso_bridge.js` (complex, with streaming)
   - `electron/preload/bridges/app_info_bridge.js` (simple)
3. Read `electron/shared/channels.js` for the channel naming pattern

4. **Step 1: Define channels** in `electron/shared/channels.js`:
   ```js
   MY_FEATURE: {
     GET_DATA: "my-feature:get-data",
     SET_DATA: "my-feature:set-data",
   },
   ```

5. **Step 2: Create preload bridge** at `electron/preload/bridges/<name>_bridge.js`:
   ```js
   const { CHANNELS } = require("../../shared/channels");

   const create<Name>Bridge = (ipcRenderer) => ({
     getData: () => ipcRenderer.invoke(CHANNELS.MY_FEATURE.GET_DATA),
     setData: (data) => ipcRenderer.invoke(CHANNELS.MY_FEATURE.SET_DATA, data),
   });

   module.exports = { create<Name>Bridge };
   ```

6. **Step 3: Register in preload** at `electron/preload/index.js`:
   - Import bridge factory
   - Add to `contextBridge.exposeInMainWorld("<name>API", bridge)`

7. **Step 4: Register IPC handlers** in `electron/main/ipc/register_handlers.js`:
   - Add channel to `IPC_HANDLE_CHANNELS` array
   - Add handler: `ipcMain.handle(CHANNELS.MY_FEATURE.GET_DATA, ...)`

8. **Step 5: Create service** (if needed) in `electron/main/services/<name>/service.js`

9. **Step 6: Create renderer-side service** in `src/SERVICEs/bridges/<name>_bridge.js`:
   ```js
   export const hasBridge = () =>
     typeof window !== "undefined" && window.<name>API != null;

   export const getData = async () => {
     if (!hasBridge()) throw new Error("<name> bridge unavailable");
     return window.<name>API.getData();
   };
   ```

10. Add channel to test: `electron/tests/main/ipc_channels.test.cjs`
11. Write preload bridge test: `electron/tests/preload/<name>_bridge.test.cjs`

**IMPORTANT**: Never access `ipcRenderer` from renderer code. Always go through the bridge.
