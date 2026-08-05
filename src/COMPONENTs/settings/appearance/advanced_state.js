import { SEMANTIC_FAMILIES } from "../../../BUILTIN_COMPONENTs/theme/semantic_tokens";

export const ADVANCED_TIERS = Object.values(SEMANTIC_FAMILIES).flatMap(
  (f) => f.children,
);

/* "Linked" (the key is absent, so the value follows its parent) vs
   "Pinned" (the key is present, so the value is frozen). Absence-means-
   linked is the whole storage law — it is why this needed no schema
   change and why old exported themes keep working untouched. */
export const advancedTokenState = (settings, mode, palette) => {
  const bag = (settings && settings.custom && settings.custom[mode]) || {};
  const out = {};
  for (const key of ADVANCED_TIERS) {
    out[key] = { isLinked: bag[key] == null, value: palette[key] };
  }
  return out;
};
