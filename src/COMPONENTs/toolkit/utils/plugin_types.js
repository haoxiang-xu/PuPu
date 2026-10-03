/* The one rule for a plugin's type tags. Type is NOT exclusive: an MCP source
   makes a plugin mcp and anything else a toolkit, and a command list
   additionally makes it a skill — so a builtin toolkit that also ships a
   /command carries both tags. An installed skill pack reaches the UI as a
   catalog row and must keep the SKILL tag its store row had. */

export const isMcpSourced = (source) => String(source || "").startsWith("mcp");

export const typesFor = (source, presentation) => {
  if (source === "skillpack") return ["skill"];
  const types = [isMcpSourced(source) ? "mcp" : "toolkit"];
  if ((presentation?.commands || []).length > 0) types.push("skill");
  return types;
};
