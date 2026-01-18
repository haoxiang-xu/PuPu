import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
} from "react";

import { UNIQUE_KEY } from "../../../CONTAINERs/root_consts";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

import { ConfigContexts } from "../../../CONTAINERs/config/contexts";
import { DataContexts } from "../../../CONTAINERs/data/contexts";
import { StatusContexts } from "../../../CONTAINERs/status/contexts";

import storage from "../../../utils/storage";

const LocalStoragePanelContexts = createContext("");

const Address_Size_Item = ({ index, title, size, address }) => {
  const { RGB, colorOffset, modelDownloader } = useContext(ConfigContexts);
  const { delete_local_storage_item, onSelectLabel, setOnSelectLabel } =
    useContext(LocalStoragePanelContexts);
  const { load_context_menu, unload_context_menu } = useContext(StatusContexts);

  const [onHover, setOnHover] = useState(false);
  const spanRef = useRef(null);
  const tagRef = useRef(null);
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
      ref={tagRef}
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
      onClick={(e) => {
        setOnSelectLabel("");
      }}
      onContextMenu={(e) => {
        load_context_menu(e, 120, [
          {
            img_src: "delete",
            label: "Delete",
            onClick: () => {
              delete_local_storage_item(address);
              unload_context_menu();
            },
          },
        ]);
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
          transition:
            "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), opacity 0.36s",
          position: "absolute",
          transform: "translate(0, -50%)",
          top: "50%",
          left: spanWidth + 12,
          maxWidth: "calc(50%)",
          maxHeight: "100%",
          color: `rgba(${RGB.R + colorOffset.font}, ${
            RGB.G + colorOffset.font
          }, ${RGB.B + colorOffset.font}, 1)`,
          fontSize: 14,
          userSelect: "none",
          overflow: "hidden",
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
            load_context_menu(
              e,
              120,
              [
                {
                  img_src: "delete",
                  label: "Delete",
                  onClick: () => {
                    delete_local_storage_item(address);
                    unload_context_menu();
                  },
                },
              ],
              tagRef.current?.getBoundingClientRect().x +
                tagRef.current?.offsetWidth -
                36,
              tagRef.current?.getBoundingClientRect().y + 36
            );
          }}
        />
      )}
    </div>
  );
};
const Address_Size_List = ({ addressSizes }) => {
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
        <Address_Size_Item
          key={index}
          index={index}
          title={addressSize.chat_title}
          size={addressSize.size_in_kb}
          address={addressSize.address}
        />
      ))}
    </div>
  );
};
const Storage_Manager = () => {
  const { modelDownloader, RGB } = useContext(ConfigContexts);
  const { addressBook, delete_address_in_local_storage } =
    useContext(DataContexts);

  const [localStorageSize, setLocalStorageSize] = useState(0);
  const [addressSizes, setAddressSizes] = useState([]);
  const [spanWidth, setSpanWidth] = useState(0);
  const spanRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [onSelectLabel, setOnSelectLabel] = useState("");

  const get_storage_size = async () => {
    const totalSizeInMB = await storage.getSize();
    return totalSizeInMB;
  };
  const calculate_chat_messages_size = useCallback(async () => {
    const sectionSizes = await storage.getSectionSizes();
    const chatMessages = {};

    chatMessages["System Data"] = {
      size_in_kb: 0,
      chat_title: "System Data",
    };

    for (let i = 0; i < sectionSizes.length; i++) {
      const section = sectionSizes[i];
      const address = section.address;
      let chat_title = "unknown";
      
      if (addressBook.avaliable_addresses.includes(address)) {
        chat_title = addressBook[address]?.chat_title;
      }
      
      if (chat_title === "unknown") {
        chatMessages["System Data"].size_in_kb += section.size_in_kb;
      } else {
        chatMessages[address] = {
          size_in_kb: section.size_in_kb,
          chat_title: chat_title,
        };
      }
    }
    
    let chatMessagesArray = [];

    for (let key in chatMessages) {
      let chat_message = chatMessages[key];
      chat_message["address"] = key;
      chatMessagesArray.push(chat_message);
    }
    chatMessagesArray.sort((a, b) => b.size_in_kb - a.size_in_kb);

    return chatMessagesArray;
  }, [addressBook]);
  const delete_local_storage_item = async (address) => {
    await delete_address_in_local_storage(address);
    const size = await get_storage_size();
    setLocalStorageSize(size);
    const sizes = await calculate_chat_messages_size();
    setAddressSizes(sizes);
  };
  useEffect(() => {
    const loadStorageData = async () => {
      const size = await get_storage_size();
      setLocalStorageSize(size);
      const sizes = await calculate_chat_messages_size();
      setAddressSizes(sizes);
      setIsLoaded(true);
    };
    loadStorageData();
  }, [calculate_chat_messages_size]);
  useEffect(() => {
    if (spanRef.current) {
      setSpanWidth(spanRef.current.offsetWidth);
    }
  }, [localStorageSize]);

  if (!isLoaded) {
    return null;
  }
  return (
    <LocalStoragePanelContexts.Provider
      value={{ delete_local_storage_item, onSelectLabel, setOnSelectLabel }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
        }}
        onClick={() => {
          setOnSelectLabel("");
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
            backgroundColor: `rgba(${RGB.R - 8}, ${RGB.G - 8}, ${RGB.B - 6}, 1)`,
          }}
        >
          {localStorageSize}
        </span>
        <Address_Size_List addressSizes={addressSizes} />
      </div>
    </LocalStoragePanelContexts.Provider>
  );
};

export { Storage_Manager };
