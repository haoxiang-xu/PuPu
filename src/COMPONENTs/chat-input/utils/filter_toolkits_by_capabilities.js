const requirementSatisfied = (requirement, capabilities) => {
  if (requirement === "computer_use") {
    return capabilities?.computer_use?.supported === true;
  }
  return capabilities?.[requirement] === true;
};

/** Remove catalog toolkits whose declared model requirements are not met. */
export const filterToolkitsByCapabilities = (toolkits, capabilities) => {
  if (!Array.isArray(toolkits)) return [];
  return toolkits.filter((toolkit) => {
    const requirements = Array.isArray(toolkit?.capabilityRequirements)
      ? toolkit.capabilityRequirements
      : [];
    return requirements.every((requirement) =>
      requirementSatisfied(requirement, capabilities),
    );
  });
};

export default filterToolkitsByCapabilities;
