/**
 * SkillOrganizerModal — where the user lays out their skills (issue #232).
 *
 * Layout is the "what you see is what `/` shows" one: a narrow unfiled column
 * on the left, and on the right the palette ITSELF — the same CommandTree the
 * composer mounts, at the palette's own width. Arranging happens against the
 * real thing, so there is no gap between the organizer's picture and the
 * surface it configures.
 *
 * Why a modal and not the live `/` overlay: that overlay is summoned by typing
 * and dismissed by Escape, and it filters as you type. Dragging is a slow
 * spatial gesture; a filtered list has no stable position to drag to; and a
 * 5px drag threshold on a list the user is arrowing through silently reorders
 * things. Every mature launcher (Raycast, Alfred, VS Code) keeps organizing
 * out of the summoned surface for the same reasons.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { Z } from "../../BUILTIN_COMPONENTs/layer/z_layers";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { RenameRow } from "../side-menu/side_menu_components";
import CommandTree from "../chat-input/components/command_tree";
import CommandRow from "../chat-input/components/command_row";
import { listCommands } from "../../SERVICEs/command_registry";
import {
  applySkillExplorerReorder,
  buildCommandTree,
  createSkillFolder,
  deleteSkillFolder,
  getSkillFolderState,
  renameSkillFolder,
} from "../../SERVICEs/skill_folder_storage";

const FOLDER_NODE_PREFIX = "folder:";
const DRAG_THRESHOLD = 5;
const PALETTE_WIDTH = 300;

/**
 * Every command the palette can ever show, not just the ones available right
 * now. `/btw` and friends are streaming-only, and a user cannot file a command
 * they are not allowed to see — so both phases are listed and merged. Reading
 * the registry through its public lister keeps this off command_registry's
 * internals, whose callers this change deliberately does not touch.
 */
const listAllCommands = () => {
  const byName = new Map();
  ["composer", "streaming"].forEach((phase) => {
    listCommands({ phase }).forEach((command) => {
      if (!byName.has(command.name)) byName.set(command.name, command);
    });
  });
  return Array.from(byName.values());
};

const SkillOrganizerModal = ({ open, onClose, isDark = false }) => {
  useModalLifecycle("skill-organizer-modal", open);
  const { t } = useTranslation();

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  const commands = useMemo(
    () => (open ? listAllCommands() : []),
    // the registry does not change while a modal is up
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );
  const folderState = useMemo(
    () => (open ? getSkillFolderState() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, version],
  );
  const { data, root, unfiled } = useMemo(
    () => buildCommandTree({ commands, state: folderState }),
    [commands, folderState],
  );

  const categoryCount = Object.keys(folderState?.folders || {}).length;

  /* ── renaming a category ─────────────────────────── */
  const [renaming, setRenaming] = useState({ nodeId: null, value: "" });
  const handleConfirmRename = useCallback(
    (nextValue) => {
      const nodeId = renaming.nodeId;
      setRenaming({ nodeId: null, value: "" });
      const trimmed = String(nextValue ?? "").trim();
      if (!nodeId || !trimmed) return;
      renameSkillFolder(nodeId.slice(FOLDER_NODE_PREFIX.length), trimmed);
      refresh();
    },
    [renaming.nodeId, refresh],
  );
  const handleCancelRename = useCallback(
    () => setRenaming({ nodeId: null, value: "" }),
    [],
  );

  const nodeOverrides = useMemo(() => {
    if (!renaming.nodeId) return null;
    return {
      [renaming.nodeId]: {
        component: ({ node }) => (
          <RenameRow
            node={node}
            initialValue={renaming.value}
            onConfirm={handleConfirmRename}
            onCancel={handleCancelRename}
            isDark={isDark}
          />
        ),
      },
    };
  }, [
    renaming.nodeId,
    renaming.value,
    handleConfirmRename,
    handleCancelRename,
    isDark,
  ]);

  /* ── category context menu ───────────────────────── */
  const [menu, setMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });
  const closeMenu = useCallback(
    () => setMenu((m) => ({ ...m, visible: false })),
    [],
  );
  const handleFolderContextMenu = useCallback((node, event) => {
    event.preventDefault();
    if (node?.derived) return;
    setMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
    });
  }, []);
  const menuItems = useMemo(() => {
    if (!menu.nodeId) return [];
    const node = data[menu.nodeId];
    const label = node?.label || "";
    /* A plugin's folder carries the plugin's name and exists only as long as
       the plugin does. Renaming or deleting it would be editing someone
       else's declaration — and the next projection would rebuild it anyway.
       Its contents are still the user's to rearrange. */
    if (node?.derived) return [];
    return [
      {
        icon: "rename",
        label: t("commands.organizer_rename"),
        onClick: () => {
          setRenaming({ nodeId: menu.nodeId, value: label });
          closeMenu();
        },
      },
      {
        icon: "delete",
        label: t("commands.organizer_delete"),
        danger: true,
        onClick: () => {
          deleteSkillFolder(menu.nodeId.slice(FOLDER_NODE_PREFIX.length));
          closeMenu();
          refresh();
        },
      },
    ];
  }, [menu.nodeId, data, t, closeMenu, refresh]);

  /* ── new category ────────────────────────────────── */
  const handleNewCategory = useCallback(() => {
    const name = t("commands.organizer_default_category");
    const { folderId } = createSkillFolder({ name });
    refresh();
    /* Straight into rename: a category is only useful once it is named, and
       naming it later means finding it again. */
    setRenaming({ nodeId: `${FOLDER_NODE_PREFIX}${folderId}`, value: name });
  }, [t, refresh]);

  /* ── persistence for every drop, internal or external ──
     Explorer fires on_reorder for BOTH, so one handler covers filing from the
     left column and rearranging inside the preview. */
  const handleReorder = useCallback(
    (map, nextRoot) => {
      applySkillExplorerReorder({ data: map, root: nextRoot });
      refresh();
    },
    [refresh],
  );

  /* ── dragging out of the unfiled column ──────────── */
  const [drag, setDrag] = useState(null);
  const dragPending = useRef(null);
  const ghostRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  /* Callback ref rather than a plain one: the ghost mounts a render AFTER the
     drag begins, so without placing it here the first frame paints at the
     window's top-left corner. Explorer's own ghost does the same thing. */
  const ghostCallbackRef = useCallback((el) => {
    ghostRef.current = el;
    if (el) {
      el.style.transform = `translate(${pointerRef.current.x + 16}px, ${pointerRef.current.y - 14}px)`;
    }
  }, []);

  const handleSourceMouseDown = useCallback((event, nodeId) => {
    if (event.button !== 0) return;
    dragPending.current = {
      nodeId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const moveGhost = (x, y) => {
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate(${x + 16}px, ${y - 14}px)`;
      }
    };

    const handleMove = (event) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
      const pending = dragPending.current;
      if (pending && !drag) {
        const dx = event.clientX - pending.startX;
        const dy = event.clientY - pending.startY;
        if (Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
          setDrag({ nodeId: pending.nodeId });
        }
        return;
      }
      if (drag) moveGhost(event.clientX, event.clientY);
    };

    const handleUp = () => {
      dragPending.current = null;
      /* Clear on the NEXT frame: Explorer's own mouseup handler is what
         performs the drop, and it reads the active external drag. Tearing the
         drag down inside the same dispatch would race it. */
      if (drag) requestAnimationFrame(() => setDrag(null));
    };

    const handleKey = (event) => {
      if (event.key === "Escape" && drag) setDrag(null);
    };

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, drag]);

  useEffect(() => {
    if (!open) {
      setDrag(null);
      dragPending.current = null;
      setRenaming({ nodeId: null, value: "" });
      setMenu({ visible: false, x: 0, y: 0, nodeId: null });
    }
  }, [open]);

  const externalDrag = drag
    ? { active: true, nodeId: drag.nodeId, node: data[drag.nodeId] }
    : null;

  /* ── palette / colors ────────────────────────────── */
  const muted = "rgba(var(--pupu-text-rgb),0.42)";
  const caption = "rgba(var(--pupu-text-rgb),0.32)";
  const paneBorder = "1px solid rgba(var(--pupu-text-rgb),0.06)";

  const captionStyle = {
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: caption,
    padding: "6px 8px 8px",
    userSelect: "none",
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        style={{
          minWidth: 720,
          width: 720,
          height: 470,
          maxHeight: "80vh",
          padding: 0,
          backgroundColor: "var(--pupu-surface)",
          color: "var(--pupu-text)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── title ─────────────────────────────────── */}
        <div
          style={{
            height: 46,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            borderBottom: paneBorder,
            fontSize: 13.5,
            fontWeight: 500,
            userSelect: "none",
          }}
        >
          {t("commands.organizer_title")}
        </div>

        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {/* ── unfiled column ──────────────────────── */}
          <div
            style={{
              width: 236,
              flexShrink: 0,
              backgroundColor: "var(--pupu-sidebar)",
              borderRight: paneBorder,
              padding: "8px 8px 10px",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div style={captionStyle}>
              {t("commands.organizer_unfiled")} · {unfiled.length}
            </div>
            <div
              className="scrollable"
              style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
            >
              {unfiled.length === 0 ? (
                <div
                  style={{
                    padding: "18px 10px",
                    fontSize: 12,
                    color: muted,
                    lineHeight: 1.6,
                  }}
                >
                  {t("commands.organizer_all_filed")}
                </div>
              ) : (
                unfiled.map((nodeId) => (
                  <div
                    key={nodeId}
                    onMouseDown={(event) =>
                      handleSourceMouseDown(event, nodeId)
                    }
                    style={{
                      cursor: "grab",
                      opacity: drag?.nodeId === nodeId ? 0.35 : 1,
                    }}
                  >
                    <CommandRow
                      item={data[nodeId]?.command}
                      active={false}
                      isDark={isDark}
                      onPick={() => {}}
                      rowRadius={7}
                      rowHeight={30}
                    />
                  </div>
                ))
              )}
            </div>
            <div style={{ paddingTop: 8, flexShrink: 0 }}>
              <Button
                prefix_icon="folder_new"
                label={t("commands.organizer_new_category")}
                onClick={handleNewCategory}
                style={{
                  width: "100%",
                  fontSize: 12,
                  paddingVertical: 6,
                  borderRadius: 7,
                  color: "rgba(var(--pupu-text-rgb),0.62)",
                }}
                hoverBackgroundColor={
                  isDark
                    ? "rgba(255,255,255,0.07)"
                    : "rgba(0,0,0,0.055)"
                }
              />
            </div>
          </div>

          {/* ── the palette itself ──────────────────── */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              padding: "16px 20px 20px",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 12,
                left: 20,
                ...captionStyle,
                padding: 0,
              }}
            >
              {t("commands.organizer_preview_caption")}
            </span>

            <div
              className="scrollable"
              style={{
                width: PALETTE_WIDTH,
                maxHeight: "100%",
                overflowY: "auto",
                borderRadius: 22,
                border: "1px solid rgba(var(--pupu-text-rgb),0.12)",
                backgroundColor: isDark
                  ? "rgba(var(--pupu-surface-rgb),0.92)"
                  : "rgba(var(--pupu-surface-rgb),0.98)",
                boxShadow: isDark
                  ? "0 12px 34px rgba(0,0,0,0.42)"
                  : "0 12px 34px rgba(0,0,0,0.14)",
                padding: "8px 8px 6px",
              }}
            >
              <div
                style={{
                  height: 26,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 10px",
                  fontSize: 13,
                  color: "rgba(var(--pupu-text-rgb),0.75)",
                  userSelect: "none",
                }}
              >
                /
              </div>
              <CommandTree
                data={data}
                root={root}
                activeIndex={-1}
                isDark={isDark}
                bare
                width="100%"
                draggable
                onReorder={handleReorder}
                externalDrag={externalDrag}
                onFolderContextMenu={handleFolderContextMenu}
                nodeOverrides={nodeOverrides}
              />
            </div>
          </div>
        </div>

        {/* ── footer ────────────────────────────────── */}
        <div
          style={{
            height: 46,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            borderTop: paneBorder,
            fontSize: 11.5,
            color: muted,
            userSelect: "none",
          }}
        >
          <span>
            {t("commands.organizer_counts", {
              commands: commands.length,
              categories: categoryCount,
              unfiled: unfiled.length,
            })}
          </span>
          <Button
            label={t("commands.organizer_done")}
            onClick={onClose}
            style={{
              fontSize: 12,
              fontWeight: 500,
              paddingVertical: 5,
              paddingHorizontal: 16,
              borderRadius: 8,
              color: isDark ? "#101010" : "#ffffff",
              root: {
                background: isDark
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(0,0,0,0.82)",
              },
            }}
          />
        </div>
      </Modal>

      <ContextMenu
        visible={menu.visible}
        x={menu.x}
        y={menu.y}
        items={menuItems}
        onClose={closeMenu}
        isDark={isDark}
      />

      {/* ── drag ghost ────────────────────────────────
          PORTALLED TO BODY, not rendered in place. Z.DRAG_GHOST (8000) only
          outranks Z.MODAL (3000) when the two are siblings in the same
          stacking context; left inline this sits inside the composer's
          subtree, where an ancestor context clamps it and the ghost paints
          UNDER the modal it belongs to — the drag still works, the user just
          cannot see what they are dragging. */}
      {drag && data[drag.nodeId]
        ? ReactDOM.createPortal(
        <div
          ref={ghostCallbackRef}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: 220,
            pointerEvents: "none",
            zIndex: Z.DRAG_GHOST,
            borderRadius: 7,
            backgroundColor: "var(--pupu-surface)",
            boxShadow: isDark
              ? "0 4px 16px rgba(0,0,0,0.5)"
              : "0 4px 16px rgba(0,0,0,0.12)",
            opacity: 0.92,
          }}
        >
          <CommandRow
            item={data[drag.nodeId].command}
            active={false}
            isDark={isDark}
            onPick={() => {}}
            rowRadius={7}
            rowHeight={30}
          />
        </div>,
        document.body,
      )
        : null}
    </>
  );
};

export default SkillOrganizerModal;
