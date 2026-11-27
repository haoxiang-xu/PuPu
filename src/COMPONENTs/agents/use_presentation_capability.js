import { useEffect, useState } from "react";
import { api } from "../../SERVICEs/api";
import { presentation_capability } from "../../SERVICEs/agent_resource_presentation_store";

/* Whether the imported runtime accepts `document.presentation`.
 *
 * Asked once per session through the managed-code facade (the same manifest
 * Rename is gated on) and remembered: the runtime is chosen when the app
 * starts and does not change under a running window. A failed question is
 * not remembered, so the next picker asks again. An old runtime refuses a
 * document carrying the key with `unknown_field`, both on Save and on the
 * Explorer's direct write, so the picker is disabled rather than letting a
 * choice produce a draft that cannot be saved. */

export const PRESENTATION_CHECKING = "checking";
export const PRESENTATION_SUPPORTED = "supported";
export const PRESENTATION_UNSUPPORTED = "unsupported";
export const PRESENTATION_UNKNOWN = "unknown";

let cached = null; // a settled verdict for this session
let pending = null;

function ask() {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  const method = api && api.unchain && api.unchain.getManagedCodeCapabilities;
  if (typeof method !== "function") return Promise.resolve(PRESENTATION_UNKNOWN);
  pending = Promise.resolve()
    .then(() => method())
    .then((response) => {
      cached = presentation_capability(response) ? PRESENTATION_SUPPORTED : PRESENTATION_UNSUPPORTED;
      /* For developers only: the app shows nothing, the icon is just not
         editable. */
      if (cached === PRESENTATION_UNSUPPORTED) {
        console.warn("[agent-icons] the imported runtime does not advertise skeleton_execution >= 1.9 with document_presentation_v1; Agent icons are read-only this session");
      }
      return cached;
    }, (error) => {
      console.warn("[agent-icons] runtime capability check failed; Agent icons are read-only until it succeeds", error && error.code);
      return PRESENTATION_UNKNOWN;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function usePresentationCapability(enabled = true) {
  const [state, setState] = useState(() => cached || PRESENTATION_CHECKING);
  useEffect(() => {
    if (!enabled) return undefined;
    let current = true;
    if (cached) {
      setState(cached);
      return undefined;
    }
    setState(PRESENTATION_CHECKING);
    ask().then((verdict) => {
      if (current) setState(verdict);
    });
    return () => {
      current = false;
    };
  }, [enabled]);
  return state;
}

export function resetPresentationCapabilityForTests() {
  cached = null;
  pending = null;
}
