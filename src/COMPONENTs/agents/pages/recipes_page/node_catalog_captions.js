import { agentEnglishText } from "./agents_i18n";

/* Only the builder's own type catalog is passed here. Authored finder entries,
 * node labels and generated document names are never catalog captions. The
 * original catalog, factories, ports and admission metadata remain untouched. */
export function palette_entry_caption(entry, t = agentEnglishText) {
  switch (entry?.type) {
    case "agent": return { ...entry, label: t("agents.nodes.agent"), description: t("agents.palette.description.agent") };
    case "toolkit_pool": return { ...entry, label: t("agents.palette.toolkit_pool"), description: t("agents.palette.description.toolkit_pool") };
    case "subagent_pool": return { ...entry, label: t("agents.nodes.subagent_pool"), description: t("agents.palette.description.subagent_pool") };
    case "if_else": return { ...entry, label: t("agents.nodes.if_else"), description: t("agents.palette.description.if_else") };
    case "switch_case": return { ...entry, label: t("agents.nodes.switch_case"), description: t("agents.palette.description.switch_case") };
    case "tool_call": return { ...entry, label: t("agents.nodes.tool_call"), description: t("agents.palette.description.tool_call") };
    case "skill_read": return { ...entry, label: t("agents.nodes.skill_read"), description: t("agents.palette.description.skill_read") };
    case "code": return { ...entry, label: "Code", description: t("agents.palette.description.code") };
    case "workflow_call": return { ...entry, label: t("agents.nodes.workflow_call"), description: t("agents.palette.description.workflow_call") };
    case "hooks_pool": return { ...entry, label: t("agents.nodes.hooks_pool"), description: t("agents.palette.description.hooks_pool") };
    case "start": return { ...entry, label: t("agents.nodes.start") };
    case "end": return { ...entry, label: t("agents.nodes.end") };
    default: return entry;
  }
}
