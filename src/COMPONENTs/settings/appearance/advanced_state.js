import { SEMANTIC_FAMILIES } from "../../../BUILTIN_COMPONENTs/theme/semantic_tokens";

export const ADVANCED_TIERS = Object.values(SEMANTIC_FAMILIES).flatMap(
  (f) => f.children,
);

export const advancedTokenState = (settings, mode, palette) => {
  const bag = (settings && settings.custom && settings.custom[mode]) || {};
  const out = {};
  for (const key of ADVANCED_TIERS) {
    out[key] = { isAuto: bag[key] == null, value: palette[key] };
  }
  return out;
};
