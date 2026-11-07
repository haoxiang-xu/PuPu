import { useEffect, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import { checkManagedCodeResponse } from "../../../../SERVICEs/managed_code_api";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const closed = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const nonempty = (value) => typeof value === "string" && value.length > 0;
const unavailable = (reason) => ({ allowed: false, reason });
export const LABEL_CAPABILITY_LOADING = "Checking the runtime's Rename support…";

/* This response comes only through the existing managed-code facade: Main
 * authenticates and deep-validates the imported manifest and its digest.
 * This admission checks the actual advertised feature; it never guesses from
 * a Git ref, environment, version string, or a locally recomputed digest. */
export function node_label_capability(response) {
  try { checkManagedCodeResponse("capabilities", response); } catch (_) {
    return unavailable("The runtime capability response is invalid.");
  }
  const manifest = response.runtime_manifest;
  if (!closed(manifest, ["schema", "runtime", "manifest_digest", "protocols"]) ||
      manifest.schema !== "unchain.runtime_protocol_manifest.v1" || manifest.runtime !== "unchain" ||
      typeof manifest.manifest_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(manifest.manifest_digest) || !Array.isArray(manifest.protocols)) {
    return unavailable("The runtime manifest is unavailable or invalid.");
  }
  const ids = new Set();
  for (const protocol of manifest.protocols) {
    if (!closed(protocol, ["id", "major", "minor", "features"]) || !nonempty(protocol.id) || ids.has(protocol.id) ||
        !Number.isSafeInteger(protocol.major) || protocol.major < 0 || !Number.isSafeInteger(protocol.minor) || protocol.minor < 0 ||
        !Array.isArray(protocol.features) || !protocol.features.every(nonempty) || new Set(protocol.features).size !== protocol.features.length) {
      return unavailable("The runtime manifest is invalid.");
    }
    ids.add(protocol.id);
  }
  const skeleton = manifest.protocols.find((protocol) => protocol.id === "skeleton_execution");
  if (!skeleton || skeleton.major !== 1 || skeleton.minor < 8 || !skeleton.features.includes("node_display_label_v1")) {
    return unavailable("This runtime does not support portable node names.");
  }
  return { allowed: true, reason: null };
}

export function useNodeLabelCapability(enabled, scope) {
  const [state, setState] = useState({ scope: null, ...unavailable(LABEL_CAPABILITY_LOADING) });
  useEffect(() => {
    let current = true;
    if (!enabled) {
      setState({ scope: null, ...unavailable(LABEL_CAPABILITY_LOADING) });
      return () => { current = false; };
    }
    setState({ scope, ...unavailable(LABEL_CAPABILITY_LOADING) });
    Promise.resolve().then(() => api.unchain.getManagedCodeCapabilities()).then(
      (response) => { if (current) setState({ scope, ...node_label_capability(response) }); },
      () => { if (current) setState({ scope, ...unavailable("The runtime's Rename support could not be checked.") }); },
    );
    return () => { current = false; };
  }, [enabled, scope]);
  if (!enabled) return unavailable("This view is read-only.");
  return state.scope === scope ? state : unavailable(LABEL_CAPABILITY_LOADING);
}
