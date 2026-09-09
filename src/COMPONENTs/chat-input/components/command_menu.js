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

  /* bare mode lives inside the palette panel (radius 22): 8px inset with
     14px rows keeps the corners truly concentric — 22 - 8 = 14, which is
     also the max radius a 28px-tall row can render (half its height), so
     nothing gets silently clamped */
  const chrome = bare
    ? { padding: "8px 8px 0" }
    : {
        backgroundColor: surfaceBg,
        backdropFilter: "blur(18px) saturate(1.4)",
        WebkitBackdropFilter: "blur(18px) saturate(1.4)",
        border,
        borderRadius: 10,
        boxShadow: shadow,
        padding: 3,
      };

  const rowStride = bare ? BARE_ROW_HEIGHT : ROW_HEIGHT;

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
        maxHeight: MAX_VISIBLE_TREE_ROWS * rowStride,
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
    </div>
  );
};

export { MAX_VISIBLE_ROWS, MAX_VISIBLE_TREE_ROWS };
export default CommandMenu;
