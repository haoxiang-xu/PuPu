import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
} from "react";
import { RootDataContexts } from "../root_data_contexts";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const R = 30;
const G = 30;
const B = 30;

const Chat_Room_Record = ({ chat_room_id }) => {
  const {
    chatRoomID,
    setChatRoomID,
    generateUniqueID,
    historicalMessages,
    setHistoricalMessages,
  } = useContext(RootDataContexts);
  const [onHover, setOnHover] = useState(false);
  const [onDelete, setOnDelete] = useState(false);
  const [style, setStyle] = useState({
    backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.64)`,
  });

  useEffect(() => {
    if (chat_room_id === chatRoomID) {
      setStyle({
        backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.84)`,
        boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.16)",
      });
      return;
    } else {
      setOnDelete(false);
    }
    if (onHover) {
      setStyle({
        backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.4)`,
        boxShadow: "none",
      });
    } else {
      setStyle({
        backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0)`,
        boxShadow: "none",
      });
    }
  }, [onHover, chatRoomID, chat_room_id]);
  const messages_on_deleted = useCallback(() => {
    setHistoricalMessages((prev) => {
      const newHistoricalMessages = { ...prev };
      delete newHistoricalMessages[chat_room_id];
      localStorage.setItem(
        "AI_lounge_historical_messages",
        JSON.stringify(newHistoricalMessages)
      );
      return newHistoricalMessages;
    });
    if (chatRoomID === chat_room_id) {
      setChatRoomID(generateUniqueID());
    }
  }, [chat_room_id, chatRoomID, historicalMessages]);

  return (
    <div
      style={{
        transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",
        width: "calc(100% - 18px)",
        height: 28,
        margin: "6px 12px 0 6px",

        borderRadius: 5,
        backgroundColor: style.backgroundColor,
        boxShadow: style.boxShadow,
        overflow: "hidden",
      }}
      onMouseEnter={() => {
        setOnHover(true);
      }}
      onMouseLeave={() => {
        setOnHover(false);
      }}
      onClick={() => {
        setChatRoomID(chat_room_id);
      }}
    >
      <span
        style={{
          position: "absolute",
          display: "block",

          transform: "translateY(-50%)",
          top: "50%",
          left: 11,
          width: "calc(100% - 36px)",

          fontSize: 14,

          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
          color: `rgba(225, 225, 225, 0.64)`,

          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        {chat_room_id}
      </span>
      <Icon
        src="circle"
        style={{
          transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          transform: "translate(-50%, -50%)",
          top: "50%",
          right: -2,
          width: 17,
          height: 17,
          opacity: onDelete && chatRoomID === chat_room_id ? 0.64 : 0,
        }}
        onClick={(e) => {
          e.stopPropagation();
          messages_on_deleted();
        }}
      />
      <Icon
        src="add"
        style={{
          transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          transform: "translate(-50%, -50%) rotate(45deg)",
          top: "50%",
          right: onDelete && chatRoomID === chat_room_id ? 14 : -2,
          width: 17,
          height: 17,
          opacity: onDelete && chatRoomID === chat_room_id ? 0.64 : 0,
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOnDelete(!onDelete);
        }}
      />
      {chatRoomID === chat_room_id ? (
        <Icon
          src="delete"
          style={{
            transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            transform: "translate(-50%, -50%)",
            top: "50%",
            right: onDelete && chatRoomID === chat_room_id ? 32 : -2,
            width: 17,
            height: 17,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setOnDelete(!onDelete);
          }}
        />
      ) : null}
    </div>
  );
};
const Chat_Room_List = ({}) => {
  const { historicalMessages } = useContext(RootDataContexts);

  return (
    <div
      style={{
        position: "absolute",

        top: 50,
        left: 0,
        right: 0,
        bottom: 0,

        overflowX: "hidden",
      }}
    >
      <Icon
        src="add"
        style={{
          position: "absolute",
          top: 4,
          right: 19,

          width: 16,
          height: 16,

          opacity: 0.64,
        }}
      ></Icon>
      <span
        style={{
          position: "relative",
          top: 0,
          left: 12,

          fontSize: 14,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: `rgba(255, 255, 255, 0.32)`,

          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        Chat Rooms
      </span>
      {Object.keys(historicalMessages).map((chat_room_id, index) => (
        <Chat_Room_Record key={index} chat_room_id={chat_room_id} />
      ))}
    </div>
  );
};

const Side_Menu = ({}) => {
  const [iconStyle, setIconStyle] = useState({
    left: 12,
  });
  const [menuStyle, setMenuStyle] = useState({
    width: 0,
    borderRight: "0px solid rgba(255, 255, 255, 0)",
  });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);
  useEffect(() => {
    if (isExpanded) {
      if (window.innerWidth * 0.25 > 256) {
        setMenuStyle({
          width: window.innerWidth * 0.25,
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
        });
        setIconStyle({
          top: "50%",
          left: window.innerWidth * 0.25 - 16,
          transform: "translate(-50%, -50%) rotate(180deg)",
        });
      } else {
        setMenuStyle({
          width: 256,
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
        });
        setIconStyle({
          top: "50%",
          left: 256 - 16,
          transform: "translate(-50%, -50%) rotate(180deg)",
        });
      }
    } else {
      setMenuStyle({
        width: 0,
        borderRight: "0px solid rgba(255, 255, 255, 0)",
      });
      setIconStyle({
        top: "calc(50% - 8px)",
        left: 12,
        transform: "translate(-50%, -50%)",
      });
    }
  }, [isExpanded, windowWidth]);

  return (
    <div>
      <div
        className="scrolling-space"
        style={{
          transition: "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "fixed",

          top: 0,
          left: 0,
          bottom: 0,

          width: menuStyle.width,

          boxSizing: "border-box",
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
          scrollBehavior: "smooth",

          backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.16)`,
          backdropFilter: "blur(36px)",
        }}
      >
        <Chat_Room_List />
      </div>
      <div
        className="icon-container"
        style={{
          transition:
            "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16), left 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16), transform 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "fixed",
          transform: iconStyle.transform,

          top: "50%",
          left: iconStyle.left,
        }}
      >
        <Icon
          src="arrow"
          style={{
            userSelect: "none",
            height: 20,
            opacity: isExpanded ? 0.5 : 0.32,
          }}
          onClick={() => {
            setIsExpanded(!isExpanded);
          }}
        />
      </div>
    </div>
  );
};

export default Side_Menu;
