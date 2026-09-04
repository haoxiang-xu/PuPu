/*
 * resolveComponentMaterial — pure resolver a material-aware component uses to pick its impl.
 *
 * The material vocabulary is OPEN and per-component (switch/menu = plain|glass,
 * toast = solid|outline|frosted, …), so each component passes its own `supportedMap`.
 * If the requested material isn't in the map, the component falls back to its OWN default —
 * never the context value, never an error, never a blank render.
 *
 *   requested    – the material the component was asked for (explicit prop > context)
 *   supportedMap – the component's { materialName: Impl } map
 *   fallback     – the component's own default material name
 *
 * Named `resolveComponentMaterial` (not `resolveMaterial`) because toast_viewport.js already
 * has a local `resolveMaterial`.
 */
export const resolveComponentMaterial = (requested, supportedMap, fallback) =>
  supportedMap && supportedMap[requested] ? requested : fallback;
