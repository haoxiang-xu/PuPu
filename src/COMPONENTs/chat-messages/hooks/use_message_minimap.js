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
}) => {
  const heightCacheRef = useRef(new Map());
  const calibRef = useRef(DEFAULT_CALIB);
  const [version, setVersion] = useState(0);

  // chat 切换:高度按 chat 隔离,清空缓存与校准
  useEffect(() => {
    heightCacheRef.current = new Map();
    calibRef.current = DEFAULT_CALIB;
    setVersion((v) => v + 1);
  }, [chatId]);

  // 从当前挂载节点读真实高度写入缓存;有变化则重算校准并 bump
  const measure = useCallback(() => {
    const cache = heightCacheRef.current;
    let changed = false;
    messageNodeRefs.current.forEach((node, index) => {
      if (!node) return;
      const msg = messages[index];
      if (!msg) return;
      const h = node.offsetHeight;
      if (h > 0 && cache.get(msg.id) !== h) {
        cache.set(msg.id, h);
        changed = true;
      }
    });
    if (changed) {
      const samples = [];
      messages.forEach((m) => {
        const h = cache.get(m.id);
        if (typeof h === "number") {
          samples.push({ len: (m.content || "").length, height: h });
        }
      });
      calibRef.current = calibrate(samples, DEFAULT_CALIB);
      setVersion((v) => v + 1);
    }
  }, [messages, messageNodeRefs]);

  // 派生 segments(content 坐标)
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
    // version 进入依赖:测量/换 chat 后重算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, version]);

  return { segments, total, measure, safeVisibleStart };
};

export default useMessageMinimap;
