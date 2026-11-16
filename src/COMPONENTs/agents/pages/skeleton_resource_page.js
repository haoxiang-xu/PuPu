import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentMessage, renderAgentMessage, agentProblem, agentProblemMessage, agentPayloadReason } from "./recipes_page/agents_i18n";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import DetailPanel from "./recipes_page/detail_panel/detail_panel";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import {
  AboveControls,
  CanvasCaptionChip,
  CanvasControlCenter,
  CanvasMessageStrip,
  ControlPopover,
  EscapeBackHint,
  FloatingDetailShell,
  VISUALLY_HIDDEN,
} from "./recipes_page/canvas_chrome";
import { RunTrigger } from "./recipes_page/skeleton_run_menu";
import BuilderTestPanel from './recipes_page/test_run/builder_test_panel';
import SkeletonRunView from "./recipes_page/skeleton_run_view";
import { getChatMessages, getChatsStore } from "../../../SERVICEs/chat_storage";
import { run_observation_scope } from "./recipes_page/run_observation_scope";
import useSkeletonResource from "./recipes_page/use_skeleton_resource";
import SkeletonCanvas from "./recipes_page/skeleton_canvas";
import { apply_graph_command } from "./recipes_page/skeleton_graph_commands";
import { start_context_for_view } from "./recipes_page/start_context";
import {
  SESSION_STATUS,
  can_convert_legacy_pools,
  can_redo,
  can_save,
  can_undo,
  conflict_message,
  diagnostics_are_current,
} from "./recipes_page/skeleton_resource_session";
import { why_not_a_subagent } from "./recipes_page/skeleton_subagent_eligibility";
import {
  copySkeletonLayout,
  skeletonLayoutKeys,
} from "../../../SERVICEs/skeleton_layout";
import {
  DRILL,
  FRAME,
  closed_embedded_frames,
  diagnostics_for_embedded,
  drill_blocked_reason,
  drill_crumbs,
  drill_layout_key,
  drill_lost_reason,
  drill_obsolete_reason,
  drill_step,
  drill_target,
  layout_keys_after_entry_id_repair,
  embedded_document,
  embedded_path,
  frame_for_embedded_step,
  frame_for_resource_step,
  frame_is_stale,
  gone_message,
  graph_label,
  HOOK_MEMBER,
  hook_drill_target,
  hook_entry_for,
  left_behind_message,
  notices_still_true,
  open_failed_message,
  pool_entry_for,
  push_drill_frame,
  save_target_caption,
  stale_frame_message,
  unwind_drill_stack,
  with_embedded_document,
} from "./recipes_page/skeleton_drill";
import LegacyUpgradeWizard from "./recipes_page/legacy_upgrade/legacy_upgrade_wizard";
import { is_legacy_upgrade_candidate } from "./recipes_page/legacy_upgrade/legacy_upgrade_plan";
import { emitSkeletonLibraryRefresh } from "../../../SERVICEs/skeleton_library_refresh";
import { drill_level_icon, drill_trail_segments, graph_icon } from "./recipes_page/drill_trail";
import { usePublishAgentsDrillTrail } from "../../../SERVICEs/agents_drill_trail";

/* One Skeleton resource, open for editing.
 *
 * This is the first product surface that talks to the resource store: it loads
 * through the real facade, hands the document to the shared detail panel, and
 * saves at the token it loaded, with the conflict choices in the bar.
 *
 * The graph is drawn from two sources kept apart on purpose: the document says
 * what it is, and `SERVICEs/skeleton_layout` says where it is drawn. A
 * Skeleton node has `{id, type, config}` and an optional display label; it refuses a
 * coordinate, so a position is not something this page may persist into the
 * Agent — and because the canvas has no route to the document at all, moving a
 * node cannot change what the Agent does.
 *
 * ── Drilling into a subagent ─────────────────────────────────────────────
 *
 * A subagent is a complete Agent graph, so its contents are edited here, on
 * the canvas, with a breadcrumb back — not in the pool panel. The two kinds of
 * entry differ in exactly one way that matters, and this page is where it
 * shows:
 *
 *   a referenced Agent is another resource, so opening it opens that resource
 *   and Save writes it — the shared definition every other parent will use on
 *   its next run;
 *
 *   an embedded graph lives inside this parent's own document, so opening it
 *   is a view onto part of what is already loaded and Save writes the parent.
 *
 * So the stack holds two kinds of frame. An embedded step never left the
 * resource: its edits are in the live session, and restoring a session on the
 * way back would throw them away. A reference step did, and its frame carries
 * the whole sitting — the unsaved document, the token, the dirty flag, the
 * selection — because going back is navigation and must not re-read.
 */

/* The page is the canvas: everything else floats over it (see canvas_chrome). */
const PAGE = (isDark) => ({
  position: "absolute",
  inset: 0,
  overflow: "hidden",
  color: "var(--pupu-text)",
  backgroundColor: isDark ? "var(--pupu-background)" : "var(--pupu-background)",
});

const CANVAS_FRAME = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
};

/* What stands in for the canvas while there is none: opening, or a resource
   that could not be opened. */
const CENTERED = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  textAlign: "center",
  pointerEvents: "none",
};

/* Used when the page is shown without the Agents page around it (its own
   tests): a detail panel at the legacy minimum, with nothing to drag. */
const DEFAULT_CHROME = Object.freeze({
  crumbTop: 20,
  crumbLeft: 14,
  detail: Object.freeze({ width: 300, minWidth: 300, resizing: false }),
});

/* One frozen list, so an unchecked draft hands the panel the same value every
   render rather than a new empty array. */
const NOTHING_CHECKED = Object.freeze([]);

const NOTE = { fontSize: 11, color: "#86868b", lineHeight: 1.45 };

export default function SkeletonResourcePage({
  resourceId,
  newDraft,
  onDrilledChange,
  onDirtyChange,
  /* Where the shared chrome sits on the Agents page, and the detail panel's
     width there (one width for both canvases). */
  chrome = DEFAULT_CHROME,
}) {
  const { t } = useTranslation();
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const {
    session,
    create,
    load,
    openAnother,
    restore,
    edit,
    editCurrent,
    undo,
    redo,
    save,
    keepMine,
    takeTheirs,
    preflight,
    convertLegacyPools,
  } = useSkeletonResource();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  /* The node the detail panel last showed, so its toggle can bring it back. */
  const lastShownNodeRef = useRef(null);
  if (selectedNodeId) lastShownNodeRef.current = selectedNodeId;
  /* The control center's: Home, the Run menu, and an edit the canvas refused. */
  const [homeToken, setHomeToken] = useState(0);
  /* The right panel shows either the selected node or the Test panel. One
     flag decides which: Run opens Test, picking a node (or Escape, or the
     panel's own close) goes back to the node. The Test panel stays mounted
     while hidden, so its conversation and typed inputs are still there when
     Run brings it back. */
  const [testOpen, setTestOpen] = useState(false);
  const [runViewScope, setRunViewScope] = useState(null);
  const [canvasProblem, setCanvasProblem] = useState(null);
  /* The graphs left behind, outermost first. */
  const [drillFrames, setDrillStack] = useState([]);
  /* Where inside THIS resource's document the open graph sits: one step per
     embedded entry, by pool node id, entry id and what it took to tell that
     entry from another under the same id. Empty means the resource's own
     graph. */
  const [drillSteps, setSteps] = useState([]);
  const [notices, setNotices] = useState([]);
  /* Escape was pressed with nothing above the graph to close and an unsaved
     edit: the Builder stayed open, and says why, until the edit is saved. */
  const [escapeHeld, setEscapeHeld] = useState(false);
  /* The explicit legacy upgrade (#473 CP2): offered while the resource's own
     graph still carries first-hop provenance, opened by the author, and a
     write only through the host's compare-and-set apply. The offer is read
     from the stored document, so a draft with unsaved edits is told to save
     first rather than upgraded under the author's typing. */
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const pageRef = useRef(null);
  const dirtyRef = useRef(false);
  /* How many times each resource has been written in this sitting. The same
     Agent can sit at two depths — a graph referencing an Agent that references
     it back — so saving deeper can write the very resource a frame below holds
     an older copy of. */
  /* Without a prototype: its keys are resource ids, and a resource id is
     data. Measured on the pair — `constructor`, `toString`, `valueOf` and
     `hasOwnProperty` are ids the store accepts (`__proto__` is refused at
     `document.id`, which is a node id's problem, not this one). On a plain
     object the read answered with an inherited member, `(fn || 0) + 1` became
     a string, and assigning it stored nothing at all: the count stayed empty
     and the frame below was never told its copy had been overtaken. */
  const savedVersionsRef = useRef(Object.create(null));
  /* Which navigation the page is on. Opening a referenced Agent is a read,
     and by the time it answers the author may have opened something else,
     gone back up, or had the resource changed under them. The answer is only
     about the navigation that asked for it: pushing a frame for it then puts
     the graph they left into the breadcrumb over the graph they are in, and a
     notice about it names a graph that is not on screen. Counted rather than
     compared, because "the same place again" is still a later question. */
  /* Read by own key, so an id that names something on `Object.prototype` is
     answered with what this sitting counted and nothing else. */
  const saved_version_of = useCallback((resource_id) => {
    const counted = savedVersionsRef.current;
    return typeof resource_id === "string" &&
      Object.prototype.hasOwnProperty.call(counted, resource_id)
      ? counted[resource_id]
      : 0;
  }, []);

  const navigationRef = useRef(0);
  const navigate = useCallback(() => {
    navigationRef.current += 1;
    return navigationRef.current;
  }, []);

  useEffect(() => {
    if (!resourceId) return;
    navigate();
    if (newDraft) create(newDraft);
    else load(resourceId);
    setSelectedNodeId(newDraft ? "agent" : null);
    setDrillStack([]);
    setSteps([]);
    setNotices([]);
  }, [resourceId, newDraft, create, load, navigate]);

  const resource_document = session.document;
  /* Which document the author was handed. A position inside a pool is only
     about this one — see `pool_entry_index` — and the reducer counts exactly
     this: a load, a reload, or the other editor's version taken, and nothing
     the author typed. */
  const revision = session.document_revision;

  /* Whether the open graph is still reachable, and if not, why.
   *
   * Taking the other editor's version replaces the whole document, and it may
   * not hold the graph the steps reach — or may hold two entries under one id
   * with nothing left to say which of them was open. Either way there is no
   * graph to show and the honest place to land is this resource's own root.
   *
   * Decided here rather than in the effect below, because an effect lands one
   * commit later and that commit is a breadcrumb into a graph that is gone
   * over a canvas with nothing in it. The effect still runs: it writes the
   * same decision into state, which is what makes the next render ordinary. */
  const lost =
    drillSteps.length > 0 && session.status === SESSION_STATUS.READY
      ? drill_lost_reason(session.document, drillSteps, revision, agentMessage)
      : null;
  /* Memoized because they are what the callbacks below are rebuilt from: a
     fresh array on every render would rebuild every one of them. */
  const steps = useMemo(() => (lost === null ? drillSteps : []), [lost, drillSteps]);
  const stack = useMemo(
    () => (lost === null ? drillFrames : closed_embedded_frames(drillFrames)),
    [lost, drillFrames],
  );
  const drilled = stack.length > 0;
  /* The list beside the canvas is the graph you are editing, so a drill-in
     collapses the resource list the same way it hides the workflow list. */
  useEffect(() => {
    if (typeof onDrilledChange === "function") onDrilledChange(drilled);
  }, [drilled, onDrilledChange]);
  /* Whether the open resource holds work the store does not have yet. The
     Agents explorer asks before renaming or archiving it, because both are
     writes to the stored version that this editor would then conflict with. */
  useEffect(() => {
    if (typeof onDirtyChange === "function") onDirtyChange(Boolean(session.dirty));
  }, [session.dirty, onDirtyChange]);

  /* What is on screen: this resource's own graph, or the embedded graph the
     steps reach. */
  const document = steps.length === 0
    ? resource_document
    : embedded_document(resource_document, steps, revision);
  /* Derived from this navigation, not saved in the graph or a cached frame:
     editing Start outputs, going back, and replacing a resource immediately
     describe the caller of the graph actually on screen. */
  const startContext = start_context_for_view(steps, stack, document, t);
  const prefix = steps.length === 0
    ? ["document"]
    : embedded_path(resource_document, steps, revision);

  useEffect(() => {
    if (lost === null) return;
    setSteps([]);
    setDrillStack((frames) => closed_embedded_frames(frames));
    setSelectedNodeId(null);
    setNotices([lost]);
  }, [lost]);

  const resource_label = graph_label(resource_document, session.resource_id);
  const shown_label = graph_label(document, session.resource_id);

  /* An embedded graph is edited by writing it back into the parent, which is
     what makes Save write the parent: there is only ever one document on its
     way to the store. */
  const edit_shown = useCallback(
    (next, sources = null) => {
      if (steps.length === 0) return edit(next, sources);
      return edit(
        with_embedded_document(session.document, steps, next, revision),
        sources,
      );
    },
    [edit, revision, session.document, steps],
  );

  /* Capture the view's authority now, not when a retained callback fires.
     Resolve the child inside the hook's latest session so two gestures in
     one batch cannot overwrite one another or restore an old parent. */
  const commandNavigation = navigationRef.current;
  const commandOpen = session.open_id;
  const commandResource = session.resource_id;
  const graphCommand = useCallback((command) => {
    let result = { ok: false, document: null, problem: agentProblem("agents.graph.view_changed", undefined, { code: "view_changed" }) };
    editCurrent({ open_id: commandOpen, resource_id: commandResource }, (current) => {
      if (navigationRef.current !== commandNavigation || current.document_revision !== revision) return current.document;
      const shown = steps.length === 0 ? current.document : embedded_document(current.document, steps, revision);
      if (!shown) return current.document;
      result = apply_graph_command(shown, command, agentMessage);
      if (!result.ok || result.document === shown) return current.document;
      return steps.length === 0 ? result.document : with_embedded_document(current.document, steps, result.document, revision);
    }, () => (result.ok && result.sources) || null);
    return result;
  }, [commandNavigation, commandOpen, commandResource, editCurrent, revision, steps]);

  /* The draft check reads an embedded graph now, and reports its problems at
     their own full path — a child with no End answers `end_count` at
     `…source.document.nodes`, measured on the new pair. So a child view shows
     the ones reported at its own path, re-rooted; the parent's own problems
     are at paths that would land on this graph's nodes by position, and a
     sibling child's at paths that look just like this one's, which is what the
     filter is for.

     And only while they are about the document on screen. Every path is a
     position, so placing an older list onto a changed draft does not show a
     stale problem — it shows the problem of whatever now sits at that
     position. Measured on the real store: delete a pool's faulty first entry
     without saving, and the surviving entry — one the store answers `[]` for,
     with a passing preflight for the exact document Save would send — wore the
     deleted sibling's error on its own binding row. The unchecked draft says
     so in the panel instead; nothing is remapped by id, because a draft may
     hold two entries with one id and a guess there is the same error wearing a
     reason. */
  const unchecked = !diagnostics_are_current(session);
  const diagnostics = unchecked
    ? NOTHING_CHECKED
    : steps.length === 0
      ? session.diagnostics
      : diagnostics_for_embedded(session.diagnostics, prefix);

  const handleSave = useCallback(async () => {
    const before = session.edit_token;
    const latest = await save();
    /* The write really did land exactly when the token moved — which is also
       what tells a frame below that its copy is now the older one. */
    if (latest && latest.edit_token && latest.edit_token !== before) {
      const id = latest.resource_id;
      savedVersionsRef.current[id] = (saved_version_of(id) || 0) + 1;
    }
    return latest;
  }, [save, saved_version_of, session.edit_token]);

  /* Opening a subagent. The row says whether it can be opened and why not, so
     a row that cannot be is not inert — it answers. */
  const open_subagent = useCallback(
    async (payload) => {
      const { pool_node_id, entry_id, entry_index, reason } = payload;
      const request = navigate();
      setNotices([]);
      if (reason) {
        setNotices([agentPayloadReason(payload, agentMessage)]);
        return;
      }
      const blocked = drill_blocked_reason(session, agentMessage);
      if (blocked) {
        setNotices([blocked]);
        return;
      }
      /* The row names the entry and says which row it was, in the document
         on screen; a pool the store would run needs only the first, and a
         draft it accepts can hold two entries with one id. `pool_entry_for`
         is the one rule for both, and `drill_step` keeps whatever it took to
         answer so the step can be answered again later. */
      const clicked = {
        node_id: pool_node_id,
        entry_id,
        entry_index,
        taken_in: revision,
      };
      const found = pool_entry_for(document, clicked, revision);
      if (!found) {
        /* The row was drawn from this same document, so this is the row
           having gone between the drawing and the click. */
        setNotices([gone_message(agentMessage("agents.drill.that_subagent"), agentMessage)]);
        return;
      }
      const step = drill_step({
        node_id: pool_node_id,
        entry_id,
        found,
        revision,
      });
      /* Which graph this click happened in, for the read below. */
      const opened_from = steps;
      const target = drill_target(found.entry, agentMessage);
      if (target.kind === DRILL.UNREADABLE) {
        setNotices([target.reason]);
        return;
      }
      if (target.kind === DRILL.EMBEDDED) {
        setDrillStack((frames) =>
          push_drill_frame(
            frames,
            frame_for_embedded_step({
              label: shown_label,
              steps,
              selected_node_id: selectedNodeId,
              via_label: agentMessage("agents.nodes.subagent_pool"),
            }),
          ),
        );
        setSteps([...steps, step]);
        setSelectedNodeId(null);
        return;
      }
      /* A reference is read before anything navigates, and what came back has
         to be an Agent — the same gate the picker uses, asked again here
         because a document can be written by hand or by another build. */
      const answer = await openAnother(
        target.agent_id,
        (data) =>
          why_not_a_subagent(
            { id: data && data.id, kind: data && data.kind, archived: data && data.archived },
            { owner_id: session.resource_id },
            agentMessage,
          ),
        /* Asked at the moment of the swap, not before the read: the hook
           knows which sitting asked, and this is the other half — whether
           this page is still on the navigation that asked, and whether the
           graph it was asked FROM is still there.
           The second half is not the same question. A graph can stop
           existing without the author navigating anywhere: taking the other
           editor's version replaces the document, and if the entry this
           child came from is not in it, the view closes itself. The read was
           issued from that view; adopting its answer afterwards is a
           breadcrumb into a referenced Agent beside a notice saying the graph
           it was opened from is gone. Measured on the real store, and it is
           read off the sitting the hook hands over rather than this page's
           copy of it, which is one render behind at exactly that moment.
           It is only this: an edit does not cancel a navigation, and neither
           does a save that landed first — both controls still pass. */
        (current) =>
          navigationRef.current === request &&
          drill_lost_reason(
            current.document,
            opened_from,
            current.document_revision,
          ) === null,
      );
      /* Everything below describes the graph this request was about. The
         author may be somewhere else now, and then none of it is true here:
         no frame, no steps, and nothing said. */
      if (navigationRef.current !== request) return;
      if (!answer.ok) {
        const blocked_now = drill_obsolete_reason(answer.blocked, agentMessage);
        if (answer.obsolete && !blocked_now) return;
        setNotices([
          blocked_now ||
            answer.refused ||
            open_failed_message(
              target.agent_id,
              answer.result && answer.result.error,
              agentMessage,
            ),
        ]);
        return;
      }
      setDrillStack((frames) =>
        push_drill_frame(
          frames,
          { ...frame_for_resource_step({
            label: resource_label,
            steps,
            selected_node_id: selectedNodeId,
            session: answer.left,
            saved_version: saved_version_of(answer.left.resource_id),
          }), via_label: agentMessage("agents.nodes.subagent_pool") },
        ),
      );
      setSteps([]);
      setSelectedNodeId(null);
    },
    [
      document,
      navigate,
      openAnother,
      resource_label,
      revision,
      saved_version_of,
      selectedNodeId,
      session,
      shown_label,
      steps,
    ],
  );

  /* Opening the Workflow a Workflow Call runs, to edit it — the way a
     referenced subagent opens: that resource's own draft on the canvas,
     saved as itself, with the breadcrumb back. The call stays on the version
     it took until the author updates it there. */
  const open_called_workflow = useCallback(
    async ({ workflow_id }) => {
      const request = navigate();
      setNotices([]);
      const blocked = drill_blocked_reason(session, agentMessage);
      if (blocked) {
        setNotices([blocked]);
        return;
      }
      if (typeof workflow_id !== "string" || !workflow_id) return;
      const opened_from = steps;
      const answer = await openAnother(
        workflow_id,
        (data) => (!data || data.kind !== "workflow"
          ? agentMessage("agents.workflow.not_a_workflow")
          : data.id === session.resource_id ? agentMessage("agents.eligibility.self") : null),
        (current) =>
          navigationRef.current === request &&
          drill_lost_reason(current.document, opened_from, current.document_revision) === null,
      );
      if (navigationRef.current !== request) return;
      if (!answer.ok) {
        const blocked_now = drill_obsolete_reason(answer.blocked, agentMessage);
        if (answer.obsolete && !blocked_now) return;
        setNotices([
          blocked_now || answer.refused || open_failed_message(workflow_id, answer.result && answer.result.error, agentMessage),
        ]);
        return;
      }
      setDrillStack((frames) =>
        push_drill_frame(
          frames,
          { ...frame_for_resource_step({
            label: resource_label,
            steps,
            selected_node_id: selectedNodeId,
            session: answer.left,
            saved_version: saved_version_of(answer.left.resource_id),
          }), via_label: agentMessage("agents.nodes.workflow_call") },
        ),
      );
      setSteps([]);
      setSelectedNodeId(null);
    },
    [navigate, openAnother, resource_label, saved_version_of, selectedNodeId, session, steps],
  );

  /* Opening a hook's own Workflow (#357). It is part of this resource, so it
     is opened exactly as an embedded subagent is — a step into the document
     already loaded, edited in the live session and saved with this Agent —
     and only a hook whose Workflow is its own can be opened this way. */
  const open_embedded_hook = useCallback(
    ({ pool_node_id, entry_id, entry_index }) => {
      navigate();
      setNotices([]);
      const blocked = drill_blocked_reason(session, agentMessage);
      if (blocked) {
        setNotices([blocked]);
        return;
      }
      const clicked = { node_id: pool_node_id, entry_id, entry_index, taken_in: revision, member: HOOK_MEMBER };
      const found = hook_entry_for(document, clicked, revision);
      if (!found) {
        setNotices([gone_message(agentMessage("agents.drill.that_hook"), agentMessage)]);
        return;
      }
      const target = hook_drill_target(found.entry, agentMessage);
      if (target.kind !== DRILL.EMBEDDED) {
        setNotices([target.reason]);
        return;
      }
      const step = drill_step({ node_id: pool_node_id, entry_id, found, revision, member: HOOK_MEMBER });
      setDrillStack((frames) =>
        push_drill_frame(
          frames,
          frame_for_embedded_step({
            label: shown_label,
            steps,
            selected_node_id: selectedNodeId,
            via_label: agentMessage("agents.nodes.hooks_pool"),
          }),
        ),
      );
      setSteps([...steps, step]);
      setSelectedNodeId(null);
    },
    [document, navigate, revision, selectedNodeId, session, shown_label, steps],
  );

  /* An entry given an id of its own, by the pool panel.
   *
   * The panel writes the document — it owns the pool's edits, and this one
   * goes through the same dirty → Save as any other, with no save of its own.
   * What it cannot do is keep the DRAWINGS, because a graph is keyed by the
   * steps that reach it and a step carries the entry's position only while
   * two entries share an id. Repairing one moves two keys: the repaired
   * entry's, which now names the new id, and its sibling's, which stops being
   * ambiguous — and with them every key of a graph reached through either.
   * Measured on the real page: both children then opened auto-laid-out at
   * (80, 80) with their viewports gone.
   *
   * It does NOT touch the steps or the frames. The button is only ever in the
   * pool's own graph, so nothing the author is looking at points into the
   * entry being repaired; a rewrite keyed by a local pool id and a row index
   * matched a same-named ancestor instead and sent the author's next
   * sentence into a sibling child, which the store accepted. The navigation
   * stays where it is. */
  const entry_id_repaired = useCallback(
    ({ pool_node_id, document: repaired }) => {
      const after =
        steps.length === 0
          ? repaired
          : with_embedded_document(resource_document, steps, repaired, revision);
      layout_keys_after_entry_id_repair({
        resource_id: session.resource_id,
        before: resource_document,
        after,
        steps,
        revision,
        node_id: pool_node_id,
        keys: skeletonLayoutKeys(),
      }).forEach(({ from, to }) => copySkeletonLayout(from, to));
    },
    [resource_document, revision, session.resource_id, steps],
  );

  /* Going back. Not a save: a dirty graph that is being closed is left as the
     store holds it, and that is said out loud — one keypress is a light
     gesture for losing work without a word. An embedded step leaves nothing
     behind, because its edits are this resource's edits. */
  const drill_to = useCallback(
    (depth) => {
      const { frame, stack: left } = unwind_drill_stack(stack, depth);
      if (!frame) return false;
      /* Going back is a navigation as well, so a read still in flight for a
         graph further in is no longer about where the author is. */
      navigate();
      const messages = [];
      if (frame.kind === FRAME.RESOURCE) {
        if (session.dirty) {
          messages.push(
            left_behind_message(graph_label(session.document, session.resource_id), agentMessage),
          );
        }
        restore(frame.session);
        if (frame_is_stale(frame, savedVersionsRef.current)) {
          messages.push(stale_frame_message(frame.label, agentMessage));
        }
      }
      setSteps(frame.steps || []);
      setSelectedNodeId(frame.selected_node_id || null);
      setDrillStack(left);
      setNotices(messages);
      return true;
    },
    [navigate, restore, session, stack],
  );

  const drill_up = useCallback(() => {
    if (stack.length === 0) return false;
    return drill_to(stack.length - 1);
  }, [stack, drill_to]);

  /* What the page is showing now, for a read that answers later. */
  const latestRef = useRef(null);
  latestRef.current = { session, steps, revision };


  /* Another resource, or another document version taken over this one, is
     not the sitting the view was opened from. */
  useEffect(() => {
    setRunViewScope(null);
  }, [session.open_id, revision]);

  const open_run_view = useCallback(() => {
    const chats = getChatsStore();
    const scope = run_observation_scope(chats, chats?.activeChatId ? getChatMessages(chats.activeChatId) : [], session.resource_id);
    if (!scope) {
      setCanvasProblem(agentMessage("agents.editor.chat_required_for_observation"));
      return;
    }
    if (pageRef.current?.contains(window.document.activeElement)) window.document.activeElement?.blur();
    setTestOpen(false);
    setCanvasProblem(null);
    setRunViewScope(scope);
  }, [session.resource_id]);

  /* Escape is answered by the nearest thing on top, once, and stops there; it
     reaches the Agents modal (a `window` listener, which closes the whole
     Builder) only when nothing here takes it. Registered on `document`, where
     a bubble listener still precedes the modal's, so stopping propagation
     shadows the modal — the same mechanism the legacy canvas uses. Listeners
     of others on `document` (an open list, the Code viewer) still run.
     Nearest first:
       - a dialog above the Builder (the import dialog) is not ours to answer;
       - a key something nearer already answered (preventDefault) stops here;
       - the Code viewer and an open list close themselves;
       - the Run menu;
       - a text field of this page with focus is left, its text as typed
         (a field elsewhere keeps Escape, as before);
       - one drill level up;
       - an unsaved edit keeps the Builder open: Escape neither discards nor
         saves it (#357, packaged App run 41273700851);
       - otherwise the modal closes, as before. */
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      const doc = window.document;
      const root = pageRef.current;
      const hosts = doc.querySelectorAll("[data-pupu-modal-overlay-host]");
      const top = hosts.length > 0 ? hosts[hosts.length - 1] : null;
      if (root && top && !top.contains(root)) return;
      /* Something nearer (an open list's own keys) already answered it. */
      if (event.defaultPrevented) {
        event.stopPropagation();
        return;
      }
      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };
      if (root && root.querySelector('[data-viewer-open="true"]')) {
        event.stopPropagation();
        return;
      }
      if (doc.querySelector('[role="listbox"]')) {
        event.stopPropagation();
        return;
      }
      if (runViewScope) {
        setRunViewScope(null);
        take();
        return;
      }
      /* An open Test panel is the nearest thing to close. */
      if (testOpen) {
        setTestOpen(false);
        take();
        return;
      }
      const active = doc.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) {
        /* A field outside this page keeps its own Escape, as before. */
        if (!root || !root.contains(active)) return;
        active.blur();
        take();
        return;
      }
      if (drill_up() === true) {
        take();
        return;
      }
      if (dirtyRef.current) {
        setEscapeHeld(true);
        take();
      }
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [drill_up, testOpen, runViewScope]);
  dirtyRef.current = Boolean(session.dirty);
  useEffect(() => {
    if (!session.dirty) setEscapeHeld(false);
  }, [session.dirty]);

  /* Undo and redo, from the keyboard as well as the control center — the
     legacy canvas's keys. A field being typed in keeps its own. */
  useEffect(() => {
    const onKey = (event) => {
      const active = window.document.activeElement;
      const tag = active?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable) return;
      /* The editor is not on screen under the run view. */
      if (runViewScope) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = typeof event.key === "string" ? event.key.toLowerCase() : "";
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || (event.ctrlKey && key === "y")) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runViewScope, undo, redo]);

  /* What the control center says belongs to the graph on screen: another
     resource or another graph inside this one starts without it. */
  useEffect(() => {
    setTestOpen(false);
  }, [session.open_id]);
  useEffect(() => {
    setCanvasProblem(null);
  }, [session.open_id, steps]);

  const editor_crumbs = drilled
    ? drill_crumbs(stack, shown_label, t)
    : [{ label: shown_label, depth: null, navigable: false }];
  const navigate_crumb = (depth) => drill_to(depth);
  /* The open graph and the path to it are shown in the side menu's
     breadcrumb, above its search field, where they can be clicked: the
     canvas's top edge is the window's drag region. Each graph is its icon and
     its name; with nothing drilled it is the one open, which leads nowhere.
     Under the run view nothing on it leads anywhere either. */
  const trail_segments =
    session.status === SESSION_STATUS.READY || drilled
      ? drill_trail_segments(
          editor_crumbs,
          (depth) => depth === stack.length
            ? graph_icon(document, steps.length > 0)
            : drill_level_icon(stack, session, depth),
          graph_icon(document, steps.length > 0),
          t,
        )
      : [];
  usePublishAgentsDrillTrail(
    runViewScope
      ? trail_segments.map(({ ariaLabel, hint, ...segment }) => ({ ...segment, depth: null }))
      : trail_segments,
    navigate_crumb,
  );
  /* The sentence for a graph that has just gone is said in the same render
     that stops showing it, rather than one commit later. */
  const shown_notices = notices_still_true(lost === null ? notices : [lost], session);

  const ready = session.status === SESSION_STATUS.READY;
  const conflict = conflict_message(session, t);
  const detail = (chrome && chrome.detail) || DEFAULT_CHROME.detail;
  const messages = [
    session.error
      ? { text: agentProblemMessage(session.error, t) || session.error.code, testId: "skeleton-save-error" }
      : null,
    canvasProblem ? { text: renderAgentMessage(canvasProblem, t), testId: "skeleton-graph-problem" } : null,
    escapeHeld && session.dirty
      ? {
          testId: "skeleton-escape-unsaved",
          text: t("agents.editor.escape_unsaved"),
        }
      : null,
    shown_notices.length > 0
      ? {
          testId: "skeleton-drill-notice",
          text: shown_notices.map((message, index) => <div key={index}>{renderAgentMessage(message, t)}</div>),
        }
      : null,
  ].filter(Boolean);
  const showRun = testOpen && ready;
  /* "Go to node" from the Test panel: the node it names is in this
     resource's own graph, so an embedded child open on the canvas is left
     for it first (one drill frame per embedded step). */
  const fix_node = (node_id) => {
    if (steps.length > 0) drill_to(stack.length - steps.length);
    setTestOpen(false);
    setSelectedNodeId(node_id);
  };
  const upgradeCandidate = ready && steps.length === 0 && !runViewScope
    && is_legacy_upgrade_candidate(session.document);
  // First-hop migration carries its source on the root graph. Its old pool
  // converter must not bypass the explicit, source-kind-preserving upgrade.
  // Native graphs with a legacy pool but no migration source keep their route.
  const migratedLegacy = ready && session.document.nodes.some((node) => node?.config
    && Object.prototype.hasOwnProperty.call(node.config, "legacy_source"));
  const upgradeBlocked = session.dirty
    ? t("agents.editor.upgrade_save_first")
    : session.saving || session.converting
      ? t("agents.editor.upgrade_wait_write")
      : session.conflict
        ? t("agents.editor.upgrade_resolve_conflict")
        : null;
  const upgradeResource = upgradeCandidate && session.resource_id
    ? { id: session.resource_id, edit_token: session.edit_token, document: session.document, name: typeof session.document?.name === "string" ? session.document.name : "" }
    : null;
  const reopen_after_upgrade = () => {
    emitSkeletonLibraryRefresh({ reason: "resource_saved", resource_id: session.resource_id || "" });
    setUpgradeOpen(false);
    setSelectedNodeId(null);
    load(session.resource_id);
  };

  const shownNodes = Array.isArray(document?.nodes) ? document.nodes : [];
  const reopenTarget = shownNodes.some((node) => node?.id === lastShownNodeRef.current)
    ? lastShownNodeRef.current
    : shownNodes[0]?.id || null;

  return (
    <div ref={pageRef} style={PAGE(isDark)} data-testid="skeleton-resource-page">
      {/* The canvas takes its height by growing (`flex: 1`), so it needs a
          flex column that fills the page to grow into. Without it the graph
          was drawn 0px tall. */}
      {ready && runViewScope && <SkeletonRunView scope={runViewScope} isDark={isDark} onClose={() => setRunViewScope(null)}
        leftInset={(chrome && chrome.crumbLeft) ?? DEFAULT_CHROME.crumbLeft} />}
      {ready && !runViewScope && (
        <div style={CANVAS_FRAME}>
        <SkeletonCanvas
          resourceId={drill_layout_key(
            session.resource_id,
            resource_document,
            steps,
            revision,
          )}
          document={document}
          commandScope={`${session.open_id}:${revision}`}
          onGraphCommand={(document?.kind === "agent" || document?.kind === "workflow") && document?.schema_version === 1 ? graphCommand : undefined}
          onSelectNode={(id) => {
            setSelectedNodeId(id);
            if (id) setTestOpen(false);
          }}
          onOpenSubagent={open_subagent}
          onOpenWorkflow={open_called_workflow}
          managedSources={session.sources}
          homeToken={homeToken}
          onProblem={setCanvasProblem}
          isDark={isDark}
        />
        </div>
      )}

      {session.status === SESSION_STATUS.LOADING && (
        <div style={CENTERED}>
          <span style={NOTE}>{t("agents.editor.opening")}</span>
        </div>
      )}
      {session.status === SESSION_STATUS.LOAD_FAILED && (
        <div style={CENTERED}>
          <span data-testid="skeleton-load-failed" style={NOTE}>
            {(session.error && agentProblemMessage(session.error, t)) ||
              t("agents.editor.open_failed")}
          </span>
        </div>
      )}
      {session.status === SESSION_STATUS.UNAVAILABLE && (
        <div style={CENTERED}>
          <span data-testid="skeleton-store-unavailable" style={NOTE}>
            {t("agents.save.store_unavailable")}
          </span>
        </div>
      )}

      {/* Esc goes back up a level (the breadcrumb itself is in the side
          menu); not under the run view, which Esc closes instead. */}
      <EscapeBackHint
        isDark={isDark}
        visible={!runViewScope && drilled}
        top={(chrome && chrome.crumbTop) ?? DEFAULT_CHROME.crumbTop}
        left={(chrome && chrome.crumbLeft) ?? DEFAULT_CHROME.crumbLeft}
        testId="skeleton-escape-hint"
      />
      {/* What a sub-graph is saved with. An empty diagnostics area would
          otherwise read as "nothing is wrong" here, and it is not what it
          means: measured on the real store, the draft check answers the same
          `[]` for an embedded child with no End as for a healthy one. */}
      {!runViewScope && drilled && steps.length > 0 && (
        <CanvasCaptionChip isDark={isDark} testId="skeleton-drill-caption">
          <span data-testid="skeleton-drill-save-target">
            {save_target_caption(resource_label, t)}
          </span>
          <span data-testid="skeleton-drill-unchecked">{t("agents.drill.embedded_checked")}</span>
        </CanvasCaptionChip>
      )}

      {!runViewScope && (conflict || showRun || messages.length > 0 || upgradeCandidate) && (
        <AboveControls testId="skeleton-above-controls">
          {upgradeCandidate && !conflict && (
            <ControlPopover isDark={isDark} testId="skeleton-legacy-upgrade-offer">
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
                {t("agents.editor.legacy_agent")}
              </span>
              <span style={{ fontSize: 11, lineHeight: 1.45 }}>
                {t("agents.editor.legacy_upgrade_description")}
              </span>
              {upgradeBlocked && <span style={{ fontSize: 11, lineHeight: 1.45, opacity: 0.8 }}>{upgradeBlocked}</span>}
              <div style={{ display: "flex", gap: 6 }}>
                <Button
                  label={t("agents.editor.upgrade")}
                  disabled={Boolean(upgradeBlocked)}
                  onClick={() => setUpgradeOpen(true)}
                  dom_props={{ "data-testid": "skeleton-legacy-upgrade-open" }}
                  style={{ fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, color: upgradeBlocked ? undefined : (isDark ? "#60a5fa" : "#4a5bd8") }}
                />
              </div>
            </ControlPopover>
          )}
          {/* A conflict is not offered as "retry". Retrying at the same token
              fails identically, and retrying at the newer one replaces the
              other person's work without anyone seeing it happen. The two
              honest choices are named for what they do. */}
          {conflict && (
            <ControlPopover isDark={isDark} testId="skeleton-save-conflict">
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
                {t("agents.save.saved_elsewhere")}
              </span>
              <span style={{ fontSize: 11, lineHeight: 1.45 }}>{conflict}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <Button
                  label={t("agents.save.look_at_theirs")}
                  onClick={takeTheirs}
                  style={{ fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 }}
                />
                <Button
                  label={t("agents.save.keep_mine")}
                  onClick={keepMine}
                  style={{
                    fontSize: 11.5,
                    paddingVertical: 4,
                    paddingHorizontal: 10,
                    borderRadius: 6,
                    color: "#4a5bd8",
                  }}
                />
              </div>
            </ControlPopover>
          )}
          <CanvasMessageStrip isDark={isDark} items={messages} role="alert" />
        </AboveControls>
      )}

      {ready && !runViewScope && (
        <CanvasControlCenter
          isDark={isDark}
          testId="skeleton-control-center"
          onUndo={undo}
          onRedo={redo}
          canUndo={can_undo(session)}
          canRedo={can_redo(session)}
          onHome={() => setHomeToken((token) => token + 1)}
          onSave={handleSave}
          saveLabel={session.saving ? t("agents.save.saving") : t("agents.save.save")}
          saveDisabled={!can_save(session)}
          saveActive={Boolean(session.dirty && !session.conflict)}
          run={<RunTrigger testId="skeleton-control-center-run" open={testOpen}
            onToggle={() => setTestOpen((open) => !open)} />}
        />
      )}
      {session.status !== SESSION_STATUS.EMPTY &&
        session.status !== SESSION_STATUS.UNAVAILABLE && (
          <span data-testid="skeleton-save-state" role="status" style={VISUALLY_HIDDEN}>
            {session.dirty ? t("agents.save.unsaved_changes") : t("agents.save.saved")}
          </span>
        )}

      {upgradeResource && (
        <LegacyUpgradeWizard
          open={upgradeOpen}
          resource={upgradeResource}
          isDark={isDark}
          onClose={() => setUpgradeOpen(false)}
          onUpgraded={reopen_after_upgrade}
          onReopen={reopen_after_upgrade}
        />
      )}
      {ready && (
        <div data-testid="skeleton-editor-detail-boundary" inert={Boolean(runViewScope)} aria-hidden={runViewScope ? "true" : undefined} style={{ display: "contents" }}>
        <FloatingDetailShell
          isDark={isDark}
          open={(Boolean(selectedNodeId) || testOpen) && !runViewScope}
          width={detail.width}
          minWidth={detail.minWidth}
          resizing={Boolean(detail.resizing)}
          testId="skeleton-detail-panel-shell"
          onClose={() => {
            setTestOpen(false);
            setSelectedNodeId(null);
          }}
          onOpen={reopenTarget && !runViewScope ? () => setSelectedNodeId(reopenTarget) : undefined}
          handle={
            typeof detail.onDragStart === "function"
              ? {
                  testId: "skeleton-detail-resize-handle",
                  pillTestId: "skeleton-detail-resize-pill",
                  onDragStart: detail.onDragStart,
                  onDrag: detail.onDrag,
                  onDragEnd: detail.onDragEnd,
                }
              : null
          }
        >
          {/* Remounted by undo and redo: the document under a field was
              replaced, not typed into, so text it was holding has to go. */}
          <div style={{ display: showRun ? "none" : "contents" }}>
          <DetailPanel
            key={`${session.open_id}:${session.history_epoch || 0}`}
            recipe={null}
            selectedNodeId={selectedNodeId}
            onChange={() => {}}
            onChangeSilent={() => {}}
            document={document}
            startContext={startContext}
            documentRevision={session.document_revision}
            rootDocument={session.document}
            diagnostics={diagnostics}
            diagnosticsUnchecked={unchecked}
            onDocumentChange={edit_shown}
            managedSources={session.sources}
            onOpenSubagent={open_subagent}
            onOpenEmbeddedHook={open_embedded_hook}
            onOpenWorkflow={open_called_workflow}
            onEntryIdRepaired={entry_id_repaired}
            embedded={steps.length > 0}
            onConvertLegacy={migratedLegacy ? () => {
              if (upgradeCandidate && !upgradeBlocked) setUpgradeOpen(true);
            } : convertLegacyPools}
            canConvertLegacy={migratedLegacy
              ? Boolean(upgradeCandidate && !upgradeBlocked)
              : can_convert_legacy_pools(session) && steps.length === 0}
            convertingLegacy={session.converting}
          />
          </div>
          <BuilderTestPanel key={session.document?.id}
            active={showRun && !runViewScope}
            session={session} isDark={isDark} onSave={handleSave} onCheck={preflight}
            onFix={fix_node}
            scopeNote={steps.length > 0 ? t("agents.test_run.embedded_note", { name: resource_label }) : null}
            onViewChatRun={open_run_view}
            onObserve={(scope) => setRunViewScope(scope)} />
        </FloatingDetailShell>
        </div>
      )}
    </div>
  );
}
