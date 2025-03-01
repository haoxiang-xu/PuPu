import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
} from "react";

import { UNIQUE_KEY } from "../../CONTAINERs/root_consts";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

const LocalStoragePanel = () => {
  const { modelDownloader, RGB } = useContext(ConfigContexts);
  const { addressBook } = useContext(DataContexts);

  const [localStorageSize, setLocalStorageSize] = useState(0);
  const [spanWidth, setSpanWidth] = useState(0);
  const spanRef = useRef(null);

  const get_local_storage_size = () => {
    let totalSize = 0;

    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        const itemSize = localStorage[key].length * 2;
        totalSize += itemSize;
      }
    }
    const totalSizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    return totalSizeInMB;
  };
  const calculate_chat_messages_size = useCallback(() => {
    const extractAfter = (str, keyword) => {
      let start = str.indexOf(keyword);
      return start !== -1 ? str.substring(start + keyword.length) : null;
    };
    const get_largest_storage_items = () => {
      let items = [];
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          const size = (localStorage[key].length * 2) / 1024; // KB
          items.push({ key, size: size });
        }
      }
      items.sort((a, b) => b.size - a.size);
      return items;
    };
    const rawItems = get_largest_storage_items();
    const chatMessages = {};

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      let processed_key = extractAfter(item.key, UNIQUE_KEY);
      if (!processed_key) {
        continue;
      }
      processed_key = processed_key.split("_")[0];
      let chat_title = "unknown";
      if (processed_key in chatMessages) {
        chatMessages[processed_key].size_in_kb += item.size;
      } else {
        if (addressBook.avaliable_addresses.includes(processed_key)) {
          chat_title = addressBook[processed_key].chat_title;
        }
        chatMessages[processed_key] = {
          size_in_kb: item.size,
          chat_title: chat_title,
        };
      }
    }
  }, [addressBook]);
  useEffect(() => {
    setLocalStorageSize(get_local_storage_size());
    calculate_chat_messages_size();
  }, []);
  useEffect(() => {
    if (spanRef.current) {
      setSpanWidth(spanRef.current.offsetWidth);
    }
  }, [localStorageSize]);

  return (
    <div>
      <span
        style={{
          transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 6,
          left: spanWidth + 8,
          fontSize: 32,
          fontFamily: "inherit",
          color: modelDownloader.color,
          userSelect: "none",
          pointerEvents: "none",
          border: "1px solid rgba(0, 0, 0, 0)",
          padding: "1px 0px",
        }}
      >
        MB
      </span>
      <span
        style={{
          transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 23,
          left: spanWidth + 54,
          fontSize: 16,
          fontFamily: "inherit",
          color: modelDownloader.color,
          userSelect: "none",
          pointerEvents: "none",
          border: "1px solid rgba(0, 0, 0, 0)",
          padding: "1px 0px",
        }}
      >
        chat messages
      </span>
      <span
        ref={spanRef}
        style={{
          position: "absolute",
          top: 6,
          left: 5,
          fontSize: 32,
          fontFamily: "inherit",
          color: modelDownloader.color,
          userSelect: "none",
          pointerEvents: "none",
          border: modelDownloader.border,
          padding: "1px 8px",
          borderRadius: 8,
          backgroundColor: `rgba(${RGB.R}, ${RGB.G}, ${RGB.B}, 1)`,
        }}
      >
        {localStorageSize}
      </span>
    </div>
  );
};

export { LocalStoragePanel };
