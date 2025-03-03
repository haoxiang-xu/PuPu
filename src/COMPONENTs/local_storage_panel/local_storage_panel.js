import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
} from "react";

import { UNIQUE_KEY } from "../../CONTAINERs/root_consts";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import MoreOptionMenu from "../more_option_menu/more_option_menu";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

const LocalStoragePanelContexts = createContext("");

const AddressSizesItem = ({
  index,
  title,
  size,
  address,
  onSelectLabel,
  setOnSelectLabel,
}) => {
  const { RGB, colorOffset, modelDownloader } = useContext(ConfigContexts);
  const { delete_local_storage_item } = useContext(LocalStoragePanelContexts);

  const [onHover, setOnHover] = useState(false);
  const spanRef = useRef(null);
  const [spanWidth, setSpanWidth] = useState(0);
  const [spanOpacity, setSpanOpacity] = useState(0);
  const [formatedSize, setFormatedSize] = useState("");
  useEffect(() => {
    setTimeout(() => {
      if (spanRef.current) {
        setSpanOpacity(1);
        setSpanWidth(spanRef.current.offsetWidth);
      }
    }, 80);
  }, [title, size]);
  useEffect(() => {
    const unit = ["KB", "MB", "GB", "TB"];
    let unitIndex = 0;
    let formatedSize = size;
    while (formatedSize >= 1024 && unitIndex < unit.length - 1) {
      formatedSize /= 1024;
      unitIndex++;
    }
    setFormatedSize(`${formatedSize.toFixed(2)} ${unit[unitIndex]}`);
  }, [size]);

  return (
    <div
      style={{
        position: "relative",
        width: "calc(100% - 12px)",
        height: 45,
        marginTop: index === 0 ? 32 : 0,
        borderRadius: 5,
        backgroundColor: onHover
          ? `rgba(${RGB.R + colorOffset.middle_ground}, ${
              RGB.G + colorOffset.middle_ground
            }, ${RGB.B + colorOffset.middle_ground}, 0.64)`
          : "transparent",
        border: onHover ? modelDownloader.border : "1px solid #00000000",
        boxShadow: "none",
        cursor: "pointer",
      }}
      onMouseEnter={() => {
        setOnHover(true);
      }}
      onMouseLeave={() => {
        setOnHover(false);
      }}
      onClick={() => {
        setOnSelectLabel("");
      }}
    >
      <span
        ref={spanRef}
        style={{
          position: "absolute",
          transform: "translate(0, -50%)",
          top: "50%",
          left: 6,
          color: `rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,
          fontSize: 14,
          padding: "1px 8px",
          borderRadius: 4,
          border: modelDownloader.border,
          userSelect: "none",
        }}
      >
        {formatedSize}
      </span>
      <span
        style={{
          transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), opacity 0.36s",
          position: "absolute",
          transform: "translate(0, -50%)",
          top: "50%",
          left: spanWidth + 12,
          maxWidth: "calc(50%)",
          color: `rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,
          fontSize: 14,
          userSelect: "none",
          opacity: spanOpacity,
        }}
      >
        {title}
      </span>
      {title === "System Data" ? null : (
        <Icon
          src={"more"}
          style={{
            position: "absolute",
            transform: "translate(0, -50%)",
            top: "50%",
            right: 12,
            height: 18,
            opacity: onHover ? 1 : 0.72,
            userSelect: "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setOnSelectLabel(address);
          }}
        />
      )}
      {onSelectLabel !== address ? null : (
        <div style={{
            position: "absolute",
            top: 8,
            right: 10,

        }}>
        <MoreOptionMenu
          width={120}
          options={[
            {
              img_src: "delete",
              label: "Delete",
              onClick: () => {
                delete_local_storage_item(address);
              },
            },
          ]}
        />
        </div>
      )}
    </div>
  );
};
const AddressSizesTable = ({ addressSizes }) => {
  const [onSelectLabel, setOnSelectLabel] = useState("");
  return (
    <div
      className="scrolling-space"
      style={{
        position: "absolute",
        top: 60,
        left: 12,
        width: "calc(100% - 18px)",
        bottom: 6,

        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      {addressSizes.map((addressSize, index) => (
        <AddressSizesItem
          key={index}
          index={index}
          title={addressSize.chat_title}
          size={addressSize.size_in_kb}
          address={addressSize.address}
          onSelectLabel={onSelectLabel}
          setOnSelectLabel={setOnSelectLabel}
        />
      ))}
    </div>
  );
};
const LocalStoragePanel = () => {
  const { modelDownloader, RGB } = useContext(ConfigContexts);
  const { addressBook, delete_address_in_local_storage } =
    useContext(DataContexts);

  const [localStorageSize, setLocalStorageSize] = useState(0);
  const [addressSizes, setAddressSizes] = useState([]);
  const [spanWidth, setSpanWidth] = useState(0);
  const spanRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);

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

    chatMessages["System Data"] = {
      size_in_kb: 0,
      chat_title: "System Data",
    };

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
          chat_title = addressBook[processed_key]?.chat_title;
        }
        if (chat_title === "unknown") {
          chatMessages["System Data"].size_in_kb += item.size;
        } else {
          chatMessages[processed_key] = {
            size_in_kb: item.size,
            chat_title: chat_title,
          };
        }
      }
    }
    console.log(chatMessages);

    let chatMessagesArray = [];

    for (let key in chatMessages) {
      let chat_message = chatMessages[key];
      chat_message["address"] = key;
      chatMessagesArray.push(chat_message);
    }
    chatMessagesArray.sort((a, b) => b.size_in_kb - a.size_in_kb);

    return chatMessagesArray;
  }, [addressBook]);
  const delete_local_storage_item = (address) => {
    for (let key in localStorage) {
      if (key.includes(address)) {
        localStorage.removeItem(key);
      }
    }
    delete_address_in_local_storage(address);
    setLocalStorageSize(get_local_storage_size());
    setAddressSizes(calculate_chat_messages_size());
  };
  useEffect(() => {
    setLocalStorageSize(get_local_storage_size());
    setAddressSizes(calculate_chat_messages_size());
    setIsLoaded(true);
  }, []);
  useEffect(() => {
    if (spanRef.current) {
      setSpanWidth(spanRef.current.offsetWidth);
    }
  }, [localStorageSize]);

  if (!isLoaded) {
    return null;
  }
  return (
    <LocalStoragePanelContexts.Provider value={{ delete_local_storage_item }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
        }}
      >
        <span
          style={{
            transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            top: 6,
            left: spanWidth + 14,
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
            left: spanWidth + 60,
            fontSize: 16,
            fontFamily: "inherit",
            fontWeight: 600,
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
            left: 12,
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
        <AddressSizesTable addressSizes={addressSizes} />
      </div>
    </LocalStoragePanelContexts.Provider>
  );
};

export { LocalStoragePanel };
