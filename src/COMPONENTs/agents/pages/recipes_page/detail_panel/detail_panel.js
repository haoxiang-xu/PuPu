import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { DetailChromeContext } from "../canvas_chrome";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import StartPanel from "./start_panel";
import EndPanel from "./end_panel";
import AgentPanel from "./agent_panel";
import ToolPoolPanel from "./toolpool_panel";
import SubagentPoolPanel from "./subagent_pool_panel";
import { node_identity } from "./node_identity";
import InputVariablesSection from "./input_variables_section";
import ProcessTimeline, { Block, FoldBlock } from "./process_timeline";
import StartEndPanel from "./start_end_panel";
import SkeletonDiagnostics from "./skeleton_diagnostics_notice";
import SubagentPoolSection from "./subagent_pool_section";
import ToolkitPoolSection from "./toolkit_pool_section";
import BranchSection from "./branch_section";
import ToolCallSection from "./tool_call_section";
import SkillReadSection from "./skill_read_section";
import CodeSection from "./code_section";
import WorkflowCallSection from "./workflow_call_section";
import HooksPoolSection from "./hooks_pool_section";
import { pinned_reference } from "../workflow_call_config";
import { useWorkflowVersions } from "../workflow_versions";
import { BUILTIN_PYTHON, code_settings } from "../code_config";
import { branch_summary, is_branch_type } from "../skeleton_branch_config";
import { node_toolkit_refs } from "../toolkit_pool_config";
import OutputVariablesSection from "./output_variables_section";
import {
  drawn_node,
  find_node,
  is_skeleton_node,
  node_bindings,
  node_declares_outputs,
  node_output_mappings,
  node_takes_inputs,
} from "../skeleton_document";
import { route_diagnostics } from "../skeleton_diagnostics";
import { is_toolkit_pool_type } from "../recipe_graph";
import { safe_text } from "../document_values";

/* The shell: a fixed identity header above a hairline, and a body that is the
 * only thing that scrolls. Every node type sits inside it, so the header no
 * longer scrolls away with whatever the panel happens to be showing. */

/* Input / Output Variables: always open, except where the node's parts fold. */
function WiringBlock({ fold, defaultOpen = false, ...props }) {
  return fold ? <FoldBlock defaultOpen={defaultOpen} {...props} /> : <Block {...props} />;
}

export default function DetailPanel({
  recipe,
  selectedNodeId,
  onChange,
  onChangeSilent,
  /* Converting a legacy Subagent Pool writes the stored resource rather than
     the document on screen, so the page that owns the session performs it. */
  onConvertLegacy,
  canConvertLegacy,
  convertingLegacy,
  recipes,
  onDrillIn,
  /* The Skeleton drill-in: a pool row asks the page to open that subagent's
     own graph. Kept apart from the legacy `onDrillIn`, which takes a recipe
     entry — one name for two shapes is how a call silently stops arriving. */
  onOpenSubagent,
  /* Passed through: the pool panel writes the repaired entry, and the page
     fixes whatever navigation named the old id. */
  onEntryIdRepaired,
  /* A hook's own Workflow opens on the canvas, like an embedded subagent:
     the page holds the drill (#357). */
  onOpenEmbeddedHook,
  /* A Workflow Call asks the page to open the revision it is pinned to,
     read-only (#357). Absent on the legacy recipe page: no button then. */
  onOpenPinnedWorkflow,
  embedded,
  document,
  rootDocument,
  /* Which handed-over document this is. Several controls below show text the
     document deliberately does not hold — a refused position, a refused
     bound, a refused count, a name another field already has — and each one
     holds it against the value it is showing instead of. That cannot tell a
     replacement apart from a coincidence: taking the other editor's version
     can land on the same value, and the refused text then sat on a page that
     said Saved. So the identity those controls hold text against carries this
     too, and a document arriving from the store discards it.
     Absent on the legacy recipe page, which has no store session; the
     sections then see `undefined` for the life of the panel, which is what
     they saw before this existed. */
  documentRevision,
  diagnostics,
  /* Whether the diagnostics above describe the document on screen. The page
     owns this question, because it owns the session that was checked. */
  diagnosticsUnchecked,
  onDocumentChange,
  /* The open session's Code text, keyed by digest (#357 G1): what a Code
     node's source editor shows. An edit that types text hands it back as the
     second argument of `onDocumentChange`. */
  managedSources,
  /* Description of this graph's identified caller; editor memory only. */
  startContext,
}) {
  const { t } = useTranslation();
  const cfg = useContext(ConfigContext);
  /* Set by the docked panel on macOS: the header shares the title bar's row. */
  const titleRow = useContext(DetailChromeContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  /* The same node as seen in the Skeleton document, when one is being edited.
     `onDocumentChange` is what writes it back, so the legacy `onChange` path is
     left exactly as it was. */
  const skeleton_node =
    document && typeof onDocumentChange === "function"
      ? (() => {
          const candidate = find_node(document, selectedNodeId);
          return is_skeleton_node(candidate) ? candidate : null;
        })()
      : null;
  /* A Workflow Call's Output Variables pick from its pinned revision's End
     exports, which arrive after the panel renders; this re-renders the panel
     when that revision is read (#357). */
  const call_pin = skeleton_node && skeleton_node.type === "workflow_call" ? pinned_reference(skeleton_node) : null;
  useWorkflowVersions(call_pin ? [call_pin] : []);

  /* A Skeleton page has no legacy recipe at all, so the panel takes its node
     from whichever model it was handed. Deriving it only from the recipe left
     that page on the empty state with a document sitting right there. */
  const legacy_node = recipe?.nodes?.find((n) => n.id === selectedNodeId);
  const node = legacy_node || skeleton_node;
  /* The header DRAWS a node: it reads the node's own name and model, which a
     Skeleton node does not have, so it is given the node the store defines
     and nothing the JSON holds beside it — `drawn_node` says what that cost
     us. Everything below keeps the stored node, because everything below
     edits it. A legacy recipe node is drawn as it always was; its `label` and
     `override.model` are its own. */
  const identity = node_identity(legacy_node || drawn_node(skeleton_node), t);
  // Native Agents run their stored Kernel; the legacy inheritance caption
  // would promise a fallback that this unfinished new draft does not have.
  const subtitle = !legacy_node && skeleton_node?.type === "agent"
    ? (skeleton_node.config?.kernel?.profile?.model
      ? safe_text(skeleton_node.config.kernel.profile.model) : t("agents.detail.no_model"))
    : !legacy_node && skeleton_node?.type === "toolkit_pool"
      ? Array.isArray(node_toolkit_refs(skeleton_node)) ? node_toolkit_refs(skeleton_node).length === 1
        ? t("agents.nodes.toolkit_count_one", { count: node_toolkit_refs(skeleton_node).length })
        : t("agents.nodes.toolkit_count_other", { count: node_toolkit_refs(skeleton_node).length }) : t("agents.nodes.tool_settings_incomplete")
      : !legacy_node && skeleton_node?.type === "subagent_pool" && Array.isArray(skeleton_node.config?.subagents)
        /* A Skeleton pool keeps its entries under config, which the drawn
           node does not carry, so the header counted none. */
        ? skeleton_node.config.subagents.length === 0 ? t("agents.identity.no_subagents")
          : t(skeleton_node.config.subagents.length === 1 ? "agents.nodes.subagent_count_one" : "agents.nodes.subagent_count_other",
            { count: skeleton_node.config.subagents.length })
      : !legacy_node && is_branch_type(skeleton_node?.type)
        ? branch_summary(skeleton_node, t)
        : !legacy_node && skeleton_node?.type === "code"
          /* Code runs Python. The built-in one is simply "Python"; a node
             saved with another Python profile names it (#357). */
          ? (() => {
              const code = code_settings(skeleton_node);
              const profile = code && typeof code.environment_profile_id === "string" && code.environment_profile_id;
              return profile && profile !== BUILTIN_PYTHON
                ? t("agents.detail.python_profile", { profile: safe_text(profile) }) : t("agents.detail.python");
            })()
          : identity?.subtitle;

  const shell_style = {
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  };

  const body_style = {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };

  if (!node) {
    return (
      <div style={shell_style} data-testid="recipe-detail-panel">
        <div
          className="scrollable"
          data-sb-wall="4"
          data-sb-edge="2"
          data-sb-edge-top="36"
          data-sb-edge-bottom="12"
          data-testid="recipe-detail-panel-body"
          style={{
            ...body_style,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 12, color: "#86868b" }}>
            {t("agents.detail.select_node")}
          </div>
        </div>
      </div>
    );
  }

  /* Routed once, here, because this is the only place that knows both which
     node is open and which rows it actually renders.

     The counts are rows with a renderer, NOT entries in the document. Both
     sections now draw a row per entry, so both counts are the real lengths —
     but the distinction still holds and still has to be kept: a count passed
     for a section nobody renders hands its diagnostics to rows that are never
     drawn, and they are then reported nowhere at all. The legacy Start and End
     panels read the old `node.outputs` / `outputs_schema` rather than Skeleton
     mappings, and they are not what these counts describe. */
  /* A Tool Call's or a Skill Read's inputs are not drawn as Input Variables
     rows — their own sections take that place and carry no row diagnostics —
     so none is counted, and a store diagnostic about one of them lands in the
     node notice instead of on a row nobody draws (R-352-04). A Workflow Call's
     section draws every stored input row and takes their diagnostics by
     position, so its rows are counted (R-WFC-04). */
  const input_rows_drawn = skeleton_node && !["tool_call", "skill_read"].includes(skeleton_node.type);
  const routed = skeleton_node
    ? route_diagnostics(diagnostics, document, {
        node_id: skeleton_node.id,
        row_counts: {
          inputs: input_rows_drawn ? node_bindings(skeleton_node).length : 0,
          outputs: node_output_mappings(skeleton_node).length,
        },
      })
    : null;

  const props = {
    recipe,
    node,
    onChange,
    onChangeSilent,
    isDark,
    recipes,
    onDrillIn,
  };

  return (
    <div style={shell_style} data-testid="recipe-detail-panel">
      {identity && (
        <div
          data-testid="recipe-detail-panel-header"
          style={titleRow ? {
            /* At the top of the rounded panel, beside the pinned toggle: the
               icon sits as far from the panel's top as from its left (16px;
               the 36px title block centres the 26px icon 5px down, hence 11),
               the text stops short of the toggle, the usual rule marks where
               the scrolling body begins, and the row drags the window as the
               title bar did. */
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: `11px ${titleRow.toggleReserve}px 12px 16px`,
            borderBottom: `1px solid ${
              isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
            }`,
            WebkitAppRegion: "drag",
          } : {
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px 12px",
            borderBottom: `1px solid ${
              isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
            }`,
          }}
        >
          {/* A node's fixed identity — for an Agent node too: an Agent
              resource's own icon is changed in the Explorer and never shown
              on its nodes. */}
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              background: identity.gradient,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon
              src={identity.icon}
              color="#fff"
              style={{ width: 14, height: 14 }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: isDark ? "#e6e6e6" : "#222",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {identity.title}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#86868b",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {subtitle}
            </div>
          </div>
        </div>
      )}

      <div
        className="scrollable"
        /* The header sits above this body now, so the window controls no
           longer overlap it: the track starts at the top, not 36px down. */
        data-sb-wall="4"
        data-sb-edge="2"
        data-sb-edge-top="4"
        data-sb-edge-bottom="12"
        data-testid="recipe-detail-panel-body"
        style={body_style}
      >
        {/* A Skeleton document carries its IO in each node's own config, so the
            shared sections render from it. Without one — a legacy recipe, which
            has no such config — nothing below changes. */}
        {skeleton_node && (
          <>
            <SkeletonDiagnostics
              document={document}
              diagnostics={diagnostics}
              nodeId={skeleton_node.id}
              rowCounts={routed.row_counts}
              unchecked={diagnosticsUnchecked}
              isDark={isDark}
            />
            {skeleton_node.type === "agent" ? (
              <ProcessTimeline key={JSON.stringify([document.id, skeleton_node.id])}
                document={document} node={skeleton_node} revision={documentRevision}
                rowDiagnostics={routed.rows} isDark={isDark} onChange={onDocumentChange} />
            ) : skeleton_node.type === "start" || skeleton_node.type === "end" ? (
              <StartEndPanel document={document} node={skeleton_node} revision={documentRevision}
                rowDiagnostics={routed.rows} startContext={startContext} isDark={isDark} onChange={onDocumentChange} />
            ) : <>
            {/* A pool attaches to a Kernel rather than running in the flow,
                so it carries no execution IO at all — the sections around
                this one render nothing for it — and what it does carry is
                invisible to every boundary before Run. */}
            {/* A Hooks Pool attaches to an Agent like the other pools and
                carries no execution IO (#357). */}
            {skeleton_node.type === "hooks_pool" && (
              <HooksPoolSection key={JSON.stringify([document.id, skeleton_node.id, documentRevision])}
                document={document} node={skeleton_node} isDark={isDark} onChange={onDocumentChange}
                managedSources={managedSources} onOpenEmbeddedHook={onOpenEmbeddedHook} />
            )}
            {skeleton_node.type === "toolkit_pool" && (
              <ToolkitPoolSection key={JSON.stringify([document.id, skeleton_node.id, documentRevision])}
                document={document} node={skeleton_node} isDark={isDark} onChange={onDocumentChange} />
            )}
            {skeleton_node.type === "subagent_pool" && (
              <SubagentPoolSection
                document={document}
                rootDocument={rootDocument}
                revision={documentRevision}
                node={skeleton_node}
                isDark={isDark}
                onChange={onDocumentChange}
                onConvertLegacy={onConvertLegacy}
                canConvertLegacy={canConvertLegacy}
                convertingLegacy={convertingLegacy}
                onOpenSubagent={onOpenSubagent}
                onEntryIdRepaired={onEntryIdRepaired}
                embedded={embedded}
              />
            )}
            {/* A Tool Call's inputs are its tool's arguments, one per property
                of the tool's own schema, so its section takes the place of
                Input Variables rather than sitting beside it (#352). */}
            {skeleton_node.type === "tool_call" ? (
              <ToolCallSection key={JSON.stringify([document.id, skeleton_node.id, documentRevision])}
                document={document} node={skeleton_node} isDark={isDark} onChange={onDocumentChange} />
            ) : skeleton_node.type === "workflow_call" ? (
              /* A Workflow Call's inputs are the called revision's run input,
                 one per key its Start reads (#357), so its section takes the
                 place of Input Variables as the Tool Call's does. */
              <WorkflowCallSection key={JSON.stringify([document.id, skeleton_node.id, documentRevision])}
                document={document} node={skeleton_node} rowDiagnostics={routed.rows.inputs} isDark={isDark} onChange={onDocumentChange}
                onOpenPinned={onOpenPinnedWorkflow} />
            ) : skeleton_node.type === "skill_read" ? (
              /* A Skill Read takes no inputs; its section says so and holds
                 the skill picker and the runtime-read preview instead. */
              <SkillReadSection key={JSON.stringify([document.id, skeleton_node.id, documentRevision])}
                document={document} node={skeleton_node} isDark={isDark} onChange={onDocumentChange} />
            ) : node_takes_inputs(skeleton_node.type) ? (
              /* The same caption and the same variable rows as an Agent's,
                 Start's and End's. Only the look is shared: this node keeps
                 the missing policy it stores (and the control for it). */
              /* A Code node's parts fold as the Agent's Input and Output do. */
              <WiringBlock fold={skeleton_node.type === "code"} defaultOpen section={`${skeleton_node.type}-input`} title={t("agents.io.input_variables")} isDark={isDark}
                problems={Object.values(routed.rows.inputs || {}).flat()} aside={String(node_bindings(skeleton_node).filter(Boolean).length)}>
                <InputVariablesSection
                  document={document}
                  node={skeleton_node}
                  startContext={startContext}
                  rowDiagnostics={routed.rows.inputs}
                  isDark={isDark}
                  onChange={onDocumentChange}
                  hideHeading
                  addAtEnd
                  look="pill"
                />
              </WiringBlock>
            ) : null}
            {/* A branch decides where the flow goes from what it was given, so
                its condition or switch sits right under the inputs it reads.
                It exports nothing: the outputs section renders nothing for it. */}
            {is_branch_type(skeleton_node.type) && (
              <BranchSection key={JSON.stringify([document.id, skeleton_node.id, documentRevision])}
                document={document} node={skeleton_node} isDark={isDark} onChange={onDocumentChange} />
            )}
            {/* A Code node (#357): its runtime, source, limits and declared
                Result sit between what it is given and what it passes on,
                in the same place an Agent's Kernel and JSON Output sit. */}
            {skeleton_node.type === "code" && (
              <CodeSection key={JSON.stringify([document.id, skeleton_node.id, documentRevision])}
                document={document} revision={documentRevision} node={skeleton_node} sources={managedSources} isDark={isDark} onChange={onDocumentChange} />
            )}
            {/* Inputs at the top, outputs at the bottom: a node is read
                downwards, and the order is the same in every panel so the two
                halves of a wire are always found in the same place. */}
            {node_declares_outputs(skeleton_node.type) && (
              <WiringBlock fold={skeleton_node.type === "code"} section={`${skeleton_node.type}-output`} title={t("agents.io.output_variables")} isDark={isDark}
                problems={Object.values(routed.rows.outputs || {}).flat()} aside={String(node_output_mappings(skeleton_node).filter(Boolean).length)}>
                <OutputVariablesSection
                  document={document}
                  revision={documentRevision}
                  node={skeleton_node}
                  rowDiagnostics={routed.rows.outputs}
                  isDark={isDark}
                  onChange={onDocumentChange}
                  hideHeading
                  addAtEnd
                  look="pill"
                />
              </WiringBlock>
            )}
            </>}
          </>
        )}
        {legacy_node && node.type === "start" && <StartPanel {...props} />}
        {legacy_node && node.type === "end" && <EndPanel {...props} />}
        {legacy_node && node.type === "agent" && <AgentPanel {...props} />}
        {legacy_node && is_toolkit_pool_type(node.type) && <ToolPoolPanel {...props} />}
        {legacy_node && node.type === "subagent_pool" && <SubagentPoolPanel {...props} />}
      </div>
    </div>
  );
}
