import { useEffect, useState } from "react";
import {
  bootstrapChatsStore,
  getChatsStore,
  subscribeChatsStore,
} from "../../../SERVICEs/chat_storage";

export const useChatTreeStore = () => {
  const [chatStore, setChatStore] = useState(() => bootstrapChatsStore().store);

  useEffect(() => {
    setChatStore(getChatsStore());
    const unsubscribe = subscribeChatsStore((nextStore) => {
      setChatStore(nextStore);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    chatStore,
    setChatStore,
    selectedNodeId: chatStore?.tree?.selectedNodeId || null,
  };
};

export default useChatTreeStore;
