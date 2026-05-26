import { useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const ALLOWED_FALLBACK_RENDERERS = new Set([
  "markdown",
  "text",
  "table",
  "kv",
  "log",
  "link",
  "json",
]);

export const COMPATIBILITY_ARTIFACT_KIND_DEFAULTS = Object.freeze({
  file_diff: Object.freeze({
    kind: "file_diff",
    displayName: "Files changed",
    description: "Immutable snapshots of file changes produced by tools.",
    icon: Object.freeze({ type: "builtin", name: "file_edit" }),
    fallbackRenderer: "json",
    toolkitId: "builtin",
  }),
  plan: Object.freeze({
    kind: "plan",
    displayName: "Plan",
    description: "Plan snapshots produced by PlanToolkit.",
    icon: Object.freeze({ type: "builtin", name: "check_list" }),
    fallbackRenderer: "markdown",
    toolkitId: "builtin",
  }),
  markdown: Object.freeze({
    kind: "markdown",
    displayName: "Markdown",
    description: "Markdown artifact snapshots.",
    icon: Object.freeze({ type: "builtin", name: "markdown" }),
    fallbackRenderer: "markdown",
    toolkitId: "builtin",
  }),
  table: Object.freeze({
    kind: "table",
    displayName: "Table",
    description: "Tabular artifact snapshots.",
    icon: Object.freeze({ type: "builtin", name: "data" }),
    fallbackRenderer: "table",
    toolkitId: "builtin",
  }),
  kv: Object.freeze({
    kind: "kv",
    displayName: "Metadata",
    description: "Key-value artifact snapshots.",
    icon: Object.freeze({ type: "builtin", name: "information" }),
    fallbackRenderer: "kv",
    toolkitId: "builtin",
  }),
  log: Object.freeze({
    kind: "log",
    displayName: "Log",
    description: "Log artifact snapshots.",
    icon: Object.freeze({ type: "builtin", name: "terminal" }),
    fallbackRenderer: "log",
    toolkitId: "builtin",
  }),
  link: Object.freeze({
    kind: "link",
    displayName: "Link",
    description: "Link artifact snapshots.",
    icon: Object.freeze({ type: "builtin", name: "link" }),
    fallbackRenderer: "link",
    toolkitId: "builtin",
  }),
});

const BUILTIN_KIND_NAMES = new Set(
  Object.keys(COMPATIBILITY_ARTIFACT_KIND_DEFAULTS),
);

const humanizeKind = (kind) =>
  String(kind || "Artifact")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (ch) => ch.toUpperCase()) || "Artifact";

const stringValue = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

const normalizeIcon = (icon) => {
  if (typeof icon === "string" && icon.trim()) {
    return { type: "builtin", name: icon.trim() };
  }
  if (!isObject(icon)) {
    return { type: "builtin", name: "information" };
  }
  const type = icon.type === "file" ? "file" : "builtin";
  if (type === "file" && icon.content && icon.mimeType) {
    return {
      type: "file",
      mimeType: String(icon.mimeType),
      content: String(icon.content),
      encoding: stringValue(icon.encoding),
    };
  }
  return {
    type: "builtin",
    name: stringValue(icon.name) || "information",
    color: stringValue(icon.color),
    backgroundColor: stringValue(icon.backgroundColor || icon.background_color),
  };
};

const normalizeArtifactKind = (entry, toolkitId = "") => {
  if (!isObject(entry)) return null;
  const kind = stringValue(entry.kind);
  if (!kind) return null;
  const fallbackRenderer = stringValue(
    entry.fallbackRenderer || entry.fallback_renderer,
  );
  const renderer = ALLOWED_FALLBACK_RENDERERS.has(fallbackRenderer)
    ? fallbackRenderer
    : "json";
  return {
    kind,
    displayName:
      stringValue(entry.displayName || entry.display_name) || humanizeKind(kind),
    description: stringValue(entry.description),
    icon: normalizeIcon(entry.icon),
    fallbackRenderer: renderer,
    toolkitId: stringValue(entry.toolkitId || entry.toolkit_id) || toolkitId,
  };
};

const rootArtifactKinds = (catalog) => {
  if (!isObject(catalog)) return [];
  if (Array.isArray(catalog.artifactKinds)) return catalog.artifactKinds;
  if (Array.isArray(catalog.artifact_kinds)) return catalog.artifact_kinds;
  return [];
};

const toolkitArtifactKinds = (catalog) => {
  if (!Array.isArray(catalog?.toolkits)) return [];
  const out = [];
  for (const toolkit of catalog.toolkits) {
    const toolkitId = stringValue(toolkit?.toolkitId || toolkit?.id);
    const artifactKinds = Array.isArray(toolkit?.artifactKinds)
      ? toolkit.artifactKinds
      : Array.isArray(toolkit?.artifact_kinds)
        ? toolkit.artifact_kinds
        : [];
    for (const entry of artifactKinds) {
      out.push({ entry, toolkitId });
    }
  }
  return out;
};

export const buildArtifactKindRegistry = (catalog) => {
  const registry = { ...COMPATIBILITY_ARTIFACT_KIND_DEFAULTS };

  for (const entry of rootArtifactKinds(catalog)) {
    const meta = normalizeArtifactKind(entry);
    if (!meta) continue;
    registry[meta.kind] = meta;
  }

  for (const { entry, toolkitId } of toolkitArtifactKinds(catalog || {})) {
    const meta = normalizeArtifactKind(entry, toolkitId);
    if (!meta) continue;
    if (BUILTIN_KIND_NAMES.has(meta.kind)) continue;
    if (registry[meta.kind]) continue;
    registry[meta.kind] = meta;
  }

  return registry;
};

export const getArtifactKindMetadata = (registry, kind) => {
  const cleanKind = stringValue(kind);
  if (cleanKind && isObject(registry?.[cleanKind])) {
    return registry[cleanKind];
  }
  return {
    kind: cleanKind || "artifact",
    displayName: humanizeKind(cleanKind),
    description: "",
    icon: { type: "builtin", name: "information" },
    fallbackRenderer: "json",
    toolkitId: "",
  };
};

let catalogRegistryCache = null;
let catalogRegistryPromise = null;

export const loadArtifactKindRegistry = async () => {
  if (catalogRegistryCache) return catalogRegistryCache;
  if (!catalogRegistryPromise) {
    catalogRegistryPromise = api.unchain
      .listToolModalCatalog()
      .then((catalog) => {
        catalogRegistryCache = buildArtifactKindRegistry(catalog);
        return catalogRegistryCache;
      })
      .catch(() => {
        catalogRegistryCache = buildArtifactKindRegistry();
        return catalogRegistryCache;
      });
  }
  return catalogRegistryPromise;
};

export const useArtifactKindRegistry = ({ enabled = true } = {}) => {
  const fallbackRegistry = useMemo(() => buildArtifactKindRegistry(), []);
  const [registry, setRegistry] = useState(catalogRegistryCache || fallbackRegistry);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    loadArtifactKindRegistry().then((nextRegistry) => {
      if (!cancelled) setRegistry(nextRegistry);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return registry;
};
