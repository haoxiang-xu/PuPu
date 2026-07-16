/**
 * export_provider.js — write a custom provider's shareable JSON to disk.
 * Design §8.1/§8.2: the payload is built by the store's whitelist constructor
 * (never contains a secret). Prefers the Electron save dialog (parity with
 * chat_export.js); falls back to a Blob download in web-dev.
 */

import { runtimeBridge } from "../../../../SERVICEs/bridges/unchain_bridge";
import { buildProviderExportPayload } from "../../../../SERVICEs/custom_provider_store";

/**
 * Export the provider addressed by `slug`. Returns:
 *   { ok:true, via:"dialog"|"download" } | { ok:false, error }
 * `error` is "not_found" | "canceled" | "write_failed" | "unavailable".
 */
export const exportCustomProvider = async (slug) => {
  const payload = buildProviderExportPayload(slug);
  if (!payload) {
    return { ok: false, error: "not_found" };
  }
  const content = JSON.stringify(payload, null, 2);
  const fileName = `pupu-provider-${slug}.json`;

  // Electron path — native save dialog + writeFile.
  if (runtimeBridge.isExportImportAvailable()) {
    const dialogResult = await runtimeBridge.showSaveDialog({
      defaultPath: fileName,
      filters: [{ name: "JSON Files", extensions: ["json"] }],
    });
    if (dialogResult?.canceled) {
      return { ok: false, error: "canceled" };
    }
    const writeResult = await runtimeBridge.writeFile(
      dialogResult.filePath,
      content,
    );
    return writeResult?.ok
      ? { ok: true, via: "dialog" }
      : { ok: false, error: writeResult?.error || "write_failed" };
  }

  // Web-dev fallback — Blob + anchor download.
  if (typeof document === "undefined" || typeof Blob === "undefined") {
    return { ok: false, error: "unavailable" };
  }
  try {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { ok: true, via: "download" };
  } catch (_error) {
    return { ok: false, error: "write_failed" };
  }
};
