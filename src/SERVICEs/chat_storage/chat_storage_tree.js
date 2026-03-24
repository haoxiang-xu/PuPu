import {
  CHATS_SCHEMA_VERSION,
  DEFAULT_CHAT_TITLE,
  DEFAULT_FOLDER_LABEL,
  ensureUniqueNodeId,
  generateFolderId,
  now,
  toChatNodeId,
} from "./chat_storage_constants";
import {
  CHARACTER_CHAT_KIND,
  clone,
  formatRelativeAgeShort,
  isObject,
  isValidTimestamp,
  sanitizeLabel,
  unique,
} from "./chat_storage_sanitize";

export const createFolderNode = ({ id, label, children = [] } = {}) => {
  const stamp = now();
  return {
    id: id || generateFolderId(),
    entity: "folder",
    type: "folder",
    label: sanitizeLabel(label, DEFAULT_FOLDER_LABEL),
    children: Array.isArray(children)
      ? children.filter((value) => typeof value === "string")
      : [],
    createdAt: stamp,
    updatedAt: stamp,
  };
};

export const createChatNode = ({ id, chatId, label }) => {
  const stamp = now();
  return {
    id,
    entity: "chat",
    type: "file",
    chatId,
    label: sanitizeLabel(label, DEFAULT_CHAT_TITLE),
    createdAt: stamp,
    updatedAt: stamp,
  };
};

export const createEmptyStoreV2 = () => ({
  schemaVersion: CHATS_SCHEMA_VERSION,
  updatedAt: now(),
  chatsById: {},
  activeChatId: null,
  lruChatIds: [],
  tree: {
    root: [],
    nodesById: {},
    selectedNodeId: null,
    expandedFolderIds: [],
  },
  ui: {},
});

export const sortChatsByUpdatedAt = (chatsById) => {
  return Object.keys(chatsById).sort(
    (a, b) =>
      Number(chatsById[b]?.updatedAt || 0) -
      Number(chatsById[a]?.updatedAt || 0),
  );
};

export const makeInitialTreeFromChats = (
  chatsById,
  orderedChatIds,
  activeChatId,
) => {
  const nodesById = {};
  const root = [];

  const ordered = unique([
    ...(Array.isArray(orderedChatIds) ? orderedChatIds : []),
    ...sortChatsByUpdatedAt(chatsById),
  ]).filter((chatId) => chatsById[chatId]);

  for (const chatId of ordered) {
    const preferredId = toChatNodeId(chatId);
    const nodeId = ensureUniqueNodeId(nodesById, preferredId, "chn");
    nodesById[nodeId] = createChatNode({
      id: nodeId,
      chatId,
      label: chatsById[chatId].title,
    });
    root.push(nodeId);
  }

  const activeNodeId =
    root.find((id) => nodesById[id]?.chatId === activeChatId) ||
    root[0] ||
    null;

  return {
    root,
    nodesById,
    selectedNodeId: activeNodeId,
    expandedFolderIds: [],
  };
};

export const buildParentIndex = (tree) => {
  const parentById = {};
  for (const rootId of tree.root) {
    parentById[rootId] = { parentId: null, index: tree.root.indexOf(rootId) };
  }

  for (const [nodeId, node] of Object.entries(tree.nodesById)) {
    if (node.entity !== "folder") {
      continue;
    }
    node.children.forEach((childId, index) => {
      if (!parentById[childId]) {
        parentById[childId] = { parentId: nodeId, index };
      }
    });
  }

  return parentById;
};

export const firstChatInSubtree = (tree, nodeId) => {
  const node = tree.nodesById[nodeId];
  if (!node) {
    return null;
  }

  if (node.entity === "chat") {
    return node.chatId;
  }

  if (node.entity === "folder") {
    for (const childId of node.children) {
      const found = firstChatInSubtree(tree, childId);
      if (found) return found;
    }
  }

  return null;
};

export const firstChatNodeIdInSubtree = (tree, nodeId) => {
  const node = tree.nodesById[nodeId];
  if (!node) {
    return null;
  }

  if (node.entity === "chat") {
    return nodeId;
  }

  if (node.entity === "folder") {
    for (const childId of node.children) {
      const found = firstChatNodeIdInSubtree(tree, childId);
      if (found) return found;
    }
  }

  return null;
};

export const firstChatInTree = (tree) => {
  for (const rootId of tree.root) {
    const found = firstChatInSubtree(tree, rootId);
    if (found) return found;
  }
  return null;
};

export const firstChatNodeIdInTree = (tree) => {
  for (const rootId of tree.root) {
    const found = firstChatNodeIdInSubtree(tree, rootId);
    if (found) return found;
  }
  return null;
};

export const getSiblingIds = (tree, parentFolderId) => {
  if (!parentFolderId) {
    return [...tree.root];
  }

  const parent = tree.nodesById[parentFolderId];
  if (!parent || parent.entity !== "folder") {
    return [...tree.root];
  }

  return [...parent.children];
};

export const applySiblingIds = (tree, parentFolderId, siblings) => {
  if (!parentFolderId) {
    tree.root = siblings;
    return;
  }

  const parent = tree.nodesById[parentFolderId];
  if (!parent || parent.entity !== "folder") {
    tree.root = siblings;
    return;
  }

  parent.children = siblings;
};

export const resolveSelectedParentFolderId = (store, preferredParentFolderId) => {
  if (preferredParentFolderId === null) {
    return null;
  }

  if (
    typeof preferredParentFolderId === "string" &&
    preferredParentFolderId.trim()
  ) {
    const node = store.tree.nodesById[preferredParentFolderId];
    if (node && node.entity === "folder") {
      return preferredParentFolderId;
    }
    return null;
  }

  const selected = store.tree.selectedNodeId
    ? store.tree.nodesById[store.tree.selectedNodeId]
    : null;
  if (!selected) {
    return null;
  }

  if (selected.entity === "folder") {
    return selected.id;
  }

  const parentById = buildParentIndex(store.tree);
  const parent = parentById[selected.id];
  return parent ? parent.parentId : null;
};

export const ensureUniqueLabel = (
  store,
  parentFolderId,
  preferredLabel,
  excludeNodeId = null,
) => {
  const siblings = getSiblingIds(store.tree, parentFolderId);
  const used = new Set(
    siblings
      .filter((nodeId) => nodeId !== excludeNodeId)
      .map((nodeId) =>
        sanitizeLabel(store.tree.nodesById[nodeId]?.label || "", "").toLowerCase(),
      )
      .filter(Boolean),
  );

  const baseLabel = sanitizeLabel(preferredLabel, DEFAULT_FOLDER_LABEL);
  if (!used.has(baseLabel.toLowerCase())) {
    return baseLabel;
  }

  let index = 2;
  while (true) {
    const next = `${baseLabel} (${index})`;
    if (!used.has(next.toLowerCase())) {
      return next;
    }
    index += 1;
  }
};

export const snapshotSubtreeForCopy = (store, sourceNodeId) => {
  const nodesById = {};
  const chatsById = {};

  const walk = (nodeId, path = new Set()) => {
    const node = store.tree.nodesById[nodeId];
    if (!node || path.has(nodeId)) {
      return null;
    }

    const nextPath = new Set(path);
    nextPath.add(nodeId);

    if (node.entity === "folder") {
      const nextChildren = [];
      const rawChildren = Array.isArray(node.children) ? node.children : [];
      for (const childId of rawChildren) {
        const walked = walk(childId, nextPath);
        if (walked) {
          nextChildren.push(walked);
        }
      }
      nodesById[nodeId] = {
        entity: "folder",
        label: sanitizeLabel(node.label, DEFAULT_FOLDER_LABEL),
        children: nextChildren,
      };
      return nodeId;
    }

    if (node.entity === "chat" && node.chatId && store.chatsById[node.chatId]) {
      nodesById[nodeId] = {
        entity: "chat",
        chatId: node.chatId,
        label: sanitizeLabel(node.label, DEFAULT_CHAT_TITLE),
      };
      chatsById[node.chatId] = clone(store.chatsById[node.chatId]);
      return nodeId;
    }

    return null;
  };

  const rootNodeId = walk(sourceNodeId, new Set());
  if (!rootNodeId || !nodesById[rootNodeId]) {
    return null;
  }

  return {
    rootNodeId,
    nodesById,
    chatsById,
  };
};

export const insertNodeIntoParent = (
  store,
  parentFolderId,
  nodeId,
  prepend = false,
) => {
  const siblings = getSiblingIds(store.tree, parentFolderId);
  const nextSiblings = prepend ? [nodeId, ...siblings] : [...siblings, nodeId];
  applySiblingIds(store.tree, parentFolderId, nextSiblings);
};

export const removeNodeFromParent = (tree, nodeId) => {
  const parentById = buildParentIndex(tree);
  const parentInfo = parentById[nodeId];
  if (!parentInfo) {
    return;
  }

  const siblings = getSiblingIds(tree, parentInfo.parentId);
  const nextSiblings = siblings.filter((id) => id !== nodeId);
  applySiblingIds(tree, parentInfo.parentId, nextSiblings);
};

export const removeChatFromTreeByChatId = (tree, chatId) => {
  const entries = Object.entries(tree.nodesById);
  for (const [nodeId, node] of entries) {
    if (node.entity === "chat" && node.chatId === chatId) {
      removeNodeFromParent(tree, nodeId);
      delete tree.nodesById[nodeId];
      return nodeId;
    }
  }
  return null;
};

export const ensureTreeHasNodeForChat = (store, chatId, options = {}) => {
  if (!chatId || !store.chatsById[chatId]) {
    return null;
  }

  for (const [nodeId, node] of Object.entries(store.tree.nodesById)) {
    if (node.entity === "chat" && node.chatId === chatId) {
      node.label = sanitizeLabel(
        store.chatsById[chatId].title,
        DEFAULT_CHAT_TITLE,
      );
      node.updatedAt = now();
      return nodeId;
    }
  }

  const preferredId = toChatNodeId(chatId);
  const nodeId = ensureUniqueNodeId(store.tree.nodesById, preferredId, "chn");
  store.tree.nodesById[nodeId] = createChatNode({
    id: nodeId,
    chatId,
    label: store.chatsById[chatId].title,
  });

  const parentFolderId = resolveSelectedParentFolderId(
    store,
    options.parentFolderId,
  );
  const siblings = getSiblingIds(store.tree, parentFolderId);
  applySiblingIds(store.tree, parentFolderId, [nodeId, ...siblings]);

  return nodeId;
};

export const sanitizeTree = (treeInput, chatsById, activeChatId, lruChatIds) => {
  const rawNodes = isObject(treeInput?.nodesById) ? treeInput.nodesById : {};
  const provisional = {};
  const provisionalChatNodeByChatId = new Map();

  for (const [nodeId, rawNode] of Object.entries(rawNodes)) {
    if (!isObject(rawNode) || typeof nodeId !== "string" || !nodeId.trim()) {
      continue;
    }

    const entity = rawNode.entity;
    const nodeType = rawNode.type;

    if (entity === "folder" || nodeType === "folder") {
      provisional[nodeId] = {
        id: nodeId,
        entity: "folder",
        type: "folder",
        label: sanitizeLabel(rawNode.label, DEFAULT_FOLDER_LABEL),
        children: Array.isArray(rawNode.children)
          ? rawNode.children.filter((id) => typeof id === "string")
          : [],
        createdAt: Number.isFinite(Number(rawNode.createdAt))
          ? Number(rawNode.createdAt)
          : now(),
        updatedAt: Number.isFinite(Number(rawNode.updatedAt))
          ? Number(rawNode.updatedAt)
          : now(),
      };
      continue;
    }

    const chatId = typeof rawNode.chatId === "string" ? rawNode.chatId : null;
    if (
      !chatId ||
      !chatsById[chatId] ||
      provisionalChatNodeByChatId.has(chatId)
    ) {
      continue;
    }

    provisionalChatNodeByChatId.set(chatId, nodeId);
    provisional[nodeId] = {
      id: nodeId,
      entity: "chat",
      type: "file",
      chatId,
      label: sanitizeLabel(
        chatsById[chatId]?.title || rawNode.label,
        DEFAULT_CHAT_TITLE,
      ),
      createdAt: Number.isFinite(Number(rawNode.createdAt))
        ? Number(rawNode.createdAt)
        : now(),
      updatedAt: Number.isFinite(Number(rawNode.updatedAt))
        ? Number(rawNode.updatedAt)
        : now(),
    };
  }

  const normalized = {
    root: [],
    nodesById: {},
    selectedNodeId: null,
    expandedFolderIds: [],
  };

  const seen = new Set();

  const walk = (nodeId, path) => {
    if (!provisional[nodeId] || path.has(nodeId) || seen.has(nodeId)) {
      return null;
    }

    const node = provisional[nodeId];
    const nextPath = new Set(path);
    nextPath.add(nodeId);
    seen.add(nodeId);

    if (node.entity === "folder") {
      const nextChildren = [];
      for (const childId of node.children) {
        const walkedId = walk(childId, nextPath);
        if (walkedId) nextChildren.push(walkedId);
      }
      normalized.nodesById[nodeId] = {
        ...node,
        children: nextChildren,
      };
      return nodeId;
    }

    if (!chatsById[node.chatId]) {
      return null;
    }

    normalized.nodesById[nodeId] = {
      ...node,
      label: sanitizeLabel(
        chatsById[node.chatId]?.title || node.label,
        DEFAULT_CHAT_TITLE,
      ),
    };
    return nodeId;
  };

  const rawRoot = Array.isArray(treeInput?.root)
    ? treeInput.root.filter((id) => typeof id === "string")
    : [];
  for (const nodeId of rawRoot) {
    const walked = walk(nodeId, new Set());
    if (walked) normalized.root.push(walked);
  }

  const orderedChats = unique([
    ...(Array.isArray(lruChatIds) ? lruChatIds : []),
    ...sortChatsByUpdatedAt(chatsById),
  ]).filter((chatId) => chatsById[chatId]);

  const mappedChatIds = new Set();
  for (const node of Object.values(normalized.nodesById)) {
    if (node.entity === "chat") {
      mappedChatIds.add(node.chatId);
    }
  }

  for (const chatId of orderedChats) {
    if (mappedChatIds.has(chatId)) {
      continue;
    }

    const preferred = toChatNodeId(chatId);
    const nodeId = ensureUniqueNodeId(normalized.nodesById, preferred, "chn");
    normalized.nodesById[nodeId] = createChatNode({
      id: nodeId,
      chatId,
      label: chatsById[chatId].title,
    });
    normalized.root.push(nodeId);
    mappedChatIds.add(chatId);
  }

  const selectedRaw =
    typeof treeInput?.selectedNodeId === "string" ? treeInput.selectedNodeId : null;
  const selectedNode =
    selectedRaw && normalized.nodesById[selectedRaw]
      ? normalized.nodesById[selectedRaw]
      : null;
  const activeNodeId = Object.keys(normalized.nodesById).find(
    (nodeId) =>
      normalized.nodesById[nodeId]?.entity === "chat" &&
      normalized.nodesById[nodeId]?.chatId === activeChatId,
  );

  normalized.selectedNodeId =
    (selectedNode?.entity === "chat" && selectedRaw) ||
    activeNodeId ||
    firstChatNodeIdInTree(normalized) ||
    null;

  normalized.expandedFolderIds = Array.isArray(treeInput?.expandedFolderIds)
    ? unique(
        treeInput.expandedFolderIds.filter(
          (nodeId) =>
            normalized.nodesById[nodeId] &&
            normalized.nodesById[nodeId].entity === "folder",
        ),
      )
    : [];

  return normalized;
};

export const findFallbackChatIdNearContainer = (
  tree,
  parentFolderId,
  startIndex,
) => {
  const siblings = getSiblingIds(tree, parentFolderId);

  for (let i = startIndex; i < siblings.length; i += 1) {
    const found = firstChatInSubtree(tree, siblings[i]);
    if (found) return found;
  }

  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const found = firstChatInSubtree(tree, siblings[i]);
    if (found) return found;
  }

  return firstChatInTree(tree);
};

export const collectSubtreeNodeIds = (tree, nodeId, bucket = []) => {
  const node = tree.nodesById[nodeId];
  if (!node) {
    return bucket;
  }

  bucket.push(nodeId);
  if (node.entity === "folder") {
    node.children.forEach((childId) =>
      collectSubtreeNodeIds(tree, childId, bucket),
    );
  }
  return bucket;
};

export const buildTreeNodeLookupByChatId = (tree) => {
  const map = {};
  for (const [nodeId, node] of Object.entries(tree.nodesById)) {
    if (node.entity === "chat") {
      map[node.chatId] = nodeId;
    }
  }
  return map;
};

const sanitizeExplorerLabel = (label, fallback) =>
  sanitizeLabel(label, fallback);

const isChatGenerating = (chat) => {
  if (!Array.isArray(chat?.messages)) {
    return false;
  }
  return chat.messages.some(
    (message) =>
      message?.role === "assistant" && message?.status === "streaming",
  );
};

export const sanitizeExplorerReorderPayload = ({
  data,
  root,
  currentNodesById,
}) => {
  const payloadData = isObject(data) ? data : {};
  const payloadRoot = Array.isArray(root)
    ? root.filter((id) => typeof id === "string")
    : [];
  const sanitizedNodes = {};

  for (const [nodeId, baseNode] of Object.entries(currentNodesById || {})) {
    const payloadNode = payloadData[nodeId];
    if (baseNode.entity === "folder") {
      const rawChildren = Array.isArray(payloadNode?.children)
        ? payloadNode.children
        : baseNode.children;
      sanitizedNodes[nodeId] = {
        ...baseNode,
        label: sanitizeExplorerLabel(payloadNode?.label, baseNode.label),
        children: rawChildren.filter(
          (childId) =>
            typeof childId === "string" &&
            currentNodesById[childId] &&
            childId !== nodeId,
        ),
      };
      continue;
    }

    sanitizedNodes[nodeId] = {
      ...baseNode,
      label: sanitizeExplorerLabel(payloadNode?.label, baseNode.label),
    };
  }

  const sanitizedRoot = unique(
    payloadRoot.filter((nodeId) => sanitizedNodes[nodeId]),
  );
  return {
    nodesById: sanitizedNodes,
    root: sanitizedRoot,
  };
};

export const buildExplorerFromTree = (tree, chatsById, handlers = {}) => {
  const nodesById = isObject(tree?.nodesById) ? tree.nodesById : {};
  const root = Array.isArray(tree?.root) ? tree.root : [];
  const relativeNow = Number.isFinite(Number(handlers.relativeNow))
    ? Number(handlers.relativeNow)
    : now();
  const chatGeneratingById = {};
  const chatUnreadGeneratedById = {};
  for (const [chatId, chat] of Object.entries(chatsById || {})) {
    chatGeneratingById[chatId] = isChatGenerating(chat);
    chatUnreadGeneratedById[chatId] = chat?.hasUnreadGeneratedReply === true;
  }

  const subtreeGeneratingCache = new Map();
  const hasGeneratingChatInSubtree = (nodeId, path = new Set()) => {
    if (subtreeGeneratingCache.has(nodeId)) {
      return subtreeGeneratingCache.get(nodeId);
    }

    if (path.has(nodeId)) {
      return false;
    }

    const node = nodesById[nodeId];
    if (!node) {
      subtreeGeneratingCache.set(nodeId, false);
      return false;
    }

    if (node.entity === "chat") {
      const generating = Boolean(chatGeneratingById[node.chatId]);
      subtreeGeneratingCache.set(nodeId, generating);
      return generating;
    }

    if (node.entity !== "folder" || !Array.isArray(node.children)) {
      subtreeGeneratingCache.set(nodeId, false);
      return false;
    }

    path.add(nodeId);
    let generating = false;
    for (const childId of node.children) {
      if (hasGeneratingChatInSubtree(childId, path)) {
        generating = true;
        break;
      }
    }
    path.delete(nodeId);

    subtreeGeneratingCache.set(nodeId, generating);
    return generating;
  };

  const subtreeUnreadGeneratedCache = new Map();
  const hasUnreadGeneratedInSubtree = (nodeId, path = new Set()) => {
    if (subtreeUnreadGeneratedCache.has(nodeId)) {
      return subtreeUnreadGeneratedCache.get(nodeId);
    }

    if (path.has(nodeId)) {
      return false;
    }

    const node = nodesById[nodeId];
    if (!node) {
      subtreeUnreadGeneratedCache.set(nodeId, false);
      return false;
    }

    if (node.entity === "chat") {
      const hasUnread = Boolean(chatUnreadGeneratedById[node.chatId]);
      subtreeUnreadGeneratedCache.set(nodeId, hasUnread);
      return hasUnread;
    }

    if (node.entity !== "folder" || !Array.isArray(node.children)) {
      subtreeUnreadGeneratedCache.set(nodeId, false);
      return false;
    }

    path.add(nodeId);
    let hasUnread = false;
    for (const childId of node.children) {
      if (hasUnreadGeneratedInSubtree(childId, path)) {
        hasUnread = true;
        break;
      }
    }
    path.delete(nodeId);

    subtreeUnreadGeneratedCache.set(nodeId, hasUnread);
    return hasUnread;
  };

  const data = {};
  for (const [nodeId, node] of Object.entries(nodesById)) {
    const selected = handlers.selectedNodeId === nodeId;

    if (node.entity === "folder") {
      const hasGeneratingDescendant = hasGeneratingChatInSubtree(nodeId);
      const hasUnreadGeneratedDescendant = hasUnreadGeneratedInSubtree(nodeId);
      data[nodeId] = {
        type: "folder",
        entity: "folder",
        label: sanitizeLabel(node.label, DEFAULT_FOLDER_LABEL),
        children: Array.isArray(node.children) ? node.children : [],
        prefix_icon: "folder",
        has_generating_chat_descendant: hasGeneratingDescendant,
        has_unread_generated_descendant: hasUnreadGeneratedDescendant,
        style: selected
          ? {
              opacity: 1,
            }
          : undefined,
        on_double_click: () => {
          if (typeof handlers.onStartRename === "function") {
            handlers.onStartRename(node);
          }
        },
        on_context_menu: (_node, event) => {
          if (typeof handlers.onContextMenu === "function") {
            handlers.onContextMenu(node, event);
          }
        },
      };
      continue;
    }

    const chat = chatsById?.[node.chatId];
    const isCharacterChat = chat?.kind === CHARACTER_CHAT_KIND;
    const title = sanitizeLabel(
      isCharacterChat
        ? chat?.characterName || chat?.title || node.label
        : chat?.title || node.label,
      DEFAULT_CHAT_TITLE,
    );
    const isGenerating = Boolean(chatGeneratingById[node.chatId]);
    const hasUnreadGeneratedReply = Boolean(chatUnreadGeneratedById[node.chatId]);
    const lastUpdatedAt = isValidTimestamp(chat?.lastMessageAt)
      ? Number(chat.lastMessageAt)
      : isValidTimestamp(chat?.updatedAt)
        ? Number(chat.updatedAt)
        : isValidTimestamp(node.updatedAt)
          ? Number(node.updatedAt)
          : null;
    const updatedAgo = formatRelativeAgeShort(lastUpdatedAt, relativeNow);
    data[nodeId] = {
      type: "file",
      entity: "chat",
      chatId: node.chatId,
      chatKind: isCharacterChat ? CHARACTER_CHAT_KIND : "default",
      characterId: isCharacterChat ? chat?.characterId || "" : "",
      characterName: isCharacterChat ? chat?.characterName || title : "",
      characterAvatar: isCharacterChat ? chat?.characterAvatar || null : null,
      is_active: selected,
      label: title,
      postfix: updatedAgo || undefined,
      prefix_icon: isCharacterChat ? undefined : "chat",
      is_generating: isGenerating,
      has_unread_generated_reply: hasUnreadGeneratedReply,
      style: selected
        ? {
            opacity: 1,
          }
        : undefined,
      on_click: () => {
        if (typeof handlers.onSelect === "function") {
          handlers.onSelect(nodeId);
        }
      },
      on_double_click: () => {
        if (isCharacterChat || !selected) return;
        if (typeof handlers.onStartRename === "function") {
          handlers.onStartRename(node);
        }
      },
      on_context_menu: (_node, event) => {
        if (typeof handlers.onContextMenu === "function") {
          handlers.onContextMenu(node, event);
        }
      },
    };
  }

  return {
    data,
    root: [...root],
    defaultExpanded: Array.isArray(tree?.expandedFolderIds)
      ? tree.expandedFolderIds
      : [],
  };
};
