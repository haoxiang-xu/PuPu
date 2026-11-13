import { agentEnglishText } from "./agents_i18n";
import { embedded_document, FRAME } from "./skeleton_drill";

/* The open graph and the drill path to it, as the side menu's breadcrumb
 * shows them: one segment per graph, each the graph's icon and its name. With
 * nothing drilled it is the one Agent or Workflow open, which leads nowhere.
 *
 * Built from the editor's own crumbs, so the side menu walks back through the
 * same navigation the editor uses. The crumbs that only name where a step
 * happened (`Subagent Pool`, a Workflow Call) are not places and are left
 * out; what stays is every graph left behind, which a click goes back to, and
 * the one on screen, which is where you are and leads nowhere. */
export function drill_trail_segments(crumbs, level_icon, last_icon, t = agentEnglishText) {
  const list = Array.isArray(crumbs) ? crumbs : [];
  const last = list.length - 1;
  return list
    .filter((crumb, index) => crumb && (crumb.navigable || index === last))
    .map((crumb, index, kept) => {
      const here = index === kept.length - 1;
      const label = typeof crumb.label === "string" ? crumb.label : String(crumb.label ?? "");
      const navigable = Boolean(crumb.navigable) && !here;
      const icon = navigable
        ? (typeof level_icon === "function" ? level_icon(crumb.depth) : null)
        : last_icon;
      return {
        key: `drill-${index}`,
        label,
        depth: navigable ? crumb.depth : null,
        ...(icon || { icon: "bot" }),
        ...(navigable ? { ariaLabel: t("agents.editor.back_to", { label }) } : null),
      };
    });
}

/* A graph's mark: a Workflow's flow glyph, an Agent resource's own icon, and
   the plain bot for an Agent embedded in its parent. */
export function graph_icon(document, embedded) {
  const record = document !== null && typeof document === "object" && !Array.isArray(document)
    ? document
    : null;
  if (record && record.kind === "workflow") return { icon: "workflow" };
  if (embedded) return { icon: "bot" };
  const presentation = record && record.presentation !== null && typeof record.presentation === "object"
    ? record.presentation
    : null;
  return { presentation };
}

/* The graph each drill level shows, for its icon.
 *
 * A frame is the graph left behind: the resource session it belonged to, and
 * the steps inside that resource that reached it. The session is the one the
 * next resource step stashed, or the live one when the editor has not left
 * that resource since. */
export function drill_level_icon(stack, live_session, depth) {
  const frames = Array.isArray(stack) ? stack : [];
  const frame = frames[depth];
  if (!frame) return { icon: "bot" };
  let session = live_session;
  for (let index = depth; index < frames.length; index += 1) {
    if (frames[index] && frames[index].kind === FRAME.RESOURCE && frames[index].session) {
      session = frames[index].session;
      break;
    }
  }
  const steps = Array.isArray(frame.steps) ? frame.steps : [];
  const root = session ? session.document : null;
  if (steps.length === 0) return graph_icon(root, false);
  let graph = null;
  try {
    graph = embedded_document(root, steps, session ? session.document_revision : undefined);
  } catch (_) {
    graph = null;
  }
  return graph ? graph_icon(graph, true) : { icon: "bot" };
}
