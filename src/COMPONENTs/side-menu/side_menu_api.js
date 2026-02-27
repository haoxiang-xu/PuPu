import {
  applyExplorerReorder,
  createChatInSelectedContext,
  createFolder,
  deleteTreeNodeCascade,
  getChatsStore,
  renameTreeNode,
  selectTreeNode,
} from "../../SERVICEs/chat_storage";

export const sideMenuChatTreeAPI = {
  getStore: () => getChatsStore(),
  createChat: (params = {}) =>
    createChatInSelectedContext(params, { source: "external-ui" }),
  createFolder: (params = {}) =>
    createFolder(params, { source: "external-ui" }),
  renameNode: (params = {}) =>
    renameTreeNode(params, { source: "external-ui" }),
  deleteNodeCascade: (params = {}) =>
    deleteTreeNodeCascade(params, { source: "external-ui" }),
  selectNode: (params = {}) =>
    selectTreeNode(params, { source: "external-ui" }),
  applyReorder: (params = {}) =>
    applyExplorerReorder(params, { source: "external-ui" }),
};
