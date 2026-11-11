import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import ConfigContainer from "./CONTAINERs/config/container";
import DetailPanel from "./COMPONENTs/agents/pages/recipes_page/detail_panel/detail_panel";
import { api } from "./SERVICEs/api";

api.unchain.listToolModalCatalog = async () => ({ toolkits: [
  { toolkitId: "core", toolkitName: "Core", toolkitDescription: "Read, write and search files", tools: [{ name: "read" }, { name: "write" }, { name: "search" }, { name: "list_dir" }, { name: "shell" }] },
  { toolkitId: "web", toolkitName: "Web", toolkitDescription: "Fetch pages and search the web", tools: [{ name: "fetch" }, { name: "web_search" }] },
  { toolkitId: "github", toolkitName: "GitHub", toolkitDescription: "Issues, PRs and code search", tools: [{ name: "issues" }, { name: "pull_requests" }] },
  { toolkitId: "notion", toolkitName: "Notion", tools: [{ name: "pages" }] },
] });
api.unchain.listSkeletonResources = async () => ({ resources: [
  { id: "res-writer", kind: "agent", name: "Writer", status: "active" },
  { id: "res-critic", kind: "agent", name: "Critic", status: "active" },
] });
api.unchain.getSkeletonWorkflowToolCapabilities = undefined;

const initial = {
  id: "doc", kind: "agent", schema_version: 1,
  nodes: [
    { id: "agent", type: "agent", config: { kernel: { prompt: "Lead." }, execution: { inputs: [], outputs: [] } } },
    { id: "tools", type: "toolkit_pool", config: { toolkits: [{ id: "core", enabled_tools: ["read", "search"] }, { id: "web", enabled_tools: null }], merge_with_user_selected: true } },
    { id: "subs", type: "subagent_pool", config: { subagents: [
      { id: "subagent-1", name: "writer", description: "Drafts the reply", source: { kind: "agent_ref", agent_id: "res-writer" }, allowed_modes: ["delegate", "worker"], output_mode: "summary", memory_policy: "ephemeral", parallel_safe: true, allowed_tools: null, disabled_tools: [] },
      { id: "subagent-2", name: "critic", description: "", source: { kind: "agent_ref", agent_id: "res-critic" }, allowed_modes: ["delegate"], output_mode: "last_message", memory_policy: "scoped_persistent", parallel_safe: false, allowed_tools: null, disabled_tools: [] },
    ] } },
  ],
  edges: [{ id: "a1", kind: "attach", source_node_id: "agent", source_port_id: "tools", target_node_id: "tools", target_port_id: "in" }, { id: "a2", kind: "attach", source_node_id: "agent", source_port_id: "subagents", target_node_id: "subs", target_port_id: "in" }],
};
function Harness() {
  const [doc, setDoc] = React.useState(initial);
  const selected = new URLSearchParams(window.location.search).get("node") || "tools";
  return <div style={{ position: "fixed", inset: 0, display: "flex", justifyContent: "flex-end", background: "var(--pupu-background)" }}>
    <div id="panel" style={{ width: 340, display: "flex", flexDirection: "column", background: "var(--pupu-surface)" }}>
      <DetailPanel document={doc} selectedNodeId={selected} onChange={() => {}} onChangeSilent={() => {}} onDocumentChange={setDoc} onOpenSubagent={() => {}} />
    </div>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<ConfigContainer><Harness /></ConfigContainer>);
