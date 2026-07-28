const COMPUTER_TOOLKIT_ID = "builtin.computer";
const COMPUTER_TOOL_NAME = "computer";

const normalizeIdentityPart = (value) =>
  typeof value === "string" ? value.trim() : "";

export const isComputerToolkitId = (toolkitId) =>
  normalizeIdentityPart(toolkitId) === COMPUTER_TOOLKIT_ID;

export const isComputerToolConfirmation = (toolkitId, toolName) =>
  isComputerToolkitId(toolkitId) ||
  (!normalizeIdentityPart(toolkitId) &&
    normalizeIdentityPart(toolName) === COMPUTER_TOOL_NAME);

export const isToolConfirmationCacheable = (toolkitId, toolName) =>
  !isComputerToolConfirmation(toolkitId, toolName);

export const shouldCacheToolConfirmationDecision = ({
  approved,
  scope,
  toolkitId,
  toolName,
}) =>
  Boolean(approved) &&
  scope === "session" &&
  Boolean(normalizeIdentityPart(toolName)) &&
  isToolConfirmationCacheable(toolkitId, toolName);
