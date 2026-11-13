/* Persist an Agent resource's display-only presentation (icon + colour).
 *
 * `presentation` is an optional CLOSED top-level key of the Skeleton document
 * (see docs/implementation/agent-presentation-contract.md, BC-AP-001/002):
 *   absent | { icon?: /^[a-z0-9_]{1,40}$/, color?: /^#[0-9a-f]{6}$/ }
 * The runtime validates only that shape; PuPu owns the icon catalogue.
 *
 * The write goes through the same v2 aggregate the editor and the Agents
 * explorer's rename/duplicate use (load_resource → save_draft): the Code text
 * the resource owns is read with the graph and saved back with it unchanged,
 * so managed-Code resources (Default included) are written too. save_draft
 * announces the library refresh on success.
 *
 * Before writing, the imported runtime's manifest must advertise
 * skeleton_execution >= 1.9 with `document_presentation_v1`; an older runtime
 * would refuse the document with `unknown_field`, so the write is refused
 * here with `presentation_unsupported` and nothing is sent.
 *
 * Never throws: every failure is `{ ok: false, code, error? }`. */
import { api } from "./api";
import { checkManagedCodeResponse } from "./managed_code_api";
import { AGENT_PRESET_COLORS } from "./agent_resource_icons";
import {
  load_resource,
  save_draft,
} from "../COMPONENTs/agents/pages/recipes_page/skeleton_resources";

export const PRESENTATION_FEATURE = "document_presentation_v1";
export const PRESENTATION_MIN_MINOR = 9;

const ICON = /^[a-z0-9_]{1,40}$/;
const COLOR = /^#[0-9a-f]{6}$/;
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/* The exact value written: null (remove the key) or a fresh closed object
 * holding only the admitted fields. Anything else is refused locally. */
export function normalize_presentation(value) {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (!record(value)) return { ok: false };
  const keys = Object.keys(value);
  if (!keys.every((key) => key === "icon" || key === "color")) return { ok: false };
  const next = {};
  if (Object.prototype.hasOwnProperty.call(value, "icon")) {
    if (typeof value.icon !== "string" || !ICON.test(value.icon)) return { ok: false };
    next.icon = value.icon;
  }
  if (Object.prototype.hasOwnProperty.call(value, "color")) {
    /* PuPu writes only its own palette; the runtime itself stays
       format-only (#rrggbb). */
    if (typeof value.color !== "string" || !COLOR.test(value.color) ||
      !AGENT_PRESET_COLORS.includes(value.color)) return { ok: false };
    next.color = value.color;
  }
  /* An empty object is admitted by the runtime and means "default"; the
     writer stores the default as an absent key instead, so there is one
     representation of it on disk. */
  return { ok: true, value: Object.keys(next).length ? next : null };
}

/* The document to save: the current one with `presentation` set, or with
 * the key removed for null. Every other key, and key order, is kept. */
export function with_presentation(document, presentation) {
  const next = {};
  Object.keys(document).forEach((key) => {
    if (key !== "presentation") next[key] = document[key];
  });
  if (presentation !== null) next.presentation = { ...presentation };
  return next;
}

export function presentation_capability(response) {
  try {
    checkManagedCodeResponse("capabilities", response);
  } catch (_) {
    return false;
  }
  const manifest = response.runtime_manifest;
  const protocols = record(manifest) && Array.isArray(manifest.protocols) ? manifest.protocols : [];
  const skeleton = protocols.find((item) => record(item) && item.id === "skeleton_execution");
  return Boolean(
    skeleton && skeleton.major === 1 && Number.isSafeInteger(skeleton.minor) &&
      skeleton.minor >= PRESENTATION_MIN_MINOR && Array.isArray(skeleton.features) &&
      skeleton.features.includes(PRESENTATION_FEATURE),
  );
}

const failure = (code, error) => (error ? { ok: false, code, error } : { ok: false, code });
const code_of = (result, fallback) =>
  (result && result.error && result.error.code) || fallback;

export async function writeResourcePresentation(resourceId, presentation) {
  try {
    if (typeof resourceId !== "string" || !resourceId) return failure("invalid_resource_id");
    const normalized = normalize_presentation(presentation);
    if (!normalized.ok) return failure("invalid_presentation");

    let capabilities = null;
    try {
      capabilities = await api.unchain.getManagedCodeCapabilities();
    } catch (error) {
      return failure("presentation_capability_unavailable", error);
    }
    if (!presentation_capability(capabilities)) return failure("presentation_unsupported");

    const loaded = await load_resource(resourceId);
    if (!loaded.ok) return failure(code_of(loaded, "resource_load_failed"), loaded.error);
    const current = loaded.data;
    if (!record(current.document)) return failure("resource_document_missing");

    const document = with_presentation(current.document, normalized.value);
    const saved = await save_draft(document, current.edit_token, current.managed_sources);
    if (!saved.ok) return failure(code_of(saved, "resource_save_failed"), saved.error);
    return { ok: true, presentation: normalized.value, resource: saved.data };
  } catch (error) {
    return failure((error && error.code) || "presentation_write_failed", error);
  }
}

export default writeResourcePresentation;
