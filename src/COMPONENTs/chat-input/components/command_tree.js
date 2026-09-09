/**
 * CommandTree — the ONE renderer for the slash-command surface (issue #232).
 *
 * The palette (`/` in the composer) and the skill organizer's preview are the
 * same picture: the organizer's whole premise is that what you arrange is what
 * you get when you next press `/`. Two renderers that agree on the day they
 * are written is exactly the drift that premise cannot survive, so both mount
 * this component and neither draws a row of its own.
 *
 * Built on BUILTIN_COMPONENTs/explorer:
 * - command rows come from CommandRow via `node.component`, so the palette's
 *   icon / name / description / source-tag layout is untouched;
 * - folder rows use Explorer's own row, which is where the chevron, the
 *   indent guides and the drag affordances already live;
 * - `row_hover={false}` drops Explorer's per-row wash AND its scope box (they
 *   are one switch), and `render_highlight` puts SlidingHighlight back — the
 *   palette keeps the gliding pill it has always had.
 *
 * Selection is not owned here: the palette drives `activeIndex` from the
 * keyboard, the organizer leaves it at -1, and the visible order is reported
 * back through `onVisibleChange` so the caller can step through it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Explorer from "../../../BUILTIN_COMPONENTs/explorer/explorer";
import SlidingHighlight from "../../../BUILTIN_COMPONENTs/class/sliding_highlight";
import CommandRow, { BARE_ROW_HEIGHT, ROW_HEIGHT } from "./command_row";

const FOLDER_NODE_PREFIX = "folder:";
const MAX_STAGGER_ROWS = 6;

export const isFolderNodeId = (nodeId) =>
  typeof nodeId === "string" && nodeId.startsWith(FOLDER_NODE_PREFIX);

/**
 * The row order assuming every folder is open. Explorer owns the real one
 * (folders collapse), but its answer only arrives after a commit, and the
 * first paint already needs to know which row is selected. Both agree exactly
 * while nothing is collapsed, which is the state the palette opens in; once
 * Explorer reports, its answer wins.
 */
const walkAllRows = (data, ids, out = []) => {
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    const node = data[id];
    if (!node) return;
    out.push(id);
    if (node.children && node.children.length) {
      walkAllRows(data, node.children, out);
    }
  });
  return out;
};

const sameOrder = (a, b) =>
  !!a && !!b && a.length === b.length && a.every((id, i) => id === b[i]);

const CommandTree = ({
  data = {},
  root = [],
  activeIndex = -1,
  onPick = () => {},
  onHover = null,
  onVisibleChange = null,
  isDark = false,
  bare = false,
  visible = true,
  width = 280,
  expandRef = null,
  draggable = false,
  onReorder = null,
  externalDrag = null,
  onExternalDrop = null,
  onFolderContextMenu = null,
  defaultExpanded = true,
}) => {
  const rowHeight = bare ? BARE_ROW_HEIGHT : ROW_HEIGHT;
  const rowRadius = bare ? 14 : 7;

  /* Explorer's authoritative visible order, once it has rendered at least
     once. Null until then — see walkAllRows above. */
  const [reportedIds, setReportedIds] = useState(null);
  const provisionalIds = useMemo(
    () => walkAllRows(data, root),
    [data, root],
  );
  const visibleIds = useMemo(() => {
    if (!reportedIds) return provisionalIds;
    /* A data change lands here before Explorer re-reports, so fall back to the
       provisional walk whenever the reported list no longer describes this
       tree. */
    const known = new Set(provisionalIds);
    return reportedIds.every((id) => known.has(id))
      ? reportedIds
      : provisionalIds;
  }, [reportedIds, provisionalIds]);

  const activeNodeId =
    activeIndex >= 0 && activeIndex < visibleIds.length
      ? visibleIds[activeIndex]
      : null;

  /* Report upward after the commit — publishing from inside render_highlight
     would be a setState in Explorer's render pass. */
  const pendingIdsRef = useRef(null);
  const onVisibleChangeRef = useRef(onVisibleChange);
  onVisibleChangeRef.current = onVisibleChange;
  useEffect(() => {
    const next = pendingIdsRef.current;
    if (!next || sameOrder(next, reportedIds)) return;
    setReportedIds(next);
    if (onVisibleChangeRef.current) onVisibleChangeRef.current(next);
  });

  const renderHighlight = useCallback(
    ({ rowRefs, visibleIds: explorerIds }) => {
      pendingIdsRef.current = explorerIds;
      const index = activeNodeId ? explorerIds.indexOf(activeNodeId) : -1;
      if (index < 0) return null;
      return (
        <SlidingHighlight
          refs={rowRefs}
          index={index}
          color={
            isDark
              ? "rgba(var(--pupu-text-rgb),0.10)"
              : "rgba(var(--pupu-text-rgb),0.06)"
          }
          borderRadius={rowRadius}
          measureKey={`${explorerIds.length}|${explorerIds[0] ?? ""}|${visible}`}
        />
      );
    },
    [activeNodeId, isDark, rowRadius, visible],
  );

  /* Decorate the projection with what is presentation rather than data: the
     command rows' component and the folder rows' context menu. `data` itself
     stays the pure output of buildCommandTree. */
  const decorated = useMemo(() => {
    const out = {};
    /* Entrance delay follows the data walk, not the visible order: it only
       drives the Elevator Push cascade, and a collapsed folder quietly
       consuming a delay slot is invisible. */
    const staggerOrder = walkAllRows(data, root);
    Object.entries(data).forEach(([nodeId, node]) => {
      if (node.kind === "folder") {
        out[nodeId] = {
          ...node,
          on_context_menu: onFolderContextMenu || undefined,
        };
        return;
      }
      const stagger = Math.max(0, staggerOrder.indexOf(nodeId));
      out[nodeId] = {
        ...node,
        /* `isActive` comes from Explorer's own active_node_id plumbing, which
           its row memo already special-cases. Baking the active id into the
           node data instead would hand Explorer a new `data` object on every
           arrow key, and Explorer re-syncs its whole store from that prop. */
        component: ({ node: rowNode, isActive }) => (
          <CommandRow
            item={rowNode.command}
            active={!!isActive}
            isDark={isDark}
            onPick={onPick}
            onHover={onHover ? () => onHover(rowNode.id) : null}
            rowRadius={rowRadius}
            rowHeight={rowHeight}
            entrance={
              bare
                ? {
                    visible,
                    delayMs: 130 + Math.min(stagger, MAX_STAGGER_ROWS) * 35,
                  }
                : null
            }
          />
        ),
      };
    });
    return out;
  }, [
    data,
    root,
    isDark,
    onPick,
    onHover,
    onFolderContextMenu,
    rowRadius,
    rowHeight,
    bare,
    visible,
  ]);

  return (
    <Explorer
      data={decorated}
      root={root}
      style={{ width, fontSize: 13 }}
      row_height={rowHeight}
      row_radius={rowRadius}
      row_hover={false}
      active_node_id={activeNodeId}
      default_expanded={defaultExpanded}
      draggable={draggable}
      on_reorder={onReorder || undefined}
      external_drag={externalDrag}
      on_external_drop={onExternalDrop || undefined}
      render_highlight={renderHighlight}
      expand_ref={expandRef}
    />
  );
};

export default CommandTree;
