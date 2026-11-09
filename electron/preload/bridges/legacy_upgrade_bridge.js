const createLegacyUpgradeBridge = (invoke) => ({
  getSkeletonLegacyUpgradeCapabilities: () =>
    invoke({ action: "legacy_upgrade_capabilities", payload: {} }),
  inspectSkeletonLegacyUpgrade: (payload) =>
    invoke({ action: "legacy_upgrade_inventory", payload }),
  previewSkeletonLegacyUpgrade: (payload) =>
    invoke({ action: "legacy_upgrade_preview", payload }),
  applySkeletonLegacyUpgrade: (payload) =>
    invoke({ action: "legacy_upgrade_apply", payload }),
});

module.exports = { createLegacyUpgradeBridge };
