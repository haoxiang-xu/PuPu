/**
 * SkillOrganizerModal — where the user lays out their skills (issue #232).
 *
 * One tree, one small window. The tree is CommandTree — the same renderer the
 * `/` palette mounts — so what is arranged here is exactly what the palette
 * shows; there is no separate picture of the result to drift from the result.
 *
 * Everything else that used to be here is gone on purpose. The "unfiled"
 * column lost its reason to exist once skills defaulted into their plugin's
 * folder (it held three builtins and duplicated the tree beside it), and the
 * card / sidebar / footer chrome was four boxes inside a box in an app whose
 * own surfaces are flat and divide themselves with a single hairline. This
 * follows the Settings modal's language: a title, a caption line, and rows
 * lying directly on the surface.
 *
 * Two kinds of folder, told apart in the row itself: a plugin's folder is
 * tagged and carries no menu — it is the plugin's declaration, re-derived on
 * every projection, so renaming or deleting it would be editing someone
 * else's work and undone on the next render; the user's own category gets ⋯
 * (rename / delete) and answers to right-click.
 *
 * Why a modal and not the live `/` overlay: that overlay is summoned by
 * typing and dismissed by Escape, and it filters as you type. Dragging is a
 * slow spatial gesture and a filtered list has no stable position to drag to.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { RenameRow } from "../side-menu/side_menu_components";
import CommandTree from "../chat-input/components/command_tree";
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

/**
 * Every command the palette can ever show, not just the ones available right
 * now. `/btw` and friends are streaming-only, and a user cannot file a command
 * they are not allowed to see — so both phases are listed and merged. Reading
 * the registry through its public lister keeps this off command_registry's
 * internals, whose callers this feature deliberately does not touch.
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

/* The theme editor's Import / Export buttons, verbatim: the modal's own
   chrome speaks in the semantic tokens, not in hand-picked greys. */
const textToolButtonStyle = {
  root: {
    height: 28,
    borderRadius: 8,
    paddingVertical: 0,
    paddingHorizontal: 10,
    fontSize: 12,
    gap: 6,
    iconSize: 12,
    color: "var(--pupu-text-secondary)",
  },
  background: {
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    activeBackgroundColor: "var(--pupu-overlay-active)",
  },
};

const SkillOrganizerModal = ({ open, onClose, isDark = false }) => {
  useModalLifecycle("skill-organizer-modal", open);
  const { t, locale } = useTranslation();

  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  /* Descriptions are i18n keys (t() passes literal text through unchanged),
     the same way chat_input translates them for the palette. Keyed on the
     locale string, not on `t`: this list is the root of the tree's identity,
     and a callback that changed per render would re-sync Explorer's store
     every frame. */
  const commands = useMemo(
    () =>
      open
        ? listAllCommands().map((command) => ({
            ...command,
            description: t(command.description),
          }))
        : [],
    // the registry does not change while a modal is up
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, locale],
  );
  const folderState = useMemo(
    () => (open ? getSkillFolderState() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, version],
  );
  const { data, root } = useMemo(
    () => buildCommandTree({ commands, state: folderState }),
    [commands, folderState],
  );

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

  /* ── category menu: ⋯ on the row, or right-click ──── */
  const [menu, setMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });
  const closeMenu = useCallback(
    () => setMenu((m) => ({ ...m, visible: false })),
    [],
  );
  const openMenuFor = useCallback((node, x, y) => {
    setMenu({ visible: true, x, y, nodeId: node.id });
  }, []);
  const handleFolderContextMenu = useCallback(
    (node, event) => {
      event.preventDefault();
      if (node?.derived) return;
      openMenuFor(node, event.clientX, event.clientY);
    },
    [openMenuFor],
  );
  const menuItems = useMemo(() => {
    if (!menu.nodeId) return [];
    const node = data[menu.nodeId];
    if (!node || node.derived) return [];
    const label = node.label || "";
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

  /* Row-level decoration — the only place the two kinds of folder differ. */
  const decorateFolder = useCallback(
    (node) => {
      if (node.derived) {
        return {
          postfix: (
            <span
              style={{
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              {t("commands.organizer_plugin_tag")}
            </span>
          ),
        };
      }
      return {
        trailing: (
          <Button
            prefix_icon="more"
            ariaLabel={t("commands.organizer_folder_menu")}
            onClick={(event) => {
              const r = event.currentTarget.getBoundingClientRect();
              openMenuFor(node, r.left, r.bottom + 4);
            }}
            style={{
              paddingVertical: 3,
              paddingHorizontal: 3,
              borderRadius: 6,
              iconSize: 14,
              opacity: 0.45,
              color: "var(--pupu-text-secondary)",
              hoverBackgroundColor: "var(--pupu-overlay-hover)",
              activeBackgroundColor: "var(--pupu-overlay-active)",
            }}
          />
        ),
      };
    },
    [t, openMenuFor],
  );

  /* ── new category ────────────────────────────────── */
  const handleNewCategory = useCallback(() => {
    const name = t("commands.organizer_default_category");
    const { folderId } = createSkillFolder({ name });
    refresh();
    /* Straight into rename: a category is only useful once it is named, and
       naming it later means finding it again. */
    setRenaming({ nodeId: `${FOLDER_NODE_PREFIX}${folderId}`, value: name });
  }, [t, refresh]);

  /* ── every drop persists through the same path ───── */
  const handleReorder = useCallback(
    (map, nextRoot) => {
      applySkillExplorerReorder({ data: map, root: nextRoot });
      refresh();
    },
    [refresh],
  );

  useEffect(() => {
    if (!open) {
      setRenaming({ nodeId: null, value: "" });
      setMenu({ visible: false, x: 0, y: 0, nodeId: null });
    }
  }, [open]);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        style={{
          width: 460,
          minWidth: 460,
          height: 540,
          maxHeight: "80vh",
          padding: 0,
          backgroundColor: "var(--pupu-background)",
          color: "var(--pupu-text)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            padding: "30px 34px 26px",
          }}
        >
          {/* the Settings modal's own close control, verbatim */}
          <Button
            prefix_icon="close"
            ariaLabel={t("commands.organizer_close")}
            onClick={onClose}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              paddingVertical: 6,
              paddingHorizontal: 6,
              borderRadius: 6,
              opacity: 0.45,
              zIndex: 2,
              content: {
                prefixIconWrap: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 0,
                },
                icon: { width: 14, height: 14 },
              },
            }}
          />

          <div
            style={{
              fontSize: 25,
              fontWeight: 400,
              letterSpacing: 0.2,
              margin: "0 0 22px",
              userSelect: "none",
            }}
          >
            {t("commands.organizer_title")}
          </div>

          {/* the one divider: a caption over a hairline */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingBottom: 6,
              borderBottom: "1px solid var(--pupu-border-subtle)",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgba(var(--pupu-text-rgb),0.42)",
                userSelect: "none",
              }}
            >
              {t("commands.organizer_palette_caption", {
                count: commands.length,
              })}
            </span>
            <Button
              prefix_icon="add"
              label={t("commands.organizer_new_category")}
              onClick={handleNewCategory}
              style={textToolButtonStyle}
            />
          </div>

          <div
            className="scrollable"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              marginTop: 6,
            }}
          >
            {commands.length === 0 ? (
              <div
                style={{
                  padding: "18px 4px",
                  fontSize: 13,
                  color: "var(--pupu-text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                {t("commands.organizer_empty")}
              </div>
            ) : (
              <CommandTree
                data={data}
                root={root}
                activeIndex={-1}
                isDark={isDark}
                width="100%"
                draggable
                onReorder={handleReorder}
                onFolderContextMenu={handleFolderContextMenu}
                nodeOverrides={nodeOverrides}
                decorateFolder={decorateFolder}
              />
            )}
          </div>
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
    </>
  );
};

export default SkillOrganizerModal;
