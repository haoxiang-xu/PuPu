import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../BUILTIN_COMPONENTs/input/button";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Services } -------------------------------------------------------------------------------------------------------------- */
import {
  MEMORY_V2_TREE_STATES,
  MEMORY_V2_TREE_DISABLED_REASONS,
  MEMORY_V2_PREVIEW_STATES,
  defaultExpandedPaths,
  emptyMemoryV2Preview,
  emptyMemoryV2TreeResult,
  flattenMemoryV2Tree,
  loadMemoryV2EntryPreview,
  loadMemoryV2TreeState,
} from "../../SERVICEs/memory_v2_tree_state";
/* { Services } -------------------------------------------------------------------------------------------------------------- */

/* { Hooks } ----------------------------------------------------------------------------------------------------------------- */
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
/* { Hooks } ----------------------------------------------------------------------------------------------------------------- */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Memory V2 tree view — two floating panels over the vector scatter      */
/*                                                                         */
/*  It is deliberately NOT a scatter: V2 retrieval is purely lexical        */
/*  (FTS5), so any 2-D projection would be an embedding computed for the    */
/*  picture alone, with no causal link to what actually gets recalled. The  */
/*  author-written path hierarchy is ground truth the store already has.    */
/*                                                                         */
/*  REVISION 1 (case 0000-0010-2026-0810) replaced the vector/tree tab      */
/*  switch with this: the scatter is now permanently the background and     */
/*  never gets switched away from. The tree is a floating left side menu    */
/*  and a selected entry opens a floating right detail panel — the same     */
/*  overlay grammar as the agent builder's recipe list + inspector          */
/*  (COMPONENTs/agents/pages/recipes_page.js), with rows built to the       */
/*  BUILTIN explorer's metrics so the two read as one family.              */
/*                                                                         */
/*  This component holds NO judgment about whether V2 is on, empty or       */
/*  broken, nor about whether an entry has showable content. It switches    */
/*  over frozen enums produced by SERVICEs/memory_v2_tree_state.js.         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── Overlay geometry ────────────────────────────────────────────────
   The left panel is now the reference rect verbatim: recipes_page's
   overlayPanel is top:6 / left:6 / bottom:6, and so is this.

   REVISION 2 removed the two deviations REVISION 1 had argued for:

   The old top:72 existed to duck under the inspector's own "Memory" + chat
   title header. REVISION 2 deletes that header outright, so there is nothing
   left to duck under and the panel starts at the inset like the reference.

   The old bottom:96 existed to clear the scatter's PC/jitter control bar
   (bottom:16, centred). Running to bottom:6 does reintroduce a possible
   overlap, and that is a deliberate, CEO-sanctioned trade: the bar is
   centred in a 920px modal while this panel ends at x=242, so anything the
   panel covers is the bar's LEFT END and nothing else, and the collapse
   button one row up is the escape hatch — exactly how the agent builder's
   recipe list relates to the canvas it floats over. Painting order carries
   it: this component is the modal's last child at the same z-index 3, so it
   wins over the bar without either side reaching into the other's state.

   The RIGHT panel keeps bottom:96 on purpose and is NOT a leftover. It has
   to stay rect-identical to the vector detail card it sits on top of
   (top:6 / right:6 / bottom:96 / width:320) — unequal rects would let the
   card's edge peek out from behind it. See DETAIL_BOTTOM. */
const PANEL_INSET = 6;
const DETAIL_BOTTOM = 96;
const SIDE_MENU_WIDTH = 236;
/* Matches the vector detail card's width exactly. Both right-hand panels can
   be open at once (a scatter point AND a tree entry selected); equal rects
   mean this one covers that one with no edge peeking out. */
const DETAIL_WIDTH = 320;
/* recipes_page.js parks its expand handle at top:14 / left:14 (its `expandTop`
   is 14 whenever there is no macOS traffic-light padding — and inside a modal
   there never is). */
const EXPAND_HANDLE_INSET = 14;

const PANEL_TRANSITION =
  "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)";

/* ── Row metrics — BUILTIN_COMPONENTs/explorer/explorer.js ────────────
   Copied rather than imported: Explorer is built for drag-to-reorder trees
   and brings a DnD machine this read-only view has no use for. What has to
   match is the look, and these three numbers plus the two backgrounds below
   are the look. */
const ROW_HEIGHT = 30;
const INDENT = 16;
const ROW_RADIUS = 5;

const KIND_ICONS = Object.freeze({
  folder: "folder",
  folder_open: "folder_open",
  file: "draft",
  link: "link",
});

const formatBytes = (bytes) => {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTimestamp = (ms) => {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
};

const MONO = "Menlo, Monaco, Consolas, monospace";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Shared overlay chrome                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const overlayPanelStyle = (isDark) => ({
  position: "absolute",
  zIndex: 3,
  borderRadius: 10,
  backgroundColor: isDark ? "rgba(20, 20, 20, 0.72)" : "rgba(255, 255, 255, 0.78)",
  border: isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)",
  backdropFilter: "blur(16px) saturate(1.4)",
  WebkitBackdropFilter: "blur(16px) saturate(1.4)",
  boxShadow: isDark
    ? "0 8px 32px rgba(0,0,0,0.5)"
    : "0 8px 32px rgba(0,0,0,0.1)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
});

/* Show/hide is opacity + a 12px slide, never display:none and never a slide
   off-canvas. Both panels stay mounted the whole time so their scroll
   position, their in-flight request and their expansion state survive a
   round trip, and so the transition has something to animate. */
const revealStyle = (visible, offsetPx) => ({
  opacity: visible ? 1 : 0,
  transform: visible ? "translateX(0)" : `translateX(${offsetPx}px)`,
  transition: PANEL_TRANSITION,
  pointerEvents: visible ? "auto" : "none",
});

const iconButtonStyle = (isDark, extra = {}) => ({
  paddingVertical: 4,
  paddingHorizontal: 4,
  borderRadius: 5,
  opacity: 0.5,
  hoverBackgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
  content: {
    prefixIconWrap: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 0,
    },
    icon: { width: 13, height: 13 },
  },
  ...extra,
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  TreeRow                                                                */
/*                                                                         */
/*  Folders toggle in place and are never "selected"; files and links       */
/*  select and drive the detail panel. That split is the whole interaction  */
/*  model, so it is expressed once, here, on `kind` — not on hasChildren,   */
/*  which would make a childless folder behave like a file.                 */
/*                                                                         */
/*  `hoverArmed` is the REVISION 2 phantom-hover fix. It is a gate, not a   */
/*  second hover state: `hovered` still tracks the pointer exactly, it just */
/*  is not allowed to paint until the pointer has provably moved. See       */
/*  usePointerHasMoved for the measurement this rests on.                   */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TreeRow({
  row,
  isDark,
  fontFamily,
  color,
  isSelected,
  hoverArmed,
  onToggle,
  onSelect,
}) {
  const [hovered, setHovered] = useState(false);
  const { node, depth, hasChildren, expanded } = row;
  const isFolder = node.kind === "folder";

  const hoverBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.055)";
  const activeBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)";

  const iconName = isFolder
    ? expanded
      ? KIND_ICONS.folder_open
      : KIND_ICONS.folder
    : KIND_ICONS[node.kind] || KIND_ICONS.file;

  return (
    <div
      data-testid="memory-v2-tree-row"
      data-selected={isSelected ? "true" : "false"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => (isFolder ? onToggle(row.path) : onSelect(row))}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        height: ROW_HEIGHT,
        paddingLeft: 6 + depth * INDENT,
        paddingRight: 8,
        borderRadius: ROW_RADIUS,
        cursor: "pointer",
        backgroundColor: isSelected
          ? activeBg
          : hovered && hoverArmed
            ? hoverBg
            : "transparent",
        transition: "background-color 0.12s ease",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* chevron — reserved even when absent, so names stay on one grid */}
      <span
        style={{
          width: 14,
          height: 14,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: hasChildren ? 0.7 : 0,
        }}
      >
        {hasChildren && (
          <Icon
            src={expanded ? "arrow_down" : "arrow_right"}
            style={{ width: 14, height: 14 }}
          />
        )}
      </span>

      <span
        style={{
          width: 14,
          height: 14,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.55,
        }}
      >
        <Icon src={iconName} style={{ width: 14, height: 14 }} />
      </span>

      <span
        title={row.path}
        style={{
          fontSize: 13,
          fontFamily,
          color,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          minWidth: 0,
        }}
      >
        {typeof node.name === "string" && node.name ? node.name : row.path}
      </span>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  TreeStateCard — the non-tree states, sized for a 236px column          */
/*                                                                         */
/*  The states AC-5 requires to be distinguishable never share a visual     */
/*  grammar: they differ in border (dashed vs solid), icon, tint and        */
/*  whether a retry is offered. "Not enabled" and "enabled but empty" must  */
/*  never both degrade into the same blank column.                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TreeStateCard({
  icon,
  title,
  detail,
  code,
  tone,
  dashed,
  isDark,
  fontFamily,
  onRetry,
  retryLabel,
}) {
  const tint =
    tone === "danger"
      ? isDark
        ? "rgba(255,120,120,0.75)"
        : "rgba(180,40,40,0.75)"
      : tone === "caution"
        ? isDark
          ? "rgba(235,190,110,0.8)"
          : "rgba(160,110,20,0.8)"
        : isDark
          ? "rgba(255,255,255,0.42)"
          : "rgba(0,0,0,0.42)";
  const border_color =
    tone === "danger"
      ? isDark
        ? "rgba(255,120,120,0.28)"
        : "rgba(180,40,40,0.24)"
      : isDark
        ? "rgba(255,255,255,0.14)"
        : "rgba(0,0,0,0.12)";
  const meta_color = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";

  return (
    <div
      data-testid="memory-v2-tree-state-card"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 10px",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 7,
          width: "100%",
          padding: "14px 12px",
          borderRadius: 8,
          border: `1px ${dashed ? "dashed" : "solid"} ${border_color}`,
          backgroundColor:
            tone === "danger"
              ? isDark
                ? "rgba(255,80,80,0.05)"
                : "rgba(180,40,40,0.03)"
              : "transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              width: 15,
              height: 15,
              flexShrink: 0,
              color: tint,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.85,
            }}
          >
            <Icon src={icon} style={{ width: 15, height: 15 }} />
          </span>
          <div
            style={{
              fontSize: 12.5,
              fontFamily,
              color: tint,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {title}
          </div>
        </div>

        {detail && (
          <div
            style={{
              fontSize: 11.5,
              fontFamily,
              color: meta_color,
              lineHeight: 1.5,
            }}
          >
            {detail}
          </div>
        )}

        {code && (
          <div
            style={{
              fontSize: 10,
              fontFamily: MONO,
              color: meta_color,
              wordBreak: "break-all",
            }}
          >
            {code}
          </div>
        )}

        {onRetry && (
          <Button
            label={retryLabel}
            prefix_icon="refresh"
            onClick={onRetry}
            style={{
              fontSize: 11,
              paddingVertical: 4,
              paddingHorizontal: 9,
              borderRadius: 6,
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.1)"
                : "rgba(0,0,0,0.06)",
              content: { icon: { width: 12, height: 12 } },
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  DetailField                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function DetailField({ label, value, mono, isDark }) {
  if (!value) return null;
  const meta_color = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)";
  const body_color = isDark ? "rgba(255,255,255,0.68)" : "rgba(0,0,0,0.68)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          fontSize: 9.5,
          fontFamily: MONO,
          color: meta_color,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: mono ? 11 : 11.5,
          fontFamily: mono ? MONO : "inherit",
          color: body_color,
          wordBreak: "break-all",
          lineHeight: 1.45,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  usePointerHasMoved — the phantom-hover gate (REVISION 2)               */
/*                                                                         */
/*  THE BUG: open the inspector and one row is already lit as hovered,      */
/*  untouched. THE CAUSE, measured rather than assumed: when a layout       */
/*  change puts a new element under a cursor that has not moved, Chromium   */
/*  recomputes the hover chain and dispatches real boundary events to it.   */
/*  The tree arrives asynchronously, so its first row lands under whatever  */
/*  the pointer was resting on after the click that opened the modal.       */
/*                                                                         */
/*  This is worth writing down because the obvious diagnosis is wrong.      */
/*  Playwright, headed Chromium, cursor parked and never moved after the    */
/*  click, rows injected 400ms later underneath it:                         */
/*                                                                         */
/*      --- rows rendered ---                                              */
/*      mouseover row5                                                     */
/*      mouseenter row5      <- JS handler, no user movement                */
/*                                                                         */
/*  So this is NOT a CSS `:hover` artifact that JS-tracked hover is immune  */
/*  to. Both light up; these rows were already JS-tracked (as is            */
/*  BUILTIN_COMPONENTs/explorer/explorer.js, which has the same exposure    */
/*  and is simply never mounted under a resting cursor in practice).        */
/*  Rewriting the hover tracking would have changed nothing.                */
/*                                                                         */
/*  What the same run DID hand us is a clean discriminator: the panel's     */
/*  mousemove and pointermove listeners never fired. Chromium's hover       */
/*  recompute emits boundary events ONLY. A human emits mousemove. So the   */
/*  fix is to keep hover tracking exactly as it was and refuse to PAINT it  */
/*  until a mousemove has been seen — one bit, armed by the user, re-armed  */
/*  every time a fresh payload is about to drop new rows under the cursor.  */
/*                                                                         */
/*  Deliberately not a ref: arming has to re-render, or the already-hovered */
/*  row keeps its old background until something else happens to repaint.   */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const usePointerHasMoved = () => {
  const [moved, setMoved] = useState(false);
  /* Safe to call on every mousemove: useState bails out of the re-render when
     the next value is Object.is-equal to the current one, so only the first
     move of each armed cycle costs anything. */
  const arm = useCallback(() => setMoved(true), []);
  const disarm = useCallback(() => setMoved(false), []);
  return { moved, arm, disarm };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  useMemoryV2Tree                                                        */
/*                                                                         */
/*  One load per (open, ownerChatId, spaceId) plus an explicit refresh.     */
/*  Deliberately NOT polled like the vector view: getTree has no pagination,*/
/*  so a background timer would re-pull an unbounded payload on a cadence   */
/*  nobody asked for. Refresh is a button.                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const useMemoryV2Tree = ({ open, ownerChatId, load }) => {
  const [result, setResult] = useState(emptyMemoryV2TreeResult);
  const [spaceId, setSpaceId] = useState("");
  const [nonce, setNonce] = useState(0);
  const requestRef = useRef(0);
  /* Published so callers can react to "a load STARTED", which is a different
     event from "the payload changed". They come apart whenever a loader hands
     back a value it has handed back before — same rows, same object, no
     identity change to notice — and the phantom-hover gate has to close on
     the start, not on a difference that may never arrive. */
  const [loadToken, setLoadToken] = useState(0);

  /* A different chat is a different tree — drop the space pin so we do not
     ask chat B for a space that only exists in chat A. */
  useEffect(() => {
    setSpaceId("");
  }, [ownerChatId]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setResult(emptyMemoryV2TreeResult());
    setLoadToken(requestId);

    load({ ownerChatId, spaceId }).then((next) => {
      if (cancelled || requestRef.current !== requestId) return;
      setResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [open, ownerChatId, spaceId, nonce, load]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { result, refresh, selectSpace: setSpaceId, loadToken };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  useMemoryV2EntryPreview                                                */
/*                                                                         */
/*  Content is a separate read: get_tree carries metadata only. Selecting   */
/*  fast down a long list must not let an earlier answer land in a later    */
/*  selection's panel, hence the request-id fence — the same one the tree   */
/*  loader uses against a superseded chat.                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const useMemoryV2EntryPreview = ({ ownerChatId, selected, loadPreview }) => {
  const [preview, setPreview] = useState(emptyMemoryV2Preview);
  const requestRef = useRef(0);

  const node = selected ? selected.node : null;
  const contentRef =
    node && typeof node.content_ref === "string" ? node.content_ref : "";
  const mimeType =
    node && typeof node.mime_type === "string" ? node.mime_type : "";

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    if (!selected) {
      setPreview(emptyMemoryV2Preview());
      return undefined;
    }
    /* A link has no stored object. Answering locally means the panel never
       flashes a spinner for something already known to have no content. */
    if (!contentRef) {
      setPreview({
        ...emptyMemoryV2Preview(),
        state: MEMORY_V2_PREVIEW_STATES.UNSUPPORTED,
      });
      return undefined;
    }

    let cancelled = false;
    setPreview({
      ...emptyMemoryV2Preview(),
      state: MEMORY_V2_PREVIEW_STATES.LOADING,
    });
    loadPreview({ ownerChatId, ref: contentRef, mimeType }).then((next) => {
      if (cancelled || requestRef.current !== requestId) return;
      setPreview(next);
    });

    return () => {
      cancelled = true;
    };
  }, [selected, ownerChatId, contentRef, mimeType, loadPreview]);

  return preview;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  MemoryV2TreeView                                                       */
/*                                                                         */
/*  Props:                                                                 */
/*    open        — boolean (gates the fetch)                              */
/*    ownerChatId — string (V2 owner key; undefined at the settings mount)  */
/*    load        — injectable tree loader, tests only                     */
/*    loadPreview — injectable content loader, tests only                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const MemoryV2TreeView = ({
  open = true,
  ownerChatId,
  load = loadMemoryV2TreeState,
  loadPreview = loadMemoryV2EntryPreview,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || (isDark ? "#fff" : "#111");
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const meta_color = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)";
  const divider = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const [collapsed, setCollapsed] = useState(false);

  const { result, refresh, selectSpace, loadToken } = useMemoryV2Tree({
    open,
    ownerChatId,
    load,
  });

  /* Expansion and selection are presentation, so they live here — but the
     flattening that turns expansion into rows is the service's job, because
     that is where the render cap is enforced.

     Reset during render rather than in an effect: an effect would commit one
     frame of fully-collapsed tree before opening the first level, which reads
     as a flicker on every load and every space switch. React re-runs this
     component before painting, so the collapsed frame never reaches the
     screen. A reload also drops the selection — the node object behind it is
     from the payload that just got replaced, and keeping it would leave the
     detail panel describing an entry that may no longer exist. */
  const [expanded, setExpanded] = useState(() => new Set());
  const [selected, setSelected] = useState(null);
  const [seenRoots, setSeenRoots] = useState(null);
  const [seenLoad, setSeenLoad] = useState(null);
  const { moved: hoverArmed, arm: armHover, disarm: disarmHover } =
    usePointerHasMoved();

  if (seenRoots !== result.roots) {
    setSeenRoots(result.roots);
    setExpanded(defaultExpandedPaths(result.roots));
    setSelected(null);
  }

  /* Close the hover gate on every load START, which is a different trigger
     from the payload swap above and deliberately so. A load is about to tear
     the rows down and drop a new set under wherever the pointer is resting —
     the exact moment Chromium hands out an unearned mouseenter — and it does
     that whether or not the rows come back different. Keying this off
     `result.roots` instead would miss the case where a loader returns a value
     it has returned before: no identity change to notice, gate silently left
     open. (That is not hypothetical; it is what the re-arm test does.)

     Covers open, refresh and space switch. Pointedly does NOT cover folder
     expand/collapse: there the user just clicked, so the row that slides
     under the cursor lighting up is what every file tree does. */
  if (seenLoad !== loadToken) {
    setSeenLoad(loadToken);
    disarmHover();
  }

  const onToggle = useCallback((path) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  /* Re-clicking the open entry closes the panel. The modal's own close button
     belongs to the vector view's cascade and this panel deliberately does not
     reach into it, so the row is the dismissal. */
  const onSelect = useCallback((row) => {
    setSelected((current) =>
      current && current.path === row.path
        ? null
        : { path: row.path, node: row.node },
    );
  }, []);

  const preview = useMemoryV2EntryPreview({
    ownerChatId,
    selected,
    loadPreview,
  });

  const flattened = useMemo(
    () => flattenMemoryV2Tree(result.roots, { expanded }),
    [result.roots, expanded],
  );

  const disabledDetail = {
    [MEMORY_V2_TREE_DISABLED_REASONS.NO_OWNER]: t("memory_inspect.tree_disabled_no_owner"),
    [MEMORY_V2_TREE_DISABLED_REASONS.NO_BRIDGE]: t("memory_inspect.tree_disabled_no_bridge"),
    [MEMORY_V2_TREE_DISABLED_REASONS.SIDECAR_UNAVAILABLE]: t(
      "memory_inspect.tree_disabled_sidecar",
    ),
    [MEMORY_V2_TREE_DISABLED_REASONS.ROLLOUT_OFF]: t("memory_inspect.tree_disabled_rollout"),
    [MEMORY_V2_TREE_DISABLED_REASONS.STORE_DISABLED]: t("memory_inspect.tree_disabled_store"),
  };

  const renderBody = () => {
    switch (result.state) {
      case MEMORY_V2_TREE_STATES.LOADING:
        return (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontFamily,
              color: meta_color,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {t("memory_inspect.loading")}
          </div>
        );

      case MEMORY_V2_TREE_STATES.DISABLED:
        return (
          <TreeStateCard
            icon="information"
            tone="muted"
            dashed
            title={t("memory_inspect.tree_disabled")}
            detail={disabledDetail[result.reason] || ""}
            isDark={isDark}
            fontFamily={fontFamily}
          />
        );

      case MEMORY_V2_TREE_STATES.EMPTY:
        return (
          <TreeStateCard
            icon="folder"
            tone="muted"
            title={t("memory_inspect.tree_empty")}
            detail={t("memory_inspect.tree_empty_detail")}
            isDark={isDark}
            fontFamily={fontFamily}
            onRetry={refresh}
            retryLabel={t("memory_inspect.tree_refresh")}
          />
        );

      case MEMORY_V2_TREE_STATES.ERROR:
        return (
          <TreeStateCard
            icon="warning"
            tone="danger"
            title={t("memory_inspect.tree_failed")}
            detail={result.errorMessage}
            code={result.errorCode}
            isDark={isDark}
            fontFamily={fontFamily}
            onRetry={refresh}
            retryLabel={t("memory_inspect.tree_retry")}
          />
        );

      case MEMORY_V2_TREE_STATES.READY:
        return (
          <div
            className="scrollable"
            data-testid="memory-v2-tree-rows"
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: "4px 6px 8px",
            }}
          >
            {flattened.rows.map((row) => (
              <TreeRow
                key={row.key}
                row={row}
                isDark={isDark}
                fontFamily={fontFamily}
                color={color}
                isSelected={Boolean(selected) && selected.path === row.path}
                hoverArmed={hoverArmed}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </div>
        );

      /* UNKNOWN and anything a future producer adds. Never silently blank. */
      default:
        return (
          <TreeStateCard
            icon="question_mark"
            tone="caution"
            title={t("memory_inspect.tree_unknown")}
            detail={t("memory_inspect.tree_unknown_detail")}
            isDark={isDark}
            fontFamily={fontFamily}
            onRetry={refresh}
            retryLabel={t("memory_inspect.tree_retry")}
          />
        );
    }
  };

  const isReady = result.state === MEMORY_V2_TREE_STATES.READY;
  /* One space is not a choice — its name is already the panel's title. */
  const showSpaceBar = result.spaces.length > 1;
  const selectedNode = selected ? selected.node : null;

  const renderPreview = () => {
    switch (preview.state) {
      case MEMORY_V2_PREVIEW_STATES.LOADING:
        return (
          <div style={{ fontSize: 11.5, fontFamily, color: meta_color }}>
            {t("memory_inspect.tree_preview_loading")}
          </div>
        );

      case MEMORY_V2_PREVIEW_STATES.UNSUPPORTED:
        return (
          <div style={{ fontSize: 11.5, fontFamily, color: meta_color, lineHeight: 1.5 }}>
            {t("memory_inspect.tree_preview_unsupported")}
          </div>
        );

      case MEMORY_V2_PREVIEW_STATES.ERROR:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                fontSize: 11.5,
                fontFamily,
                color: isDark ? "rgba(255,120,120,0.75)" : "rgba(180,40,40,0.75)",
                lineHeight: 1.5,
              }}
            >
              {t("memory_inspect.tree_preview_failed")}
            </div>
            {preview.errorCode && (
              <div
                style={{ fontSize: 10, fontFamily: MONO, color: meta_color, wordBreak: "break-all" }}
              >
                {preview.errorCode}
              </div>
            )}
          </div>
        );

      case MEMORY_V2_PREVIEW_STATES.READY:
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              data-testid="memory-v2-entry-preview"
              style={{
                fontSize: 11,
                fontFamily: MONO,
                lineHeight: 1.55,
                color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.72)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                padding: "8px 10px",
                borderRadius: 6,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                border: `1px solid ${divider}`,
                maxHeight: 260,
                overflowY: "auto",
              }}
              className="scrollable"
            >
              {preview.text}
            </div>
            {preview.truncated && (
              <div style={{ fontSize: 10, fontFamily: MONO, color: meta_color }}>
                {t("memory_inspect.tree_preview_truncated", {
                  shown: preview.shownBytes,
                  total: preview.totalBytes,
                })}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* ━━ Floating tree side menu (left) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        data-testid="memory-v2-tree-view"
        /* The only listener that can tell a human apart from Chromium's
           hover recompute. It lives on the panel rather than per row so a
           move anywhere in the side menu arms every row at once. */
        onMouseMove={armHover}
        style={{
          ...overlayPanelStyle(isDark),
          left: PANEL_INSET,
          top: PANEL_INSET,
          bottom: PANEL_INSET,
          width: SIDE_MENU_WIDTH,
          ...revealStyle(!collapsed, -12),
        }}
      >
        {/* ── Header: collapse, identity, actions ──
             Order is recipe_list.js's verbatim: the collapse control owns the
             top-left corner, the label takes the slack, action buttons stack
             at the right. It is a layout convention, not a preference — the
             expand handle returns to top-left, so collapse must leave from
             there or the panel appears to hinge off two different corners.

             The 8px is a corner inset, so it has to read the same going down
             as going across (REVISION 5). It was 8/6/6/12 back when a text
             label sat at the left — text needs more optical lead-in than an
             icon does, and 12 was that lead-in. REVISION 4 put a button
             there instead and the 12 stopped being a lead-in and started
             being a lopsided corner: the icon sat 16px from the left edge
             but only 12px from the top. Equal padding on all three open
             sides puts every glyph at 8 + 4 = 12px from its own edge.

             Two things fall out of picking 8 rather than lifting the top to
             12. The collapse glyph lands 19px from the modal's edge and the
             expand handle's lands at 20 (top:14/left:14 + its own 6px
             padding), so the panel now leaves and returns from within a
             pixel of the same spot. And 12px from the panel edge is exactly
             where the row chevrons sit (6px list padding + 6px row padding),
             so the collapse icon shares their column instead of floating
             right of it. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flexShrink: 0,
            padding: "8px 8px 6px 8px",
          }}
        >
          <Button
            prefix_icon="side_menu_close"
            onClick={() => setCollapsed(true)}
            style={iconButtonStyle(isDark)}
          />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 10,
              fontFamily: MONO,
              color: meta_color,
              textTransform: "uppercase",
              letterSpacing: "0.8px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {result.spaceName || t("memory_inspect.view_tree")}
          </div>
          <Button
            prefix_icon="refresh"
            onClick={refresh}
            style={iconButtonStyle(isDark)}
          />
        </div>

        {/* ── Space chips ──
             Same 8px gutter as the header above it. The chips are the header
             block's second row, so their boxes line up under the collapse and
             refresh buttons rather than starting on their own margin. */}
        {showSpaceBar && (
          <div
            className="scrollable"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexShrink: 0,
              padding: "0 8px 6px 8px",
              overflowX: "auto",
            }}
          >
            {result.spaces.map((space) => {
              const active = space.spaceId === result.spaceId;
              return (
                <Button
                  key={space.spaceId}
                  label={space.name || space.spaceId}
                  onClick={() => selectSpace(space.spaceId)}
                  style={{
                    fontSize: 10.5,
                    paddingVertical: 2,
                    paddingHorizontal: 8,
                    borderRadius: 5,
                    opacity: active ? 1 : 0.4,
                    hoverBackgroundColor: isDark
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(0,0,0,0.06)",
                  }}
                />
              );
            })}
          </div>
        )}

        <div style={{ height: 1, flexShrink: 0, backgroundColor: divider }} />

        {/* ── Body ── */}
        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          {renderBody()}
        </div>

        {/* ── Status line: the entry count, and the render cap said out loud ── */}
        {isReady && (
          <div
            style={{
              flexShrink: 0,
              padding: "5px 10px 6px 12px",
              borderTop: `1px solid ${divider}`,
              fontSize: 10,
              fontFamily: MONO,
              color: meta_color,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {flattened.truncated
              ? t("memory_inspect.tree_truncated", {
                  shown: flattened.rows.length,
                  total: flattened.visibleCount,
                })
              : t("memory_inspect.tree_entry_count", { count: result.entryCount })}
          </div>
        )}
      </div>

      {/* ━━ Expand handle — only while the side menu is tucked away ━━━━ */}
      {collapsed && (
        <div
          data-testid="memory-v2-tree-expand"
          style={{
            position: "absolute",
            top: EXPAND_HANDLE_INSET,
            left: EXPAND_HANDLE_INSET,
            zIndex: 4,
          }}
        >
          <Button
            prefix_icon="side_menu_left"
            onClick={() => setCollapsed(false)}
            style={iconButtonStyle(isDark, {
              paddingVertical: 6,
              paddingHorizontal: 6,
              borderRadius: 6,
              opacity: 0.55,
              content: {
                prefixIconWrap: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 0,
                },
                icon: { width: 14, height: 14 },
              },
            })}
          />
        </div>
      )}

      {/* ━━ Floating entry detail (right) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          Always mounted. With nothing selected it is a fully transparent,
          click-through pane sitting exactly on top of the vector view's own
          detail card — which stays visible and usable underneath. */}
      <div
        data-testid="memory-v2-entry-detail"
        data-open={selectedNode ? "true" : "false"}
        style={{
          ...overlayPanelStyle(isDark),
          right: PANEL_INSET,
          top: PANEL_INSET,
          bottom: DETAIL_BOTTOM,
          width: DETAIL_WIDTH,
          ...revealStyle(Boolean(selectedNode), 12),
        }}
      >
        <div
          style={{
            padding: "14px 16px 8px",
            flexShrink: 0,
            fontSize: 11,
            fontFamily: MONO,
            color: meta_color,
            textTransform: "uppercase",
            letterSpacing: "0.8px",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {t("memory_inspect.entry_detail")}
        </div>

        <div
          className="scrollable"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "0 16px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontFamily,
          }}
        >
          {selectedNode && (
            <>
              {/* ── Identity ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                      opacity: 0.55,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      src={KIND_ICONS[selectedNode.kind] || KIND_ICONS.file}
                      style={{ width: 14, height: 14 }}
                    />
                  </span>
                  <span
                    style={{
                      fontSize: 14.5,
                      fontWeight: 600,
                      color,
                      wordBreak: "break-word",
                      minWidth: 0,
                    }}
                  >
                    {selectedNode.name || selected.path}
                  </span>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 9.5,
                      fontFamily: MONO,
                      color: meta_color,
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      padding: "2px 6px",
                      borderRadius: 4,
                      border: `1px solid ${divider}`,
                    }}
                  >
                    {selectedNode.kind}
                  </span>
                </div>

                {selectedNode.description && (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)",
                      lineHeight: 1.5,
                    }}
                  >
                    {selectedNode.description}
                  </div>
                )}
              </div>

              <div style={{ height: 1, backgroundColor: divider }} />

              {/* ── Facts ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <DetailField
                  label={t("memory_inspect.tree_field_path")}
                  value={selected.path}
                  mono
                  isDark={isDark}
                />
                <DetailField
                  label={t("memory_inspect.tree_field_url")}
                  value={selectedNode.link_url}
                  mono
                  isDark={isDark}
                />
                <DetailField
                  label={t("memory_inspect.tree_field_size")}
                  value={formatBytes(selectedNode.content_bytes)}
                  mono
                  isDark={isDark}
                />
                <DetailField
                  label={t("memory_inspect.tree_field_updated")}
                  value={formatTimestamp(selectedNode.updated_at_ms)}
                  isDark={isDark}
                />
              </div>

              {/* ── Content ── */}
              <div style={{ height: 1, backgroundColor: divider }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    fontSize: 9.5,
                    fontFamily: MONO,
                    color: meta_color,
                    textTransform: "uppercase",
                    letterSpacing: "0.8px",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                  }}
                >
                  {t("memory_inspect.tree_preview")}
                </div>
                {renderPreview()}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export { MemoryV2TreeView as default, MemoryV2TreeView };
