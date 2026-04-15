import { BASE_TOOLKIT_IDENTIFIERS, KIND_CONFIG } from "../constants";

export const kindConfig = (kind, t) => {
  const cfg = KIND_CONFIG[kind];
  if (cfg) {
    return {
      ...cfg,
      label: t ? t(cfg.labelKey) : cfg.labelKey,
    };
  }
  return {
    label: kind || (t ? t("toolkit.unknown") : "Unknown"),
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
    border: "rgba(148,163,184,0.20)",
  };
};

export const toDisplayName = (toolkit, t) => {
  const fallback = t ? t("toolkit.unknown_toolkit") : "Unknown Toolkit";
  const raw = toolkit.class_name || toolkit.name || fallback;
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
};

export const isBuiltinToolkit = (toolkit) =>
  String(toolkit?.kind || "")
    .trim()
    .toLowerCase() === "builtin" ||
  String(toolkit?.kind || "")
    .trim()
    .toLowerCase() === "core" ||
  String(toolkit?.source || "")
    .trim()
    .toLowerCase() === "builtin" ||
  String(toolkit?.source || "")
    .trim()
    .toLowerCase() === "core" ||
  [toolkit?.toolkitId, toolkit?.name, toolkit?.class_name, toolkit?.module]
    .map((value) =>
      typeof value === "string" ? value.trim().toLowerCase() : "",
    )
    .filter(Boolean)
    .some(
      (value) =>
        BASE_TOOLKIT_IDENTIFIERS.has(value) ||
        value.endsWith(".builtin_toolkit") ||
        value.endsWith(".base_toolkit"),
    );

export const isBaseToolkit = (toolkit) => {
  const candidates = [toolkit?.name, toolkit?.class_name, toolkit?.module]
    .map((value) =>
      typeof value === "string" ? value.trim().toLowerCase() : "",
    )
    .filter(Boolean);

  return candidates.some(
    (value) =>
      BASE_TOOLKIT_IDENTIFIERS.has(value) ||
      value.endsWith(".toolkit") ||
      value.endsWith(".builtin_toolkit") ||
      value.endsWith(".base_toolkit"),
  );
};
