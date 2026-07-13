export const ADVANCED_TIERS = ["sidebar", "surface"];

export const advancedTokenState = (settings, mode, palette) => {
  const bag = (settings && settings.custom && settings.custom[mode]) || {};
  const out = {};
  for (const key of ADVANCED_TIERS) {
    out[key] = { isAuto: bag[key] == null, value: palette[key] };
  }
  return out;
};
