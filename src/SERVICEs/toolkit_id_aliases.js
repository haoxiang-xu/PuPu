const TOOLKIT_ID_ALIASES = Object.freeze({
  workspace: "core",
  workspace_toolkit: "core",
  access_workspace_toolkit: "core",
  workspacetoolkit: "core",
  WorkspaceToolkit: "core",
  terminal: "core",
  terminal_toolkit: "core",
  run_terminal_toolkit: "core",
  terminaltoolkit: "core",
  TerminalToolkit: "core",
  core: "core",
  core_toolkit: "core",
  coretoolkit: "core",
  CoreToolkit: "core",
  code: "core",
  code_toolkit: "core",
  codetoolkit: "core",
  CodeToolkit: "core",
  ask_user: "core",
  ask_user_toolkit: "core",
  "ask-user-toolkit": "core",
  interaction: "core",
  interaction_toolkit: "core",
  "interaction-toolkit": "core",
  interactiontoolkit: "core",
  InteractionToolkit: "core",
  askusertoolkit: "core",
  AskUserToolkit: "core",
  web: "core",
  web_toolkit: "core",
  "web-toolkit": "core",
  webtoolkit: "core",
  WebToolkit: "core",
  external_api: "core",
  external_api_toolkit: "core",
  externalapitoolkit: "core",
  ExternalAPIToolkit: "core",
  git: "core",
  git_toolkit: "core",
  gittoolkit: "core",
  GitToolkit: "core",
});

export const normalizeToolkitIdAlias = (
  value,
  { maxLength = 0, truncate = false, removedIds = [] } = {},
) => {
  if (typeof value !== "string") return "";

  let trimmed = value.trim();
  if (!trimmed) return "";

  if (maxLength > 0 && trimmed.length > maxLength) {
    if (!truncate) return "";
    trimmed = trimmed.slice(0, maxLength);
  }

  const lowered = trimmed.toLowerCase();
  const removed = new Set(removedIds.map((item) => String(item).toLowerCase()));
  if (removed.has(lowered)) return "";

  return TOOLKIT_ID_ALIASES[trimmed] || TOOLKIT_ID_ALIASES[lowered] || trimmed;
};
