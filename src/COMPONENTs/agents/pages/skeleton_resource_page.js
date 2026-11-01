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
  FloatingBreadcrumb,
  FloatingDetailShell,
  VISUALLY_HIDDEN,
} from "./recipes_page/canvas_chrome";
import SkeletonRunMenu, { RunTrigger } from "./recipes_page/skeleton_run_menu";
import useSkeletonResource from "./recipes_page/use_skeleton_resource";
import SkeletonCanvas from "./recipes_page/skeleton_canvas";
import { apply_graph_command } from "./recipes_page/skeleton_graph_commands";
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
  EMBEDDED_CHECKED_CAPTION,
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
import { read_workflow_revision_view } from "./recipes_page/skeleton_resources";
import {
  PIN_CHANGED_MESSAGE,
  pin_still_held,
  pinned_open_failed_message,
  pinned_view_caption,
  pinned_view_crumbs,
  pinned_view_key,
  pinned_view_label,
} from "./recipes_page/pinned_workflow_view";

/* One Skeleton resource, open for editing.
 *
 * This is the first product surface that talks to the resource store: it loads
 * through the real facade, hands the document to the shared detail panel, and
 * saves at the token it loaded, with the conflict choices in the bar.
 *
 * The graph is drawn from two sources kept apart on purpose: the document says
 * what it is, and `SERVICEs/skeleton_layout` says where it is drawn. A
 * Skeleton node is closed to `{id, type, config}` and the store refuses a
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
 *
 * ── Looking at a pinned Workflow revision ───────────────────────────────
 *
 * A Workflow Call runs one published revision, and the author can open it to
 * see what will run (#357). That is neither kind of frame above: a revision
 * is not editable anywhere, so nothing is restored on the way back and there
 * is no session to keep. The view is laid over this sitting instead — the
 * session, the drill steps, the selection and the panel stay exactly as they
 * were, merely not shown — and going back simply stops laying it over. */

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
  /* The control center's: Home, the Run menu, and an edit the canvas refused. */
  const [homeToken, setHomeToken] = useState(0);
  const [runOpen, setRunOpen] = useState(false);
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
  const pageRef = useRef(null);
  const dirtyRef = useRef(false);
  /* The pinned revision on screen, read-only, or null: `{pin, node_id,
     version, sources}`. */
  const [pinned, setPinned] = useState(null);
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
    setPinned(null);
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
      ? drill_lost_reason(session.document, drillSteps, revision)
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
  const prefix = steps.length === 0
    ? ["document"]
    : embedded_path(resource_document, steps, revision);

  useEffect(() => {
    if (lost === null) return;
    setPinned(null);
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
    let result = { ok: false, document: null, problem: { code: "view_changed", message: "This view changed. Try the edit in the graph now on screen." } };
    editCurrent({ open_id: commandOpen, resource_id: commandResource }, (current) => {
      if (navigationRef.current !== commandNavigation || current.document_revision !== revision) return current.document;
      const shown = steps.length === 0 ? current.document : embedded_document(current.document, steps, revision);
      if (!shown) return current.document;
      result = apply_graph_command(shown, command);
      if (!result.ok || result.document === shown) return current.document;
      return steps.length === 0 ? result.document : with_embedded_document(current.document, steps, result.document, revision);
    });
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
    async ({ pool_node_id, entry_id, entry_index, reason }) => {
      const request = navigate();
      setNotices([]);
      if (reason) {
        setNotices([reason]);
        return;
      }
      const blocked = drill_blocked_reason(session);
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
        setNotices([gone_message("That subagent")]);
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
      const target = drill_target(found.entry);
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
        const blocked_now = drill_obsolete_reason(answer.blocked);
        if (answer.obsolete && !blocked_now) return;
        setNotices([
          blocked_now ||
            answer.refused ||
            open_failed_message(
              target.agent_id,
              answer.result && answer.result.error,
            ),
        ]);
        return;
      }
      setDrillStack((frames) =>
        push_drill_frame(
          frames,
          frame_for_resource_step({
            label: resource_label,
            steps,
            selected_node_id: selectedNodeId,
            session: answer.left,
            saved_version: saved_version_of(answer.left.resource_id),
          }),
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

  /* Opening a hook's own Workflow (#357). It is part of this resource, so it
     is opened exactly as an embedded subagent is — a step into the document
     already loaded, edited in the live session and saved with this Agent —
     and only a hook whose Workflow is its own can be opened this way. */
  const open_embedded_hook = useCallback(
    ({ pool_node_id, entry_id, entry_index }) => {
      navigate();
      setNotices([]);
      const blocked = drill_blocked_reason(session);
      if (blocked) {
        setNotices([blocked]);
        return;
      }
      const clicked = { node_id: pool_node_id, entry_id, entry_index, taken_in: revision, member: HOOK_MEMBER };
      const found = hook_entry_for(document, clicked, revision);
      if (!found) {
        setNotices([gone_message("That hook")]);
        return;
      }
      const target = hook_drill_target(found.entry);
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
            via_label: "Hooks Pool",
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
            left_behind_message(graph_label(session.document, session.resource_id)),
          );
        }
        restore(frame.session);
        if (frame_is_stale(frame, savedVersionsRef.current)) {
          messages.push(stale_frame_message(frame.label));
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

  /* Opening the revision a Workflow Call is pinned to. The read is the v2
     revision read with its Code text; nothing else is read (not the
     Workflow's draft, not its latest revision) and nothing is written. Its
     answer is adopted only by the navigation that asked for it, and only
     while the node on screen still holds that very pin. */
  const open_pinned_workflow = useCallback(
    async ({ node_id, workflow_id, revision_id }) => {
      const request = navigate();
      const pin = { workflow_id, revision_id };
      const asked = { open_id: session.open_id, steps };
      setNotices([]);
      const result = await read_workflow_revision_view(workflow_id, revision_id);
      if (navigationRef.current !== request) return { ok: false, obsolete: true };
      const now = latestRef.current;
      if (now.session.open_id !== asked.open_id || now.steps !== asked.steps) {
        return { ok: false, obsolete: true };
      }
      const shown = now.steps.length === 0
        ? now.session.document
        : embedded_document(now.session.document, now.steps, now.revision);
      if (!pin_still_held(shown, node_id, pin)) {
        setNotices([PIN_CHANGED_MESSAGE]);
        return { ok: false };
      }
      if (!result.ok) {
        setNotices([pinned_open_failed_message(result)]);
        return { ok: false };
      }
      setRunOpen(false);
      setPinned({ pin, node_id, version: result.data.version, sources: result.data.sources });
      return { ok: true };
    },
    [navigate, session.open_id, steps],
  );

  /* Going back from the revision is only that: the sitting under it never
     moved. A read still in flight for another open is no longer wanted. */
  const close_pinned = useCallback(() => {
    if (!pinned) return false;
    navigate();
    setPinned(null);
    setNotices([]);
    return true;
  }, [navigate, pinned]);

  /* Another resource, or another document version taken over this one, is
     not the sitting the view was opened from. */
  useEffect(() => {
    setPinned(null);
  }, [session.open_id, revision]);

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
       - the pinned read-only revision, then the Run menu;
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
      /* A pinned revision on screen is the nearest graph to leave. */
      if (close_pinned() === true) {
        take();
        return;
      }
      /* An open Run menu is the nearest thing to close. */
      if (runOpen) {
        setRunOpen(false);
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
  }, [close_pinned, drill_up, runOpen]);
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
      /* The editor is not on screen under a pinned revision. */
      if (pinned) return;
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
  }, [pinned, undo, redo]);

  /* What the control center says belongs to the graph on screen: another
     resource or another graph inside this one starts without it. */
  useEffect(() => {
    setRunOpen(false);
  }, [session.open_id]);
  useEffect(() => {
    setCanvasProblem(null);
  }, [session.open_id, steps]);

  const editor_crumbs = drilled
    ? drill_crumbs(stack, shown_label)
    : [{ label: shown_label, depth: null, navigable: false }];
  const crumbs = pinned
    ? pinned_view_crumbs(editor_crumbs, stack.length, pinned.node_id, pinned_view_label(pinned.version))
    : drilled ? editor_crumbs : [];
  /* From over a pinned revision, the graph it was opened from is at
     `stack.length`; anything further up is a drill frame, left as usual. */
  const navigate_crumb = (depth) => {
    if (!pinned) return drill_to(depth);
    close_pinned();
    return depth === stack.length ? true : drill_to(depth);
  };
  /* The sentence for a graph that has just gone is said in the same render
     that stops showing it, rather than one commit later. */
  const shown_notices = notices_still_true(lost === null ? notices : [lost], session);

  const ready = session.status === SESSION_STATUS.READY;
  const conflict = conflict_message(session);
  const detail = (chrome && chrome.detail) || DEFAULT_CHROME.detail;
  const messages = [
    session.error
      ? { text: session.error.message || session.error.code, testId: "skeleton-save-error" }
      : null,
    canvasProblem ? { text: canvasProblem, testId: "skeleton-graph-problem" } : null,
    escapeHeld && session.dirty
      ? {
          testId: "skeleton-escape-unsaved",
          text: "Unsaved changes. Escape does not close the Builder until they are saved.",
        }
      : null,
    shown_notices.length > 0
      ? {
          testId: "skeleton-drill-notice",
          text: shown_notices.map((message, index) => <div key={index}>{message}</div>),
        }
      : null,
  ].filter(Boolean);
  const showRun = runOpen && ready;

  return (
    <div ref={pageRef} style={PAGE(isDark)} data-testid="skeleton-resource-page">
      {/* The canvas takes its height by growing (`flex: 1`), so it needs a
          flex column that fills the page to grow into. Without it the graph
          was drawn 0px tall. */}
      {ready && pinned && (
        <div style={CANVAS_FRAME} data-testid="workflow-pinned-view">
        <SkeletonCanvas
          resourceId={pinned_view_key(pinned.pin)}
          document={pinned.version.document}
          commandScope="pinned"
          onSelectNode={() => {}}
          managedSources={pinned.sources}
          homeToken={homeToken}
          onProblem={setCanvasProblem}
          isDark={isDark}
        />
        </div>
      )}
      {ready && !pinned && (
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
          onSelectNode={setSelectedNodeId}
          onOpenSubagent={open_subagent}
          managedSources={session.sources}
          homeToken={homeToken}
          onProblem={setCanvasProblem}
          isDark={isDark}
        />
        </div>
      )}

      {session.status === SESSION_STATUS.LOADING && (
        <div style={CENTERED}>
          <span style={NOTE}>Opening…</span>
        </div>
      )}
      {session.status === SESSION_STATUS.LOAD_FAILED && (
        <div style={CENTERED}>
          <span data-testid="skeleton-load-failed" style={NOTE}>
            {(session.error && session.error.message) ||
              "This Agent could not be opened."}
          </span>
        </div>
      )}
      {session.status === SESSION_STATUS.UNAVAILABLE && (
        <div style={CENTERED}>
          <span data-testid="skeleton-store-unavailable" style={NOTE}>
            The Agent library is not reachable in this build, so nothing here can
            be saved or run.
          </span>
        </div>
      )}

      {(drilled || pinned) && (
        <FloatingBreadcrumb
          isDark={isDark}
          crumbs={crumbs}
          onNavigate={navigate_crumb}
          top={chrome.crumbTop}
          left={chrome.crumbLeft}
          testId="skeleton-drill-breadcrumb"
          crumbsTestId="skeleton-drill-crumbs"
          crumbAriaLabel={(crumb) => `Back to ${crumb.label}`}
        />
      )}
      {/* What a sub-graph is saved with. An empty diagnostics area would
          otherwise read as "nothing is wrong" here, and it is not what it
          means: measured on the real store, the draft check answers the same
          `[]` for an embedded child with no End as for a healthy one. */}
      {pinned && (
        <CanvasCaptionChip isDark={isDark} testId="workflow-pinned-caption">
          <span>{pinned_view_caption(pinned.version)}</span>
        </CanvasCaptionChip>
      )}
      {!pinned && drilled && steps.length > 0 && (
        <CanvasCaptionChip isDark={isDark} testId="skeleton-drill-caption">
          <span data-testid="skeleton-drill-save-target">
            {save_target_caption(resource_label)}
          </span>
          <span data-testid="skeleton-drill-unchecked">{EMBEDDED_CHECKED_CAPTION}</span>
        </CanvasCaptionChip>
      )}

      {(conflict || showRun || messages.length > 0) && (
        <AboveControls testId="skeleton-above-controls">
          {/* A conflict is not offered as "retry". Retrying at the same token
              fails identically, and retrying at the newer one replaces the
              other person's work without anyone seeing it happen. The two
              honest choices are named for what they do. */}
          {conflict && (
            <ControlPopover isDark={isDark} testId="skeleton-save-conflict">
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>
                Saved somewhere else
              </span>
              <span style={{ fontSize: 11, lineHeight: 1.45 }}>{conflict}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <Button
                  label="Look at theirs"
                  onClick={takeTheirs}
                  style={{ fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 }}
                />
                <Button
                  label="Keep mine and replace it"
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
          {showRun && (
            <SkeletonRunMenu session={session} isDark={isDark} onCheck={preflight} />
          )}
          <CanvasMessageStrip isDark={isDark} items={messages} role="alert" />
        </AboveControls>
      )}

      {ready && !pinned && (
        <CanvasControlCenter
          isDark={isDark}
          testId="skeleton-control-center"
          onUndo={undo}
          onRedo={redo}
          canUndo={can_undo(session)}
          canRedo={can_redo(session)}
          onHome={() => setHomeToken((token) => token + 1)}
          onSave={handleSave}
          saveLabel={session.saving ? "Saving…" : "Save"}
          saveDisabled={!can_save(session)}
          saveActive={Boolean(session.dirty && !session.conflict)}
          run={<RunTrigger open={runOpen} onToggle={() => setRunOpen((open) => !open)} />}
        />
      )}
      {session.status !== SESSION_STATUS.EMPTY &&
        session.status !== SESSION_STATUS.UNAVAILABLE && (
          <span data-testid="skeleton-save-state" role="status" style={VISUALLY_HIDDEN}>
            {session.dirty ? "Unsaved changes" : "Saved"}
          </span>
        )}

      {ready && (
        <FloatingDetailShell
          isDark={isDark}
          open={Boolean(selectedNodeId) && !pinned}
          width={detail.width}
          minWidth={detail.minWidth}
          resizing={Boolean(detail.resizing)}
          testId="skeleton-detail-panel-shell"
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
          <DetailPanel
            key={`${session.open_id}:${session.history_epoch || 0}`}
            recipe={null}
            selectedNodeId={selectedNodeId}
            onChange={() => {}}
            onChangeSilent={() => {}}
            document={document}
            documentRevision={session.document_revision}
            rootDocument={session.document}
            diagnostics={diagnostics}
            diagnosticsUnchecked={unchecked}
            onDocumentChange={edit_shown}
            managedSources={session.sources}
            onOpenSubagent={open_subagent}
            onOpenEmbeddedHook={open_embedded_hook}
            onOpenPinnedWorkflow={open_pinned_workflow}
            onEntryIdRepaired={entry_id_repaired}
            embedded={steps.length > 0}
            onConvertLegacy={convertLegacyPools}
            canConvertLegacy={can_convert_legacy_pools(session) && steps.length === 0}
            convertingLegacy={session.converting}
          />
        </FloatingDetailShell>
      )}
    </div>
  );
}
