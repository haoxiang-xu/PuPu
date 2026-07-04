import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_CALIB,
  buildHeights,
  calibrate,
  cumulativeOffsets,
} from "../minimap_geometry";

// 维护高度缓存 + 校准,派生 minimap 的 segment 数据(content 坐标)。
// 不负责 scale/scroll —— 那是 MessageMinimap 组件的命令式职责。
export const useMessageMinimap = ({
  chatId,
  messages,
  messageNodeRefs,
  safeVisibleStart,
  isStreaming = false,
}) => {
  const heightCacheRef = useRef(new Map());
  const calibRef = useRef(DEFAULT_CALIB);
  const [version, setVersion] = useState(0);

  // 最新 messages / isStreaming 存进 ref,让 measure 保持稳定身份(见下)。
  // measure 从 ref 读而非闭包捕获 → 追加 trace frame 不换新 measure。
  const latestMessagesRef = useRef(messages);
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    latestMessagesRef.current = messages;
    isStreamingRef.current = isStreaming;
  });

  // chat 切换:高度按 chat 隔离,清空缓存与校准
  useEffect(() => {
    heightCacheRef.current = new Map();
    calibRef.current = DEFAULT_CALIB;
    setVersion((v) => v + 1);
  }, [chatId]);

  // 从当前挂载节点读真实高度写入缓存。
  // 身份稳定:deps 只留 messageNodeRefs(ref 本身稳定);messages 从 ref 读,故追加
  // trace frame 不会换新 measure → MessageMinimap 大 effect 不因 measure 换新而重初始化。
  // 流式(lite)模式:只写高度缓存,跳过 calibrate + setVersion —— React 全程不参与,
  // 几何准确性由 MessageMinimap 命令式用真实 offsetHeight 补偿。
  // forceConverge:流式结束下降沿强制收敛(即便缓存本轮无变化,也重算校准并 bump)。
  const measure = useCallback(
    (opts) => {
      const forceConverge = !!(opts && opts.forceConverge);
      const cache = heightCacheRef.current;
      const msgs = latestMessagesRef.current;
      let changed = false;
      messageNodeRefs.current.forEach((node, index) => {
        if (!node) return;
        const msg = msgs[index];
        if (!msg) return;
        const h = node.offsetHeight;
        if (h > 0 && cache.get(msg.id) !== h) {
          cache.set(msg.id, h);
          changed = true;
        }
      });
      if (!changed && !forceConverge) return;
      // lite:流式期间只写缓存,不惊动 React(收敛留给下降沿的 forceConverge)
      if (isStreamingRef.current && !forceConverge) return;
      const samples = [];
      msgs.forEach((m) => {
        const h = cache.get(m.id);
        if (typeof h === "number") {
          samples.push({ len: (m.content || "").length, height: h });
        }
      });
      calibRef.current = calibrate(samples, DEFAULT_CALIB);
      setVersion((v) => v + 1);
    },
    [messageNodeRefs],
  );

  // 流式结束下降沿(true→false):强制完整收敛,吸收 lite 期间缓存里累积、但从未
  // 反映到 version/segments 的真实高度。
  const prevStreamingRef = useRef(isStreaming);
  useEffect(() => {
    const was = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;
    if (was && !isStreaming) {
      // 此刻 isStreamingRef 已同步为 false,forceConverge 亦绕过 streaming 检查
      measure({ forceConverge: true });
    }
  }, [isStreaming, measure]);

  // 结构签名:长度 + 首/尾 message id。流式追加 trace frame(数组换新、长度与首尾
  // 不变)→ 签名不变;新消息加入 → 签名变。
  const structureSignature = useMemo(() => {
    const n = messages.length;
    const firstId = n ? messages[0].id : "";
    const lastId = n ? messages[n - 1].id : "";
    return `${n}|${firstId}|${lastId}`;
  }, [messages]);

  // 派生 segments(content 坐标)。依赖签名 + version:measure(非流式)/换 chat 后
  // 重算;流式 lite 期间既不 bump version、签名又不变 → segments 身份稳定,
  // 下游 MessageMinimap effect 不再每帧重初始化。
  const { segments, total } = useMemo(() => {
    const heights = buildHeights(messages, heightCacheRef.current, calibRef.current);
    const { offsets, total: tot } = cumulativeOffsets(heights);
    const segs = messages.map((m, i) => ({
      id: m.id,
      role: m.role,
      top: offsets[i],
      height: heights[i],
    }));
    return { segments: segs, total: tot };
    // 签名/version 进入依赖:测量/换 chat/结构变化后重算(见上)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureSignature, version]);

  return { segments, total, measure, safeVisibleStart };
};

export default useMessageMinimap;
