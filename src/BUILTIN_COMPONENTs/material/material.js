import { createContext, useContext } from "react";

/*
 * MaterialContext — the cross-component surface-treatment selector (plain / glass / …),
 * deliberately SEPARATE from the color `theme` system (ConfigContext).
 *
 *   theme    → color / dark tokens (which colors a surface uses)
 *   material → the component IMPLEMENTATION / treatment (plain line-minimal vs frosted glass, …)
 *
 * Default value is "plain": every existing tree keeps its current look without any provider.
 */
export const MaterialContext = createContext("plain");

/*
 * MaterialProvider — sets the material for its subtree.
 *
 * - Pass an explicit `material` prop to set the value for descendants.
 * - Omit it (bare provider) to inherit the parent's value (passthrough) — a nested inner
 *   provider that DOES pass `material` overrides an outer one.
 */
export const MaterialProvider = ({ material, children }) => {
  const parentMaterial = useContext(MaterialContext);
  const value = material !== undefined ? material : parentMaterial;
  return (
    <MaterialContext.Provider value={value}>
      {children}
    </MaterialContext.Provider>
  );
};

/*
 * useMaterial — read the current subtree material. Falls back to "plain" defensively so a
 * consumer never receives a falsy material.
 */
export const useMaterial = () => useContext(MaterialContext) || "plain";
