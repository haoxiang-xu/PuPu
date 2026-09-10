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

const keepComposerFocus = (event) => {
  event.preventDefault();
};
/* Rows inside the tree are contiguous — Explorer stacks them with no gap. */

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
} = {}) => {
  const rowHeight = bare ? BARE_ROW_HEIGHT : ROW_HEIGHT;
  return Math.min(rowCount, MAX_VISIBLE_TREE_ROWS) * rowHeight + LIST_PADDING;
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
  /* Bare mode does not scroll: the palette panel's list slot is the scroll
     host, and PuPu's overlay thumb is laid out there against the panel's
     frame (the 22px corner, the hint bar). Boxed in here it could only run
     from corner to bar. The carded menu stands alone and keeps its own. */
  const scrolling = bare
    ? {}
    : {
        maxHeight: commandListHeight({
          rowCount: visibleRowCount > 0 ? visibleRowCount : items.length,
          bare,
        }),
        overflowY: "auto",
        overscrollBehavior: "contain",
      };

  return (
    <div
      role="listbox"
      aria-label="斜杠命令"
      className={bare ? undefined : "scrollable"}
      /* Nothing in the palette may take focus from the composer: its blur is
         what closes the palette (chat_input clears the slash trigger on
         blur), so a mousedown the browser is allowed to act on closes the
         palette before the click behind it lands. CommandRow already
         prevents this for command rows; Explorer's own folder rows — and
         the chevrons, gutters and padding around them — did not, which is
         why clicking a category closed the palette instead of collapsing
         it. Bare mode only: the organizer's tree holds a rename field that
         must be able to take focus. */
      onMouseDown={bare ? keepComposerFocus : undefined}
      style={{
        position: "relative",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        ...scrolling,
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

    </div>
  );
};

export { MAX_VISIBLE_ROWS, MAX_VISIBLE_TREE_ROWS };
export default CommandMenu;
