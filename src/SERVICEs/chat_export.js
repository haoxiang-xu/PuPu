import { api } from "./api";
import { runtimeBridge } from "./bridges/miso_bridge";
import {
  getChatsStore,
  createChatWithMessagesInSelectedContext,
  createFolder,
} from "./chat_storage";
import { snapshotSubtreeForCopy } from "./chat_storage/chat_storage_tree";

const EXPORT_FORMAT_VERSION = 1;

const buildChatExportPayload = async (chatId, store) => {
  const chat = store?.chatsById?.[chatId];
  if (!chat) return null;

  const nodeEntry = Object.entries(store?.tree?.nodesById || {}).find(
    ([, n]) => n.entity === "chat" && n.chatId === chatId,
  );
  const label = nodeEntry?.[1]?.label || chat.title || "Chat";
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  let sessionMemory = null;
  try {
    const res = await api.miso.getSessionMemoryExport(chatId);
    if (Array.isArray(res?.messages) && res.messages.length > 0) {
      sessionMemory = res.messages;
    }
  } catch {
    // session memory unavailable — export without it
  }

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    type: "chat",
    label,
    chat: {
      title: chat.title || label,
      messages,
      model: chat.model || null,
      systemPromptOverrides: chat.systemPromptOverrides || null,
      selectedToolkits: chat.selectedToolkits || null,
      selectedWorkspaceIds: chat.selectedWorkspaceIds || null,
    },
    sessionMemory,
  };
};

const buildFolderExportPayload = async (nodeId, store) => {
  const snapshot = snapshotSubtreeForCopy(store, nodeId);
  if (!snapshot) return null;

  const rootNode = snapshot.nodesById[snapshot.rootNodeId];
  const label = rootNode?.label || "Folder";

  const sessionMemories = {};
  const chatIds = Object.keys(snapshot.chatsById);
  for (const cid of chatIds) {
    try {
      const res = await api.miso.getSessionMemoryExport(cid);
      if (Array.isArray(res?.messages) && res.messages.length > 0) {
        sessionMemories[cid] = res.messages;
      }
    } catch {
      // skip unavailable session memories
    }
  }

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    type: "folder",
    label,
    snapshot,
    sessionMemories,
  };
};

export const exportChat = async (chatId) => {
  const store = getChatsStore();
  const payload = await buildChatExportPayload(chatId, store);
  if (!payload) return { ok: false, error: "chat_not_found" };

  const safeName = (payload.label || "chat")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .slice(0, 60);

  const dialogResult = await runtimeBridge.showSaveDialog({
    defaultPath: `${safeName}.json`,
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });

  if (dialogResult.canceled) return { ok: false, error: "canceled" };

  const content = JSON.stringify(payload, null, 2);
  const writeResult = await runtimeBridge.writeFile(
    dialogResult.filePath,
    content,
  );

  return writeResult?.ok
    ? { ok: true }
    : { ok: false, error: writeResult?.error || "write_failed" };
};

export const exportFolder = async (nodeId) => {
  const store = getChatsStore();
  const payload = await buildFolderExportPayload(nodeId, store);
  if (!payload) return { ok: false, error: "folder_not_found" };

  const safeName = (payload.label || "folder")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .slice(0, 60);

  const dialogResult = await runtimeBridge.showSaveDialog({
    defaultPath: `${safeName}.json`,
    filters: [{ name: "JSON Files", extensions: ["json"] }],
  });

  if (dialogResult.canceled) return { ok: false, error: "canceled" };

  const content = JSON.stringify(payload, null, 2);
  const writeResult = await runtimeBridge.writeFile(
    dialogResult.filePath,
    content,
  );

  return writeResult?.ok
    ? { ok: true }
    : { ok: false, error: writeResult?.error || "write_failed" };
};

export const validateImportData = (data) => {
  if (!data || typeof data !== "object") return false;
  if (data.formatVersion !== EXPORT_FORMAT_VERSION) return false;
  if (data.type !== "chat" && data.type !== "folder") return false;

  if (data.type === "chat") {
    return (
      data.chat &&
      typeof data.chat === "object" &&
      Array.isArray(data.chat.messages)
    );
  }

  if (data.type === "folder") {
    return (
      data.snapshot &&
      typeof data.snapshot === "object" &&
      data.snapshot.rootNodeId &&
      data.snapshot.nodesById
    );
  }

  return false;
};

const restoreSessionMemory = async (sessionId, messages) => {
  if (!sessionId || !Array.isArray(messages) || messages.length === 0) return;
  try {
    await api.miso.replaceSessionMemory({
      sessionId,
      messages,
      options: {},
    });
  } catch {
    // best-effort session memory restore
  }
};

export const importData = async (data, { parentFolderId = null } = {}) => {
  if (!validateImportData(data)) {
    return { ok: false, error: "invalid_format" };
  }

  if (data.type === "chat") {
    const res = createChatWithMessagesInSelectedContext(
      {
        title: data.chat.title || data.label || "Imported Chat",
        parentFolderId,
        messages: data.chat.messages,
      },
      { source: "import" },
    );

    if (!res?.store) {
      return { ok: false, error: "create_failed" };
    }

    // Restore session memory for the new chat
    if (
      Array.isArray(data.sessionMemory) &&
      data.sessionMemory.length > 0 &&
      res.chatId
    ) {
      await restoreSessionMemory(res.chatId, data.sessionMemory);
    }

    return { ok: true, store: res.store };
  }

  if (data.type === "folder") {
    const snapshot = data.snapshot;
    const memMap = data.sessionMemories || {};
    const newChatIdMap = {};
    let latestStore = null;

    const importNode = (snapshotNodeId, parentId) => {
      const node = snapshot.nodesById?.[snapshotNodeId];
      if (!node) return;

      if (node.entity === "folder") {
        const folderRes = createFolder(
          { parentFolderId: parentId, label: node.label || "Folder" },
          { source: "import" },
        );
        latestStore = folderRes?.store || getChatsStore();
        const newFolderId = folderRes?.folderId || parentId;

        const children = Array.isArray(node.children) ? node.children : [];
        for (const childId of children) {
          importNode(childId, newFolderId);
        }
      } else if (node.entity === "chat") {
        const chatData = snapshot.chatsById?.[node.chatId];
        if (!chatData) return;
        const chatRes = createChatWithMessagesInSelectedContext(
          {
            title: chatData.title || node.label || "Chat",
            parentFolderId: parentId,
            messages: chatData.messages || [],
          },
          { source: "import" },
        );
        latestStore = chatRes?.store || getChatsStore();
        if (chatRes?.chatId && node.chatId) {
          newChatIdMap[node.chatId] = chatRes.chatId;
        }
      }
    };

    importNode(snapshot.rootNodeId, parentFolderId);

    if (!latestStore) {
      return { ok: false, error: "create_failed" };
    }

    // Restore session memories for imported chats
    for (const [oldChatId, memMessages] of Object.entries(memMap)) {
      const newChatId = newChatIdMap[oldChatId];
      if (newChatId) {
        await restoreSessionMemory(newChatId, memMessages);
      }
    }

    return { ok: true, store: latestStore };
  }

  return { ok: false, error: "unknown_type" };
};

export const importFromFile = async ({ parentFolderId = null } = {}) => {
  const dialogResult = await runtimeBridge.showOpenDialog({
    filters: [{ name: "JSON Files", extensions: ["json"] }],
    properties: ["openFile"],
  });

  if (dialogResult.canceled || !dialogResult.filePaths?.[0]) {
    return { ok: false, error: "canceled" };
  }

  const readResult = await runtimeBridge.readFile(dialogResult.filePaths[0]);
  if (!readResult?.ok) {
    return { ok: false, error: readResult?.error || "read_failed" };
  }

  let data;
  try {
    data = JSON.parse(readResult.content);
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  return importData(data, { parentFolderId });
};

export const importFromDroppedFile = async (
  file,
  { parentFolderId = null } = {},
) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch {
        resolve({ ok: false, error: "invalid_json" });
        return;
      }
      const result = await importData(data, { parentFolderId });
      resolve(result);
    };
    reader.onerror = () => resolve({ ok: false, error: "read_failed" });
    reader.readAsText(file);
  });
};
