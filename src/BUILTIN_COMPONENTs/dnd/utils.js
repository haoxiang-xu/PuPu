import { arrayMove } from "@dnd-kit/sortable";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  DnD utility helpers                                                                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Find which container an item belongs to.
 *
 * @param {string} id                  – item id (or container id)
 * @param {Object} containers          – { [containerId]: string[] }
 * @returns {string|undefined}         – container id
 */
export const findContainer = (id, containers) => {
  // id is itself a container key
  if (id in containers) return id;
  // otherwise search each container for the item
  return Object.keys(containers).find((key) => containers[key].includes(id));
};

/**
 * Move an item between (or within) containers.
 * Returns a new containers object (immutable).
 *
 * @param {Object} containers               – { [containerId]: string[] }
 * @param {string} activeContainer           – source container id
 * @param {string} overContainer             – target container id
 * @param {string} activeId                  – dragged item id
 * @param {string|undefined} overId          – id the pointer is over
 * @returns {Object}                         – new containers
 */
export const moveBetweenContainers = (
  containers,
  activeContainer,
  overContainer,
  activeId,
  overId,
) => {
  if (!activeContainer || !overContainer) return containers;
  if (activeContainer === overContainer) return containers;
  if (!(activeContainer in containers) || !(overContainer in containers)) {
    return containers;
  }

  const activeItems = [...containers[activeContainer]];
  const overItems = [...containers[overContainer]];
  const activeIndex = activeItems.indexOf(activeId);
  if (activeIndex === -1) return containers;
  const overIndex = overId ? overItems.indexOf(overId) : overItems.length;

  activeItems.splice(activeIndex, 1);
  const insertAt = overIndex >= 0 ? overIndex : overItems.length;
  overItems.splice(insertAt, 0, activeId);

  const unchangedSource =
    activeItems.length === containers[activeContainer].length &&
    activeItems.every((item, index) => item === containers[activeContainer][index]);
  const unchangedTarget =
    overItems.length === containers[overContainer].length &&
    overItems.every((item, index) => item === containers[overContainer][index]);
  if (unchangedSource && unchangedTarget) return containers;

  return {
    ...containers,
    [activeContainer]: activeItems,
    [overContainer]: overItems,
  };
};

export { arrayMove };
