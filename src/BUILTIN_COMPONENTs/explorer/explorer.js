import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import AnimatedChildren from "../class/animated_children";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
import ArcSpinner from "../spinner/arc_spinner";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Constants                                                                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ROW_HEIGHT = 30;
const INDENT = 16;
const LINE_LEFT = 9;
const DRAG_THRESHOLD = 5;
const AUTO_EXPAND_DELAY = 500;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Helpers                                                                                                                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Determine node type — explicit `type` wins, otherwise infer from children. */
const getNodeType = (node) => {
  if (node.type === "folder" || node.type === "file") return node.type;
  return node.children != null ? "folder" : "file";
};

/** Collect visible items with metadata for DnD hit-testing. */
const collectVisibleItems = (keys, map, expanded, depth = 0) => {
  const items = [];
  for (const key of keys) {
    const node = map[key];
    if (!node) continue;
    const type = getNodeType(node);
    const isExpanded = !!expanded[key];
    const hasChildren = node.children && node.children.length > 0;
    items.push({ id: key, depth, type, isExpanded, hasChildren });
    if (type === "folder" && isExpanded && hasChildren) {
      items.push(
        ...collectVisibleItems(node.children, map, expanded, depth + 1),
      );
    }
  }
  return items;
};

/** Find which parent's children array contains `childKey`. Returns { parentKey, index } or null. */
const findParentInfo = (map, root, childKey) => {
  const rootIdx = root.indexOf(childKey);
  if (rootIdx !== -1) return { parentKey: null, index: rootIdx };
  for (const key of Object.keys(map)) {
    const node = map[key];
    if (node.children) {
      const idx = node.children.indexOf(childKey);
      if (idx !== -1) return { parentKey: key, index: idx };
    }
  }
  return null;
};

/** Compute depth of a key by walking up through parents. */
const findDepthFlat = (map, root, targetKey) => {
  let depth = 0;
  let cur = targetKey;
  while (!root.includes(cur)) {
    let found = false;
    for (const key of Object.keys(map)) {
      if (map[key].children?.includes(cur)) {
        depth++;
        cur = key;
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return depth;
};

/** Shallow-copy the store so we can mutate arrays safely. */
const cloneStore = ({ map, root }) => {
  const newMap = {};
  for (const [k, v] of Object.entries(map)) {
    newMap[k] = v.children ? { ...v, children: [...v.children] } : { ...v };
  }
  return { map: newMap, root: [...root] };
};

/** Check if targetId is a descendant of ancestorId. */
const isDescendantOf = (map, ancestorId, targetId) => {
  const node = map[ancestorId];
  if (!node?.children) return false;
  for (const childId of node.children) {
    if (childId === targetId) return true;
    if (isDescendantOf(map, childId, targetId)) return true;
  }
  return false;
};

/** Collect the set of visible IDs that form the highlight scope for `hoveredId`.
 *  - File → parent folder + all its visible descendants
 *  - Folder → itself + all its visible descendants */
const collectScopeIds = (hoveredId, map, root, expanded) => {
  if (!hoveredId || !map[hoveredId]) return null;
  const type = getNodeType(map[hoveredId]);

  let scopeRootId;
  if (type === "folder") {
    scopeRootId = hoveredId;
  } else {
    const parent = findParentInfo(map, root, hoveredId);
    if (!parent) return null;
    if (parent.parentKey === null) {
      /* root-level file — just highlight itself */
      return [hoveredId];
    }
    scopeRootId = parent.parentKey;
  }

  /* collect scope root + all visible descendants */
  const ids = [scopeRootId];
  const walk = (parentId) => {
    const n = map[parentId];
    if (n?.children && expanded[parentId]) {
      for (const childId of n.children) {
        if (map[childId]) {
          ids.push(childId);
          walk(childId);
        }
      }
    }
  };
  walk(scopeRootId);
  return ids;
};

/* ── DnD hit-testing helpers ────────────────────────────────────────────────────────────────────────────────────────────────── */

/** Compute AFTER target with Figma-style horizontal nesting control. */
const computeAfterTarget = (
  mouseX,
  itemIndex,
  sourceId,
  visibleItems,
  containerLeft,
) => {
  const item = visibleItems[itemIndex];

  /* find next visible item that is NOT the source */
  let nextItem = null;
  for (let j = itemIndex + 1; j < visibleItems.length; j++) {
    if (visibleItems[j].id !== sourceId) {
      nextItem = visibleItems[j];
      break;
    }
  }

  const maxDepth = item.depth;
  const minDepth = nextItem ? nextItem.depth : 0;

  if (maxDepth <= minDepth) {
    return {
      type: "after",
      targetId: item.id,
      depth: maxDepth,
      index: itemIndex,
    };
  }

  /* horizontal nesting — snap mouse-X to a valid depth */
  const relX = mouseX - containerLeft;
  const depthFromMouse = Math.round((relX - INDENT * 0.5) / INDENT);
  const targetDepth = Math.max(minDepth, Math.min(maxDepth, depthFromMouse));

  return {
    type: "after",
    targetId: item.id,
    depth: targetDepth,
    index: itemIndex,
  };
};

/** Compute the drop target given current mouse position. */
const computeDropTarget = (
  mouseX,
  mouseY,
  sourceId,
  visibleItems,
  rowRefs,
  containerLeft,
) => {
  for (let i = 0; i < visibleItems.length; i++) {
    const item = visibleItems[i];
    if (item.id === sourceId) continue;

    const el = rowRefs.get(item.id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (mouseY < rect.top || mouseY > rect.bottom) continue;

    const relY = (mouseY - rect.top) / rect.height;

    if (item.type === "folder") {
      if (item.isExpanded && item.hasChildren) {
        /* expanded folder with visible children: top 33 % → before, rest → inside */
        if (relY < 0.33) {
          return {
            type: "before",
            targetId: item.id,
            depth: item.depth,
            index: i,
          };
        }
        return {
          type: "inside",
          targetId: item.id,
          depth: item.depth + 1,
          index: i,
        };
      }
      /* collapsed / empty folder: top 25 % → before, mid 50 % → inside, bottom 25 % → after */
      if (relY < 0.25) {
        return {
          type: "before",
          targetId: item.id,
          depth: item.depth,
          index: i,
        };
      }
      if (relY < 0.75) {
        return {
          type: "inside",
          targetId: item.id,
          depth: item.depth + 1,
          index: i,
        };
      }
      return computeAfterTarget(
        mouseX,
        i,
        sourceId,
        visibleItems,
        containerLeft,
      );
    }

    /* file: top 50 % → before, bottom 50 % → after */
    if (relY < 0.5) {
      return {
        type: "before",
        targetId: item.id,
        depth: item.depth,
        index: i,
      };
    }
    return computeAfterTarget(mouseX, i, sourceId, visibleItems, containerLeft);
  }

  /* mouse below all rows → after last non-source item */
  for (let i = visibleItems.length - 1; i >= 0; i--) {
    if (visibleItems[i].id !== sourceId) {
      return computeAfterTarget(
        mouseX,
        i,
        sourceId,
        visibleItems,
        containerLeft,
      );
    }
  }

  return null;
};

/** Execute the drop and return the new { map, root } or null on failure. */
const performDrop = (store, sourceId, dropTarget, expandedRef) => {
  if (!dropTarget) return null;
  const { map, root } = cloneStore(store);

  /* prevent dropping inside own subtree */
  if (
    dropTarget.targetId === sourceId ||
    isDescendantOf(store.map, sourceId, dropTarget.targetId)
  ) {
    return null;
  }

  /* 1. remove source from its current parent */
  const srcParent = findParentInfo(map, root, sourceId);
  if (!srcParent) return null;
  if (srcParent.parentKey === null) {
    root.splice(srcParent.index, 1);
  } else {
    map[srcParent.parentKey].children.splice(srcParent.index, 1);
  }

  /* 2. insert at target position */
  if (dropTarget.type === "inside") {
    const folder = map[dropTarget.targetId];
    if (!folder.children) folder.children = [];
    if (expandedRef.current[dropTarget.targetId]) {
      folder.children.unshift(sourceId);
    } else {
      folder.children.push(sourceId);
    }
    return { map, root };
  }

  if (dropTarget.type === "before") {
    const tgt = findParentInfo(map, root, dropTarget.targetId);
    if (!tgt) return null;
    if (tgt.parentKey === null) {
      root.splice(tgt.index, 0, sourceId);
    } else {
      map[tgt.parentKey].children.splice(tgt.index, 0, sourceId);
    }
    return { map, root };
  }

  if (dropTarget.type === "after") {
    const afterId = dropTarget.targetId;
    const targetDepth = dropTarget.depth;
    const itemDepth = findDepthFlat(map, root, afterId);

    if (targetDepth === itemDepth + 1) {
      /* insert as last child of afterId (expanded folder) */
      const item = map[afterId];
      if (!item.children) item.children = [];
      item.children.push(sourceId);
    } else {
      /* walk up from afterId until we reach an ancestor at targetDepth */
      let curId = afterId;
      let curDepth = itemDepth;
      while (curDepth > targetDepth) {
        const p = findParentInfo(map, root, curId);
        if (!p || p.parentKey === null) break;
        curId = p.parentKey;
        curDepth--;
      }
      const p = findParentInfo(map, root, curId);
      if (!p) return null;
      if (p.parentKey === null) {
        root.splice(p.index + 1, 0, sourceId);
      } else {
        map[p.parentKey].children.splice(p.index + 1, 0, sourceId);
      }
    }
    return { map, root };
  }

  return null;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ExplorerRow — one row in the tree                                                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ExplorerRow = ({
  node,
  depth,
  isDark,
  colors,
  fontSize,
  isExpanded,
  onToggle,
  draggable,
  isSource,
  registerRowRef,
  onDragStart,
  onHoverRow,
  activeNodeId,
}) => {
  const isActive = !isSource && activeNodeId != null && node.id === activeNodeId;
  const isFolder = getNodeType(node) === "folder";
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [ghostRect, setGhostRect] = useState(null);
  const labelRef = useRef(null);
  const hoverTimer = useRef(null);
  const rowRef = useRef(null);

  /* ── combined ref: row element + register for DnD ──── */
  const combinedRef = useCallback(
    (el) => {
      rowRef.current = el;
      if (registerRowRef) registerRowRef(node.id, el);
    },
    [node.id, registerRowRef],
  );

  /* ── visual tokens ─────────────────────────────────── */
  const hoverBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const activeBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)";
  const showBg = (hovered || pressed) && !isSource;

  const expandIcon = node.expand_icon
    ? node.expand_icon
    : isExpanded
      ? "arrow_down"
      : "arrow_right";

  /* ── overflow tooltip ──────────────────────────────── */
  const checkOverflow = useCallback(() => {
    if (labelRef.current) {
      const el = labelRef.current;
      if (el.scrollWidth > el.clientWidth) {
        hoverTimer.current = setTimeout(() => {
          if (rowRef.current) {
            setGhostRect(rowRef.current.getBoundingClientRect());
          }
          setShowFull(true);
        }, 600);
      }
    }
  }, []);

  const clearOverflow = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setShowFull(false);
    setGhostRect(null);
  }, []);

  /* dismiss ghost on any scroll */
  useEffect(() => {
    if (!showFull) return;
    const dismiss = () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setShowFull(false);
      setGhostRect(null);
    };
    window.addEventListener("scroll", dismiss, true);
    return () => window.removeEventListener("scroll", dismiss, true);
  }, [showFull]);

  /* ── event handlers ────────────────────────────────── */
  const handleClick = useCallback(
    (e) => {
      if (isFolder) onToggle(node.id);
      if (node.on_click) node.on_click(node, e);
    },
    [isFolder, node, onToggle],
  );

  const handleDoubleClick = useCallback(
    (e) => {
      if (node.on_double_click) node.on_double_click(node, e);
    },
    [node],
  );

  const handleContextMenu = useCallback(
    (e) => {
      if (node.on_context_menu) node.on_context_menu(node, e);
    },
    [node],
  );

  const handleMouseDown = useCallback(
    (e) => {
      setPressed(true);
      if (draggable && e.button === 0 && onDragStart) {
        onDragStart(e, node.id);
      }
    },
    [draggable, node.id, onDragStart],
  );

  /* ── custom component path ─────────────────────────── */
  if (node.component) {
    return (
      <div
        ref={combinedRef}
        style={{
          paddingLeft: depth * INDENT,
          opacity: isSource ? 0 : 1,
          height: isSource ? 0 : undefined,
          overflow: isSource ? "hidden" : undefined,
          transition: "opacity 0.15s ease, height 0.15s ease",
        }}
      >
        {typeof node.component === "function"
          ? node.component({ node, depth, isExpanded })
          : node.component}
      </div>
    );
  }

  const iconSize = Math.round(fontSize * 1.15);
  const showPrefixSpinner = Boolean(
    node.is_generating ||
      (isFolder && node.has_generating_chat_descendant && !isExpanded),
  );
  const showUnreadDot = Boolean(
    !showPrefixSpinner &&
      (node.has_unread_generated_reply ||
        (isFolder && node.has_unread_generated_descendant && !isExpanded)),
  );
  const unreadDotColor = isDark
    ? "rgba(10, 186, 181, 0.92)"
    : "rgba(10, 186, 181, 0.85)";
  const hasPrefixVisual = Boolean(
    showPrefixSpinner || showUnreadDot || node.prefix_icon,
  );

  return (
    <div
      ref={combinedRef}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => {
        setHovered(true);
        checkOverflow();
        if (onHoverRow) onHoverRow(node.id);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
        clearOverflow();
      }}
      onMouseUp={() => setPressed(false)}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        height: isSource ? 0 : ROW_HEIGHT,
        opacity: isSource ? 0 : 1,
        overflow: isSource ? "hidden" : "visible",
        paddingLeft: isSource ? 0 : depth * INDENT,
        paddingRight: isSource ? 0 : 8,
        gap: 4,
        fontSize,
        fontFamily: "Jost, sans-serif",
        fontWeight: 400,
        color: colors.color,
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
        borderRadius: 5,
        transition: "opacity 0.15s ease, height 0.15s ease, padding 0.15s ease",
        ...node.style,
      }}
    >
      {/* ── active (selected) background ──────────────── */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: depth * INDENT + 3,
          right: 3,
          borderRadius: 5,
          backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
          opacity: isActive ? 1 : 0,
          transition: "opacity 0.15s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── hover / press background ─────────────────── */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: pressed ? 1 : 0,
          bottom: pressed ? 1 : 0,
          left: pressed ? depth * INDENT + 4 : depth * INDENT + 3,
          right: pressed ? 4 : 3,
          borderRadius: pressed ? 4 : 5,
          backgroundColor: pressed ? activeBg : hoverBg,
          transform: showBg ? "scale(1)" : "scale(0.97, 0)",
          opacity: showBg ? 1 : 0,
          transition: showBg
            ? "transform 0.2s cubic-bezier(0.2,0.9,0.3,1), opacity 0.15s ease, top 0.1s ease, bottom 0.1s ease, left 0.1s ease, right 0.1s ease, border-radius 0.1s ease"
            : "transform 0.18s cubic-bezier(0.4,0,1,1), opacity 0.12s ease",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── expand / collapse icon ───────────────────── */}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          flexShrink: 0,
          opacity: showFull ? 0 : isFolder ? 0.7 : 0,
          transition:
            "transform 0.2s cubic-bezier(0.32,1,0.32,1), opacity 0.15s ease",
        }}
      >
        <Icon src={expandIcon} style={{ width: 14, height: 14 }} />
      </span>

      {/* ── prefix icon / generating spinner ─────────── */}
      {hasPrefixVisual && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            opacity: showFull ? 0 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {showPrefixSpinner ? (
            <ArcSpinner
              size={iconSize}
              stroke_width={2}
              track_opacity={0.18}
            />
          ) : node.prefix_icon ? (
            <Icon
              src={node.prefix_icon}
              style={{ width: iconSize, height: iconSize }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{
                width: iconSize,
                height: iconSize,
              }}
            />
          )}
          {showUnreadDot && (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 7,
                height: 7,
                borderRadius: "50%",
                backgroundColor: unreadDotColor,
                boxShadow: isDark
                  ? "0 0 0 1px rgba(25,25,25,0.95)"
                  : "0 0 0 1px rgba(255,255,255,0.98)",
                transform: "translate(18%, -18%)",
              }}
            />
          )}
        </span>
      )}

      {/* ── prefix text ──────────────────────────────── */}
      {node.prefix && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            flexShrink: 0,
            opacity: showFull ? 0 : 0.5,
            fontSize: fontSize - 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {node.prefix}
        </span>
      )}

      {/* ── label ────────────────────────────────────── */}
      <span
        ref={labelRef}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          opacity: showFull ? 0 : 1,
          transition: "opacity 0.15s ease",
        }}
      >
        {node.label}
      </span>

      {/* ── postfix text ─────────────────────────────── */}
      {node.postfix && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            flexShrink: 0,
            opacity: showFull ? 0 : 0.4,
            fontSize: fontSize - 1,
            transition: "opacity 0.15s ease",
          }}
        >
          {node.postfix}
        </span>
      )}

      {/* ── postfix icon ─────────────────────────────── */}
      {node.postfix_icon && (
        <span
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            opacity: showFull ? 0 : 1,
            transition: "opacity 0.15s ease",
          }}
        >
          <Icon
            src={node.postfix_icon}
            style={{ width: iconSize, height: iconSize }}
          />
        </span>
      )}

      {/* ── ghost overlay for truncated labels ───────── */}
      {showFull &&
        ghostRect &&
        ReactDOM.createPortal(
          <div
            style={{
              position: "fixed",
              top: ghostRect.top,
              left: ghostRect.left,
              right: window.innerWidth - ghostRect.right,
              height: ghostRect.height,
              display: "flex",
              alignItems: "center",
              paddingLeft: depth * INDENT,
              paddingRight: 8,
              gap: 4,
              fontSize,
              fontFamily: "Jost, sans-serif",
              fontWeight: 400,
              color: colors.color,
              borderRadius: 5,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 18,
                height: 18,
                flexShrink: 0,
                opacity: isFolder ? 0.7 : 0,
              }}
            >
              <Icon src={expandIcon} style={{ width: 14, height: 14 }} />
            </span>
            {hasPrefixVisual && (
              <span
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {showPrefixSpinner ? (
                  <ArcSpinner
                    size={iconSize}
                    stroke_width={2}
                    track_opacity={0.18}
                  />
                ) : node.prefix_icon ? (
                  <Icon
                    src={node.prefix_icon}
                    style={{ width: iconSize, height: iconSize }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      width: iconSize,
                      height: iconSize,
                    }}
                  />
                )}
                {showUnreadDot && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: unreadDotColor,
                      boxShadow: isDark
                        ? "0 0 0 1px rgba(25,25,25,0.95)"
                        : "0 0 0 1px rgba(255,255,255,0.98)",
                      transform: "translate(18%, -18%)",
                    }}
                  />
                )}
              </span>
            )}
            {node.prefix && (
              <span
                style={{
                  flexShrink: 0,
                  opacity: 0.5,
                  fontSize: fontSize - 1,
                }}
              >
                {node.prefix}
              </span>
            )}
            <span>{node.label}</span>
            {node.postfix && (
              <span
                style={{
                  flexShrink: 0,
                  opacity: 0.4,
                  fontSize: fontSize - 1,
                }}
              >
                {node.postfix}
              </span>
            )}
            {node.postfix_icon && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon
                  src={node.postfix_icon}
                  style={{ width: iconSize, height: iconSize }}
                />
              </span>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ExplorerBranch — recursively renders tree nodes with level indicator lines                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ExplorerBranch = ({
  childKeys,
  nodeMap,
  depth,
  isDark,
  colors,
  fontSize,
  expanded,
  onToggle,
  draggable,
  isDragging,
  sourceId,
  registerRowRef,
  onDragStart,
  onHoverRow,
  activeNodeId,
}) => {
  return childKeys.map((key) => {
    const data = nodeMap[key];
    if (!data) return null;
    const node = { id: key, ...data };
    const type = getNodeType(data);
    const isFolder = type === "folder";
    const hasChildren = data.children && data.children.length > 0;
    const isOpen = !!expanded[key];
    const isSource = isDragging && sourceId === key;

    return (
      <React.Fragment key={key}>
        <ExplorerRow
          node={node}
          depth={depth}
          isDark={isDark}
          colors={colors}
          fontSize={fontSize}
          isExpanded={isOpen}
          onToggle={onToggle}
          draggable={draggable}
          isSource={isSource}
          registerRowRef={registerRowRef}
          onDragStart={onDragStart}
          onHoverRow={onHoverRow}
          activeNodeId={activeNodeId}
        />
        {isFolder && (
          <AnimatedChildren open={isOpen} skipAnimation={isDragging}>
            <div style={{ position: "relative" }}>
              {hasChildren && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: depth * INDENT + LINE_LEFT,
                    width: 1,
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(0,0,0,0.08)",
                    borderRadius: 1,
                    pointerEvents: "none",
                    zIndex: 0,
                  }}
                />
              )}
              {hasChildren && (
                <ExplorerBranch
                  childKeys={data.children}
                  nodeMap={nodeMap}
                  depth={depth + 1}
                  isDark={isDark}
                  colors={colors}
                  fontSize={fontSize}
                  expanded={expanded}
                  onToggle={onToggle}
                  draggable={draggable}
                  isDragging={isDragging}
                  sourceId={sourceId}
                  registerRowRef={registerRowRef}
                  onDragStart={onDragStart}
                  onHoverRow={onHoverRow}
                  activeNodeId={activeNodeId}
                />
              )}
            </div>
          </AnimatedChildren>
        )}
      </React.Fragment>
    );
  });
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  DropIndicator — Figma-style line or folder highlight                                                                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DropIndicator = ({ dropTarget, rowRefs, containerRef, isDark }) => {
  if (!dropTarget || !containerRef.current) return null;

  const containerRect = containerRef.current.getBoundingClientRect();
  const targetEl = rowRefs.current.get(dropTarget.targetId);
  if (!targetEl) return null;
  const targetRect = targetEl.getBoundingClientRect();

  const accent = isDark
    ? "rgba(10, 186, 181, 0.85)"
    : "rgba(10, 186, 181, 0.75)";

  /* ── folder highlight (drop-inside) ────────────────── */
  if (dropTarget.type === "inside") {
    const top = targetRect.top - containerRect.top;
    const folderDepth = (dropTarget.depth ?? 1) - 1;
    return (
      <div
        style={{
          position: "absolute",
          top,
          left: folderDepth * INDENT + 3,
          right: 3,
          height: targetRect.height,
          backgroundColor: isDark
            ? "rgba(10, 186, 181, 0.12)"
            : "rgba(10, 186, 181, 0.09)",
          borderRadius: 5,
          pointerEvents: "none",
          zIndex: 10,
        }}
      />
    );
  }

  /* ── line indicator (before / after) ───────────────── */
  const lineY =
    dropTarget.type === "before"
      ? targetRect.top - containerRect.top
      : targetRect.bottom - containerRect.top;
  const indentLeft = (dropTarget.depth ?? 0) * INDENT + LINE_LEFT;

  return (
    <>
      {/* circle at line start */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: lineY - 3,
          left: indentLeft - 3,
          width: 6,
          height: 6,
          borderRadius: "50%",
          backgroundColor: accent,
          pointerEvents: "none",
          zIndex: 11,
          boxShadow: isDark
            ? "0 0 4px rgba(10,186,181,0.4)"
            : "0 0 3px rgba(10,186,181,0.25)",
        }}
      />
      {/* line */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: lineY - 1,
          left: indentLeft,
          right: 8,
          height: 2,
          borderRadius: 1,
          backgroundColor: accent,
          pointerEvents: "none",
          zIndex: 10,
          boxShadow: isDark
            ? "0 0 4px rgba(10,186,181,0.35)"
            : "0 0 3px rgba(10,186,181,0.2)",
        }}
      />
    </>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  BackgroundIndicator — scope highlight with smooth animation                                                                 */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const BackgroundIndicator = React.memo(
  ({ top, height, left, visible, isDark }) => {
    const elRef = useRef(null);
    const wasVisibleRef = useRef(false);

    useEffect(() => {
      const el = elRef.current;
      if (!el) return;

      if (!visible) {
        el.style.opacity = "0";
        wasVisibleRef.current = false;
        return;
      }

      if (!wasVisibleRef.current) {
        /* first appearance — jump to position, fade in */
        el.style.transition = "opacity 0.2s ease";
        el.style.top = `${top}px`;
        el.style.height = `${height}px`;
        el.style.left = `${left}px`;
        /* force reflow so position is applied before opacity changes */
        el.getBoundingClientRect();
        el.style.opacity = "1";
        /* re-enable position transitions on next frame */
        requestAnimationFrame(() => {
          if (elRef.current) {
            elRef.current.style.transition =
              "top 0.22s cubic-bezier(0.25, 1, 0.5, 1), " +
              "height 0.22s cubic-bezier(0.25, 1, 0.5, 1), " +
              "left 0.22s cubic-bezier(0.25, 1, 0.5, 1), " +
              "opacity 0.18s ease";
          }
        });
        wasVisibleRef.current = true;
      } else {
        /* already visible — smoothly animate to new position */
        el.style.top = `${top}px`;
        el.style.height = `${height}px`;
        el.style.left = `${left}px`;
      }
    }, [top, height, left, visible]);

    return (
      <div
        ref={elRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 4,
          right: 0,
          top: 0,
          height: 0,
          opacity: 0,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.035)"
            : "rgba(0,0,0,0.022)",
          borderRadius: 7,
          pointerEvents: "none",
          zIndex: 0,
          willChange: "top, height, left, opacity",
        }}
      />
    );
  },
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Explorer — the main container with custom Figma-style DnD                                                                   */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const Explorer = ({
  data = {},
  root: rootProp = [],
  default_expanded,
  draggable = false,
  on_reorder,
  style,
  active_node_id,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  /* ── flat store: { map, root } ─────────────────────── */
  const [store, setStore] = useState(() => ({
    map: { ...data },
    root: [...rootProp],
  }));
  useEffect(() => {
    setStore({ map: { ...data }, root: [...rootProp] });
  }, [data, rootProp]);

  /* ── expanded state ────────────────────────────────── */
  const [expanded, setExpanded] = useState(() => {
    if (default_expanded === true) {
      const all = {};
      for (const [key, node] of Object.entries(data)) {
        if (getNodeType(node) === "folder") all[key] = true;
      }
      return all;
    }
    if (Array.isArray(default_expanded)) {
      return Object.fromEntries(default_expanded.map((id) => [id, true]));
    }
    return {};
  });

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  /* ── sizing / colors ───────────────────────────────── */
  const fontSize = style?.fontSize ?? 14;
  const containerWidth = style?.width ?? 260;
  const colors = useMemo(() => {
    const bg = theme?.backgroundColor ?? (isDark ? "#1E1E1E" : "#FFFFFF");
    const color = theme?.color ?? (isDark ? "#CCC" : "#222");
    return { bg, color };
  }, [isDark, theme]);

  /* ── refs ───────────────────────────────────────────── */
  const containerRef = useRef(null);
  const rowRefsMap = useRef(new Map());
  const ghostRef = useRef(null);

  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const storeRef = useRef(store);
  storeRef.current = store;
  const onReorderRef = useRef(on_reorder);
  onReorderRef.current = on_reorder;

  const registerRowRef = useCallback((id, el) => {
    if (el) rowRefsMap.current.set(id, el);
    else rowRefsMap.current.delete(id);
  }, []);

  /* ── visible items ─────────────────────────────────── */
  const visibleItems = useMemo(
    () => collectVisibleItems(store.root, store.map, expanded),
    [store, expanded],
  );
  const visibleItemsRef = useRef(visibleItems);
  visibleItemsRef.current = visibleItems;

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  /*  Custom drag-and-drop state machine                   */
  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  const [dragState, setDragState] = useState({
    isDragging: false,
    sourceId: null,
    dropTarget: null,
  });

  const dragInternals = useRef({
    phase: "idle", // "idle" | "pending" | "dragging"
    sourceId: null,
    startX: 0,
    startY: 0,
    collapsedOnDrag: null,
  });

  const dropTargetRef = useRef(null);
  const autoExpandTimer = useRef(null);
  const autoExpandTargetRef = useRef(null);

  /* ── hover indicator state ─────────────────────────── */
  const [hoveredId, setHoveredId] = useState(null);
  const [indicator, setIndicator] = useState({
    top: 0,
    height: 0,
    left: 4,
    visible: false,
  });

  const handleHoverRow = useCallback((id) => {
    setHoveredId(id);
  }, []);

  /* recompute indicator position when hover / structure changes */
  useEffect(() => {
    if (!hoveredId || dragState.isDragging) {
      setIndicator((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
      return;
    }

    const scopeIds = collectScopeIds(
      hoveredId,
      store.map,
      store.root,
      expanded,
    );
    if (!scopeIds || scopeIds.length === 0) {
      setIndicator((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
      return;
    }

    /* compute scope root depth for left indent */
    const scopeRootId = scopeIds[0];
    const scopeDepth = findDepthFlat(store.map, store.root, scopeRootId);
    const scopeLeft = scopeDepth * INDENT;

    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    let minTop = Infinity;
    let maxBottom = -Infinity;

    for (const id of scopeIds) {
      const el = rowRefsMap.current.get(id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) continue;
      if (rect.top < minTop) minTop = rect.top;
      if (rect.bottom > maxBottom) maxBottom = rect.bottom;
    }

    if (minTop === Infinity) {
      setIndicator((prev) =>
        prev.visible ? { ...prev, visible: false } : prev,
      );
      return;
    }

    setIndicator({
      top: minTop - containerRect.top - 3,
      height: maxBottom - minTop + 6,
      left: scopeLeft,
      visible: true,
    });
  }, [hoveredId, store, expanded, dragState.isDragging]);

  /* ── clear auto-expand timer ─────────────────────────── */
  const clearAutoExpand = useCallback(() => {
    if (autoExpandTimer.current) {
      clearTimeout(autoExpandTimer.current);
      autoExpandTimer.current = null;
    }
    autoExpandTargetRef.current = null;
  }, []);

  /* ── row mousedown: enter "pending" phase ────────────── */
  const handleRowDragStart = useCallback((e, id) => {
    dragInternals.current = {
      phase: "pending",
      sourceId: id,
      startX: e.clientX,
      startY: e.clientY,
      collapsedOnDrag: null,
    };
  }, []);

  /* ── begin actual drag (threshold exceeded) ──────────── */
  const beginDrag = useCallback((sourceId) => {
    dragInternals.current.phase = "dragging";

    /* collapse the dragged folder */
    const node = storeRef.current.map[sourceId];
    if (getNodeType(node) === "folder" && expandedRef.current[sourceId]) {
      dragInternals.current.collapsedOnDrag = sourceId;
      setExpanded((prev) => ({ ...prev, [sourceId]: false }));
    }

    setDragState({ isDragging: true, sourceId, dropTarget: null });

    /* set drag cursor and prevent text selection */
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    document.body.style.WebkitUserSelect = "none";
  }, []);

  /* ── update drag (every mousemove) ───────────────────── */
  const updateDrag = useCallback(
    (clientX, clientY) => {
      /* position ghost via ref (avoids re-render) */
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${clientX + 16}px, ${clientY - ROW_HEIGHT / 2}px)`;
      }

      /* compute drop target */
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const target = computeDropTarget(
        clientX,
        clientY,
        dragInternals.current.sourceId,
        visibleItemsRef.current,
        rowRefsMap.current,
        containerRect.left,
      );

      /* validate: no self-drop or drop into own subtree */
      if (
        target &&
        (target.targetId === dragInternals.current.sourceId ||
          isDescendantOf(
            storeRef.current.map,
            dragInternals.current.sourceId,
            target.targetId,
          ))
      ) {
        dropTargetRef.current = null;
        setDragState((prev) => ({ ...prev, dropTarget: null }));
        clearAutoExpand();
        return;
      }

      dropTargetRef.current = target;
      setDragState((prev) => ({ ...prev, dropTarget: target }));

      /* auto-expand folders on sustained hover */
      if (target && target.type === "inside") {
        const folderId = target.targetId;
        if (
          autoExpandTargetRef.current !== folderId &&
          !expandedRef.current[folderId]
        ) {
          clearAutoExpand();
          autoExpandTargetRef.current = folderId;
          autoExpandTimer.current = setTimeout(() => {
            setExpanded((prev) => ({ ...prev, [folderId]: true }));
            autoExpandTargetRef.current = null;
          }, AUTO_EXPAND_DELAY);
        }
      } else {
        clearAutoExpand();
      }
    },
    [clearAutoExpand],
  );

  /* ── end drag ────────────────────────────────────────── */
  const endDrag = useCallback(
    (perform = true) => {
      clearAutoExpand();

      const { sourceId, collapsedOnDrag } = dragInternals.current;
      const currentDropTarget = dropTargetRef.current;

      if (perform && currentDropTarget && sourceId) {
        const result = performDrop(
          storeRef.current,
          sourceId,
          currentDropTarget,
          expandedRef,
        );
        if (result) {
          setStore(result);
          if (onReorderRef.current)
            onReorderRef.current(result.map, result.root);

          /* auto-expand folder when dropped inside */
          if (currentDropTarget.type === "inside") {
            setExpanded((prev) => ({
              ...prev,
              [currentDropTarget.targetId]: true,
            }));
          }
        }
      }

      /* restore collapsed folder */
      if (collapsedOnDrag) {
        setExpanded((prev) => ({ ...prev, [collapsedOnDrag]: true }));
      }

      /* reset everything */
      dragInternals.current = {
        phase: "idle",
        sourceId: null,
        startX: 0,
        startY: 0,
        collapsedOnDrag: null,
      };
      dropTargetRef.current = null;
      setDragState({ isDragging: false, sourceId: null, dropTarget: null });

      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.WebkitUserSelect = "";
    },
    [clearAutoExpand],
  );

  /* ── global mouse / key listeners ────────────────────── */
  useEffect(() => {
    if (!draggable) return;

    const handleMouseMove = (e) => {
      const d = dragInternals.current;
      if (d.phase === "pending") {
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
          beginDrag(d.sourceId);
          /* position ghost on the very first frame */
          requestAnimationFrame(() => {
            if (ghostRef.current) {
              ghostRef.current.style.transform = `translate(${e.clientX + 16}px, ${e.clientY - ROW_HEIGHT / 2}px)`;
            }
          });
        }
      } else if (d.phase === "dragging") {
        updateDrag(e.clientX, e.clientY);
      }
    };

    const handleMouseUp = () => {
      const d = dragInternals.current;
      if (d.phase === "dragging") {
        endDrag(true);
      } else if (d.phase === "pending") {
        dragInternals.current.phase = "idle";
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && dragInternals.current.phase === "dragging") {
        endDrag(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [draggable, beginDrag, updateDrag, endDrag]);

  /* ── drag ghost data ───────────────────────────────── */
  const sourceNode = useMemo(
    () =>
      dragState.sourceId
        ? { id: dragState.sourceId, ...store.map[dragState.sourceId] }
        : null,
    [dragState.sourceId, store.map],
  );
  const overlayIconSize = Math.round(fontSize * 1.15);

  /* callback ref: set initial ghost position on mount */
  const ghostCallbackRef = useCallback((el) => {
    ghostRef.current = el;
    if (el && dragInternals.current.phase === "dragging") {
      const x = dragInternals.current.startX + 16;
      const y = dragInternals.current.startY - ROW_HEIGHT / 2;
      el.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, []);

  /* ── render ────────────────────────────────────────── */
  return (
    <div
      ref={containerRef}
      onMouseLeave={() => {
        if (!dragState.isDragging) setHoveredId(null);
      }}
      style={{
        position: "relative",
        width: containerWidth,
        minHeight: 40,
        padding: "4px 0",
        fontFamily: "Jost, sans-serif",
        overflow: "hidden",
        /* disable pointer events on tree during drag to prevent accidental clicks */
        pointerEvents: dragState.isDragging ? "none" : undefined,
        ...style,
      }}
    >
      {/* ── scope highlight indicator ────────────────── */}
      <BackgroundIndicator
        top={indicator.top}
        height={indicator.height}
        left={indicator.left}
        visible={indicator.visible}
        isDark={isDark}
      />

      <ExplorerBranch
        childKeys={store.root}
        nodeMap={store.map}
        depth={0}
        isDark={isDark}
        colors={colors}
        fontSize={fontSize}
        expanded={expanded}
        onToggle={toggleExpand}
        draggable={draggable}
        isDragging={dragState.isDragging}
        sourceId={dragState.sourceId}
        registerRowRef={registerRowRef}
        onDragStart={handleRowDragStart}
        onHoverRow={handleHoverRow}
        activeNodeId={active_node_id}
      />

      {/* ── drop indicator ──────────────────────────── */}
      {dragState.isDragging && dragState.dropTarget && (
        <DropIndicator
          dropTarget={dragState.dropTarget}
          rowRefs={rowRefsMap}
          containerRef={containerRef}
          isDark={isDark}
        />
      )}

      {/* ── drag ghost (portal to body) ─────────────── */}
      {dragState.isDragging &&
        sourceNode &&
        ReactDOM.createPortal(
          <div
            ref={ghostCallbackRef}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              display: "flex",
              alignItems: "center",
              height: ROW_HEIGHT,
              paddingLeft: 8,
              paddingRight: 12,
              gap: 4,
              fontSize,
              fontFamily: "Jost, sans-serif",
              fontWeight: 400,
              color: colors.color,
              backgroundColor: colors.bg,
              borderRadius: 5,
              boxShadow: isDark
                ? "0 4px 16px rgba(0,0,0,0.5)"
                : "0 4px 16px rgba(0,0,0,0.12)",
              opacity: 0.92,
              whiteSpace: "nowrap",
              cursor: "grabbing",
              pointerEvents: "none",
              zIndex: 999999,
              willChange: "transform",
            }}
          >
            {getNodeType(sourceNode) === "folder" && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  opacity: 0.7,
                }}
              >
                <Icon src="arrow_right" style={{ width: 14, height: 14 }} />
              </span>
            )}
            {sourceNode.prefix_icon && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon
                  src={sourceNode.prefix_icon}
                  style={{
                    width: overlayIconSize,
                    height: overlayIconSize,
                  }}
                />
              </span>
            )}
            {sourceNode.prefix && (
              <span
                style={{
                  opacity: 0.5,
                  fontSize: fontSize - 1,
                  flexShrink: 0,
                }}
              >
                {sourceNode.prefix}
              </span>
            )}
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sourceNode.label}
            </span>
            {sourceNode.postfix && (
              <span
                style={{
                  opacity: 0.4,
                  fontSize: fontSize - 1,
                  flexShrink: 0,
                }}
              >
                {sourceNode.postfix}
              </span>
            )}
            {sourceNode.postfix_icon && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon
                  src={sourceNode.postfix_icon}
                  style={{
                    width: overlayIconSize,
                    height: overlayIconSize,
                  }}
                />
              </span>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

export { Explorer as default, Explorer };
