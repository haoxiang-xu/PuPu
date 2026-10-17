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
import SkeletonSaveBar from "./recipes_page/skeleton_save_bar";
import useSkeletonResource from "./recipes_page/use_skeleton_resource";
import { can_convert_legacy_pools } from "./recipes_page/skeleton_resource_session";
import SkeletonCanvas from "./recipes_page/skeleton_canvas";
import SkeletonDrillBreadcrumb from "./recipes_page/skeleton_drill_breadcrumb";
import { SESSION_STATUS } from "./recipes_page/skeleton_resource_session";
import { why_not_a_subagent } from "./recipes_page/skeleton_subagent_eligibility";
import {
  DRILL,
  EMBEDDED_UNCHECKED_CAPTION,
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
  embedded_document,
  embedded_path,
  frame_for_embedded_step,
  frame_for_resource_step,
  frame_is_stale,
  gone_message,
  graph_label,
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
 * selection — because going back is navigation and must not re-read. */

const PANEL = (isDark) => ({
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 12,
  height: "100%",
  minHeight: 0,
  boxSizing: "border-box",
  color: "var(--pupu-text)",
  backgroundColor: isDark ? "var(--pupu-background)" : "var(--pupu-background)",
});

const NOTE = { fontSize: 11, color: "#86868b", lineHeight: 1.45 };

const NOTICE = {
  fontSize: 11,
  lineHeight: 1.5,
  color: "rgba(176,32,32,0.95)",
  flexShrink: 0,
};

const ROW = (isDark, selected) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "5px 9px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 11.5,
  background: selected
    ? isDark
      ? "rgba(255,255,255,0.07)"
      : "rgba(0,0,0,0.05)"
    : "transparent",
});

export default function SkeletonResourcePage({ resourceId, onDrilledChange }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const {
    session,
    load,
    openAnother,
    restore,
    edit,
    save,
    keepMine,
    takeTheirs,
    preflight,
    convertLegacyPools,
  } = useSkeletonResource();
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  /* The graphs left behind, outermost first. */
  const [drillFrames, setDrillStack] = useState([]);
  /* Where inside THIS resource's document the open graph sits: one step per
     embedded entry, by pool node id, entry id and what it took to tell that
     entry from another under the same id. Empty means the resource's own
     graph. */
  const [drillSteps, setSteps] = useState([]);
  const [notices, setNotices] = useState([]);
  /* How many times each resource has been written in this sitting. The same
     Agent can sit at two depths — a graph referencing an Agent that references
     it back — so saving deeper can write the very resource a frame below holds
     an older copy of. */
  const savedVersionsRef = useRef({});
  /* Which navigation the page is on. Opening a referenced Agent is a read,
     and by the time it answers the author may have opened something else,
     gone back up, or had the resource changed under them. The answer is only
     about the navigation that asked for it: pushing a frame for it then puts
     the graph they left into the breadcrumb over the graph they are in, and a
     notice about it names a graph that is not on screen. Counted rather than
     compared, because "the same place again" is still a later question. */
  const navigationRef = useRef(0);
  const navigate = useCallback(() => {
    navigationRef.current += 1;
    return navigationRef.current;
  }, []);

  useEffect(() => {
    if (!resourceId) return;
    navigate();
    load(resourceId);
    setSelectedNodeId(null);
    setDrillStack([]);
    setSteps([]);
    setNotices([]);
  }, [resourceId, load, navigate]);

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
    setSteps([]);
    setDrillStack((frames) => closed_embedded_frames(frames));
    setSelectedNodeId(null);
    setNotices([lost]);
  }, [lost]);

  const nodes = (document && document.nodes) || [];
  const resource_label = graph_label(resource_document, session.resource_id);
  const shown_label = graph_label(document, session.resource_id);

  /* An embedded graph is edited by writing it back into the parent, which is
     what makes Save write the parent: there is only ever one document on its
     way to the store. */
  const edit_shown = useCallback(
    (next) => {
      if (steps.length === 0) return edit(next);
      return edit(
        with_embedded_document(session.document, steps, next, revision),
      );
    },
    [edit, revision, session.document, steps],
  );

  /* The draft check does not look inside an embedded graph — measured: a child
     with no End answers the same `[]` as a healthy one — and the parent's own
     problems are reported at paths that would land on this graph's nodes by
     position. So a child view shows the ones reported at its own path, which
     is none of the parent's. */
  const diagnostics = steps.length === 0
    ? session.diagnostics
    : diagnostics_for_embedded(session.diagnostics, prefix);

  const handleSave = useCallback(async () => {
    const before = session.edit_token;
    const latest = await save();
    /* The write really did land exactly when the token moved — which is also
       what tells a frame below that its copy is now the older one. */
    if (latest && latest.edit_token && latest.edit_token !== before) {
      const id = latest.resource_id;
      savedVersionsRef.current[id] = (savedVersionsRef.current[id] || 0) + 1;
    }
    return latest;
  }, [save, session.edit_token]);

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
           this page is still on the navigation that asked. */
        () => navigationRef.current === request,
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
            saved_version:
              savedVersionsRef.current[answer.left.resource_id] || 0,
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
      selectedNodeId,
      session,
      shown_label,
      steps,
    ],
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

  /* Escape goes up one drill level before anything else sees it. Registered on
     `document`, where a bubble listener still precedes the Agents modal's
     `window` one, so stopping propagation here shadows it — the same mechanism
     the legacy canvas uses. With no drill open nothing is stopped and the key
     passes through untouched. It lives here rather than on the canvas because
     the stack outlives the canvas: a drilled-in resource whose re-read failed
     shows no graph and still has a breadcrumb. */
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      const tag = window.document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (drill_up() === true) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [drill_up]);

  const crumbs = drilled ? drill_crumbs(stack, shown_label) : [];
  /* The sentence for a graph that has just gone is said in the same render
     that stops showing it, rather than one commit later. */
  const shown_notices = notices_still_true(lost === null ? notices : [lost], session);

  return (
    <div style={PANEL(isDark)} data-testid="skeleton-resource-page">
      <SkeletonSaveBar
        session={session}
        isDark={isDark}
        onSave={handleSave}
        onKeepMine={keepMine}
        onTakeTheirs={takeTheirs}
        onPreflight={preflight}
      />

      {drilled && (
        <SkeletonDrillBreadcrumb
          crumbs={crumbs}
          isDark={isDark}
          onNavigate={drill_to}
          caption={
            steps.length > 0 ? save_target_caption(resource_label) : null
          }
          note={steps.length > 0 ? EMBEDDED_UNCHECKED_CAPTION : null}
        />
      )}

      {shown_notices.length > 0 && (
        <div data-testid="skeleton-drill-notice" style={NOTICE}>
          {shown_notices.map((message, index) => (
            <div key={index}>{message}</div>
          ))}
        </div>
      )}

      {session.status === SESSION_STATUS.LOADING && (
        <span style={NOTE}>Opening…</span>
      )}

      {session.status === SESSION_STATUS.LOAD_FAILED && (
        <span data-testid="skeleton-load-failed" style={NOTE}>
          {(session.error && session.error.message) ||
            "This Agent could not be opened."}
        </span>
      )}

      {session.status === SESSION_STATUS.READY && (
        <div style={{ display: "flex", gap: 12, flex: 1, minHeight: 0 }}>
          {/* The graph, and the same nodes as a list beside it. The list is
              not a fallback for the canvas — it is how a node is reached by
              name when the graph is large, and it is what a keyboard can
              use. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <SkeletonCanvas
              resourceId={drill_layout_key(
                session.resource_id,
                resource_document,
                steps,
                revision,
              )}
              document={document}
              onSelectNode={setSelectedNodeId}
              onOpenSubagent={open_subagent}
              isDark={isDark}
            />
            <div
              data-testid="skeleton-node-list"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                paddingTop: 8,
                flexShrink: 0,
              }}
            >
              {nodes.map((node) => (
                <div
                  key={node.id}
                  data-testid={`skeleton-node-${node.id}`}
                  onClick={() => setSelectedNodeId(node.id)}
                  style={ROW(isDark, node.id === selectedNodeId)}
                >
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                    {node.id}
                  </span>
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#86868b" }}>
                    {node.type}
                  </span>
                </div>
              ))}
              {nodes.length === 0 && <span style={NOTE}>This graph has no nodes.</span>}
            </div>
          </div>

          <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <DetailPanel
              recipe={null}
              selectedNodeId={selectedNodeId}
              onChange={() => {}}
              onChangeSilent={() => {}}
              document={document}
              documentRevision={session.document_revision}
              diagnostics={diagnostics}
              onDocumentChange={edit_shown}
              onOpenSubagent={open_subagent}
              embedded={steps.length > 0}
              onConvertLegacy={convertLegacyPools}
              canConvertLegacy={can_convert_legacy_pools(session) && steps.length === 0}
              convertingLegacy={session.converting}
            />
          </div>
        </div>
      )}
    </div>
  );
}
