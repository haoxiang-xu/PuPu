/**
 * done 边沿双写合并(2026-07 B 批性能)。
 *
 * 流结束时有两个持久化路径写同一份 final messages:
 *   1. finalizeStreamPersist —— onDone 里同步 setChatMessages(防抖 effect 可能被
 *      饿死导致丢最后一条回复,所以它必须保留);
 *   2. chat.js 的消息持久化 effect —— done 后 session.messages 变化(flushSync 把
 *      与 finalize 相同的数组引用 set 进去),delay=0 再整库写一次(实测 ~47ms)。
 *
 * 合并方式:finalize 成功写盘后按 (chatId, 数组引用) 打标;effect 落盘前 consume,
 * 命中则跳过本次写。引用比对 + 一次性消费,fail-open:任何不匹配(别的 chat、
 * subagent 链路换了数组引用、后续真实变更)都照常落盘,最坏情况 = 现行为(双写)。
 * 绝不会漏写新数据。
 */

let lastFinalized = null; // { chatId, messages }

export const markStreamFinalizedPersist = (chatId, messages) => {
  if (!chatId || !Array.isArray(messages)) {
    return;
  }
  lastFinalized = { chatId, messages };
};

export const consumeStreamFinalizedPersist = (chatId, messages) => {
  if (
    !lastFinalized ||
    lastFinalized.chatId !== chatId ||
    lastFinalized.messages !== messages
  ) {
    return false;
  }
  lastFinalized = null;
  return true;
};

export const clearStreamFinalizedPersist = () => {
  lastFinalized = null;
};
