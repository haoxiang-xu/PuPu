import { BASE_TOOLKIT_IDENTIFIERS, KIND_CONFIG } from "../constants";

export const kindConfig = (kind) =>
  KIND_CONFIG[kind] || {
    label: kind || "Unknown",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
    border: "rgba(148,163,184,0.20)",
  };

export const toDisplayName = (toolkit) => {
  const raw = toolkit.class_name || toolkit.name || "Unknown Toolkit";
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
};

export const isBuiltinToolkit = (toolkit) =>
  String(toolkit?.kind || "")
    .trim()
    .toLowerCase() === "builtin";

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
