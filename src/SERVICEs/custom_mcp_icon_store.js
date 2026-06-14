/* Frontend-local store for user-uploaded Custom MCP icons.
   Curated Store entries carry their icon in the registry; custom MCP recipes
   don't travel an icon through the backend, so the uploaded image lives here in
   localStorage keyed by toolkitId (mcp.custom.*). The icon-resolution layer
   (mcp_toolkit_store.js) consults this so Installed / chat selector / agent
   builder render the uploaded icon instead of the backend's generic glyph. */

const STORAGE_KEY = "custom_mcp_icons";
const MAX_ENTRIES = 100;
const MAX_CONTENT_LENGTH = 400_000; // ~300KB decoded — keeps localStorage small

const VALID_MIME = new Set(["image/png", "image/svg+xml"]);

/* A valid file-toolkit-icon as ToolkitIcon expects: { type:"file", content, mimeType }. */
const isValidIcon = (icon) =>
  Boolean(
    icon &&
      icon.type === "file" &&
      typeof icon.content === "string" &&
      icon.content &&
      icon.content.length <= MAX_CONTENT_LENGTH &&
      VALID_MIME.has(icon.mimeType),
  );

const isCustomToolkitId = (toolkitId) =>
  typeof toolkitId === "string" && toolkitId.startsWith("mcp.custom.");

const readStore = () => {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return raw && typeof raw === "object" ? raw : {};
  } catch (_) {
    return {};
  }
};

const writeStore = (store) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
    // quota exceeded — silent
  }
};

/* Returns the stored file-icon for a custom toolkitId, or null. */
export function getCustomMcpIcon(toolkitId) {
  if (!isCustomToolkitId(toolkitId)) return null;
  const icon = readStore()[toolkitId];
  return isValidIcon(icon) ? icon : null;
}

/* Persists an uploaded icon for a custom toolkitId. Invalid icons are ignored.
   Passing a nullish icon removes any existing entry. */
export function setCustomMcpIcon(toolkitId, icon) {
  if (!isCustomToolkitId(toolkitId)) return;
  if (icon == null) {
    removeCustomMcpIcon(toolkitId);
    return;
  }
  if (!isValidIcon(icon)) return;
  const store = readStore();
  if (
    !Object.prototype.hasOwnProperty.call(store, toolkitId) &&
    Object.keys(store).length >= MAX_ENTRIES
  ) {
    return; // cap reached — don't grow unbounded
  }
  store[toolkitId] = {
    type: "file",
    content: icon.content,
    mimeType: icon.mimeType,
  };
  writeStore(store);
}

/* Drops the stored icon for a custom toolkitId (called on delete). */
export function removeCustomMcpIcon(toolkitId) {
  if (!isCustomToolkitId(toolkitId)) return;
  const store = readStore();
  if (Object.prototype.hasOwnProperty.call(store, toolkitId)) {
    delete store[toolkitId];
    writeStore(store);
  }
}
