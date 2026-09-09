/**
 * CommandMenu — the slash-command surface in the composer.
 *
 * Since issue #232 this is a TREE, not a list: it renders the categories the
 * user built in the skill organizer, in the order they arranged them. With no
 * organization stored the tree degenerates to exactly the flat list PuPu
 * shipped before, so the unorganized case is not a special path.
 *
 * The tree itself is CommandTree — the same component the organizer's preview
 * mounts, which is what makes "what you arrange is what you get" true by
 * construction rather than by two renderers staying in step.
 *
 * Items are still prefix-filtered by the caller (chat_input); this component
 * only renders. Selection is still the caller's: `activeIndex` indexes the
 * VISIBLE rows, and `onVisibleChange` reports what those are so the caller's
 * arrow keys can walk a tree without knowing its shape.
 */
import { useMemo } from "react";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import CommandTree from "./command_tree";
import { BARE_ROW_HEIGHT, ROW_HEIGHT } from "./command_row";
import { buildCommandTree } from "../../../SERVICEs/skill_folder_storage";

const MAX_VISIBLE_ROWS = 6;
/* A tree needs more room than the old flat six rows: folder rows spend height
   that carries no command, so the same six commands can cost ten rows. */
const MAX_VISIBLE_TREE_ROWS = 10;
/* Bare inset. The palette panel is radius 22 with a 1px border OUTSIDE its
   280px width, so the pill's distance from the visible corner is this plus
   one. 7 + 1 = 8 = 22 − 14: the row pill's arc and the panel's arc share a
   centre. (8 here read as "concentric" for a long time; it was 1px off.) */
const LIST_PADDING = 7;
/* The listbox is a flex column with gap 1 between its TWO children — the tree
   and the organize entry. Rows inside the tree are contiguous: Explorer stacks
   them with no gap, unlike the flat list this replaced. A 1px-per-row stride
   lingered from that list and made the panel 6px taller than what it held;
   flex-end parked those 6px at the top, on top of the inset, and the top row's
   corner drifted off the panel's. Measured against the rendered list, item by
   item: 7 + rows×28 + 1 + 2 + 26 + 1. */
const TREE_TO_ENTRY_GAP = 1;
const ORGANIZE_ENTRY_H = 26;
const ORGANIZE_ENTRY_MARGIN = 2;
/* content-box (this repo sets no global border-box): the entry's 1px top rule
   sits outside its height */
const ORGANIZE_ENTRY_BORDER = 1;

/**
 * The list's height, from the row count actually rendered.
 *
 * ONE definition, exported, because the palette panel sizes the surface this
 * list sits in. When the two computed it separately they disagreed by 17px —
 * the inner list capped first and clipped its last row through the middle,
 * which looks like a rendering bug and is really two height models drifting.
 */
export const commandListHeight = ({
  rowCount = 0,
  bare = false,
  withOrganizeEntry = false,
} = {}) => {
  const rowHeight = bare ? BARE_ROW_HEIGHT : ROW_HEIGHT;
  return (
    Math.min(rowCount, MAX_VISIBLE_TREE_ROWS) * rowHeight +
    LIST_PADDING +
    (withOrganizeEntry
      ? TREE_TO_ENTRY_GAP +
        ORGANIZE_ENTRY_MARGIN +
        ORGANIZE_ENTRY_H +
        ORGANIZE_ENTRY_BORDER
      : 0)
  );
};

/**
 * `bare` strips the floating-card chrome so the list can live inside another
 * surface (the command palette panel). `visible` drives the Elevator Push
 * row entrance there: rows start hidden (translateY(-9px), transparent) and
 * cascade in top-down once visible flips true.
 */
const CommandMenu = ({
  items = [],
  activeIndex = 0,
  onPick = () => {},
  onHover = null,
  onVisibleChange = null,
  isDark = false,
  bare = false,
  visible = true,
  folderState = null,
  expandRef = null,
  onOrganize = null,
  organizeLabel = "",
  visibleRowCount = 0,
  width = 280,
}) => {
  /* Explorer re-syncs its entire store whenever the `data` prop changes
     IDENTITY, so the tree it is handed has to be stable while its content is.
     The caller rebuilds `items` on every keystroke (chat_input re-runs
     listCommands and re-translates each description), which would otherwise
     be a render loop, not merely wasted work. Keying on content is what makes
     an unstable caller safe here. */
  const itemsKey = items
    .map(
      (item) =>
        `${item?.name}\u0001${item?.description}\u0001${item?.icon ?? ""}\u0001${item?.sourceLabel ?? ""}`,
    )
    .join("\u0000");
  const { data, root } = useMemo(
    () => buildCommandTree({ commands: items, state: folderState }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemsKey, folderState],
  );

  if (!Array.isArray(items) || items.length === 0) return null;

  const surfaceBg = isDark
    ? "rgba(var(--pupu-surface-rgb),0.66)"
    : "rgba(var(--pupu-surface-rgb),0.72)";
  const border = isDark
    ? "1px solid rgba(var(--pupu-text-rgb),0.12)"
    : "1px solid rgba(var(--pupu-text-rgb),0.10)";
  const shadow = isDark
    ? "0 10px 30px rgba(0,0,0,0.36), 0 2px 8px rgba(0,0,0,0.22)"
    : "0 10px 30px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)";

  /* bare mode lives inside the palette panel (radius 22, 1px border): a
     7px inset plus that border is 8, and 22 − 8 = 14 is the row pill's
     radius — the two arcs share a centre. 14 is also the largest radius a
     28px-tall row can render (half its height), so nothing gets clamped. */
  const chrome = bare
    ? { padding: `${LIST_PADDING}px ${LIST_PADDING}px 0` }
    : {
        backgroundColor: surfaceBg,
        backdropFilter: "blur(18px) saturate(1.4)",
        WebkitBackdropFilter: "blur(18px) saturate(1.4)",
        border,
        borderRadius: 10,
        boxShadow: shadow,
        padding: 3,
      };

  return (
    <div
      role="listbox"
      aria-label="斜杠命令"
      className="scrollable"
      style={{
        position: "relative",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        maxHeight: commandListHeight({
          rowCount: visibleRowCount > 0 ? visibleRowCount : items.length,
          bare,
          withOrganizeEntry: !!onOrganize,
        }),
        overflowY: "auto",
        overscrollBehavior: "contain",
        ...chrome,
      }}
    >
      <CommandTree
        data={data}
        root={root}
        activeIndex={activeIndex}
        onPick={onPick}
        onHover={onHover}
        onVisibleChange={onVisibleChange}
        isDark={isDark}
        bare={bare}
        visible={visible}
        width={bare ? "100%" : width}
        expandRef={expandRef}
      />

      {/* ── organize entry ────────────────────────────
          The moment a user wants to fix this list is the moment they are
          looking at it, so the way in sits at its foot rather than somewhere
          in settings. Dragging still never happens here: this opens the
          organizer, it does not turn the overlay into one. */}
      {onOrganize ? (
        <div
          data-command-organize-entry
          onMouseDown={(event) => {
            event.preventDefault();
            onOrganize();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            height: ORGANIZE_ENTRY_H,
            flexShrink: 0,
            marginTop: ORGANIZE_ENTRY_MARGIN,
            padding: "0 10px",
            borderTop: "1px solid rgba(var(--pupu-text-rgb),0.07)",
            borderRadius: bare ? 14 : 7,
            fontSize: 11.5,
            color: "rgba(var(--pupu-text-rgb),0.42)",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <Icon
            src="folder_new"
            color="rgba(var(--pupu-text-rgb),0.38)"
            style={{ width: 12, height: 12, flexShrink: 0 }}
          />
          <span>{organizeLabel}</span>
        </div>
      ) : null}
    </div>
  );
};

export { MAX_VISIBLE_ROWS, MAX_VISIBLE_TREE_ROWS };
export default CommandMenu;
