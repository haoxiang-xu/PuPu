import React, {
  useState,
  useEffect,
  useContext,
  use,
} from "react";
import { RootDataContexts } from "../../DATA_MANAGERs/root_data_contexts";
import { RootStatusContexts } from "../../DATA_MANAGERs/root_status_contexts";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const R = 30;
const G = 30;
const B = 30;

const component_name = "side_menu";

/* { Chat Room Section } ------------------------------------------------------------------------------------------------------------------------------------------------------------ */
const Chat_Room_Item = ({ address }) => {
  const {
    addressBook,
    sectionData,
    load_section_data,
    delete_address_in_local_storage,
  } = useContext(RootDataContexts);
  const [onHover, setOnHover] = useState(false);
  const [onDelete, setOnDelete] = useState(false);
  const [containerStyle, setContainerStyle] = useState({
    backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.64)`,
    boxShadow: "none",
    border: "1px solid rgba(255, 255, 255, 0)",
  });
  const [deleteButtonStyle, setDeleteButtonStyle] = useState({
    src: "delete",
    opacity: 0,
  });

  useEffect(() => {
    if (address === sectionData.address) {
      setContainerStyle({
        backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.84)`,
        boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.16)",
        border: "1px solid rgba(255, 255, 255, 0.16)",
      });
      return;
    } else {
      setOnDelete(false);
    }
    if (onHover) {
      setContainerStyle({
        backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0.4)`,
        boxShadow: "none",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      });
    } else {
      setContainerStyle({
        backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0)`,
        boxShadow: "none",
        border: "1px solid rgba(255, 255, 255, 0)",
      });
    }
  }, [onHover, address, sectionData]);
  /* { update delete icon styling when on delete or not on delete } */
  useEffect(() => {
    if (onDelete) {
      setDeleteButtonStyle({
        src: "gray_delete",
        opacity: 0.5,
      });
    } else {
      setDeleteButtonStyle({
        src: "delete",
        opacity: 1,
      });
    }
  }, [onDelete]);

  return (
    <div
      style={{
        transition: "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",
        width: "calc(100% - 24px)",
        height: 28,
        margin: "6px 12px 0 12px",

        borderRadius: 5,
        border: containerStyle.border,
        backgroundColor: containerStyle.backgroundColor,
        boxShadow: containerStyle.boxShadow,
        overflow: "hidden",
      }}
      onMouseEnter={() => {
        setOnHover(true);
      }}
      onMouseLeave={() => {
        setOnHover(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        load_section_data(address);
        setOnDelete(false);
      }}
    >
      <span
        style={{
          transition: "all 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          display: "block",

          transform: "translateY(-50%)",
          top: "50%",
          left: 11,
          width: onDelete ? "calc(100% - 72px)" : "calc(100% - 36px)",

          fontSize: 14,

          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          overflow: "hidden",
          color: `rgba(225, 225, 225, 0.64)`,

          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        {addressBook[address]
          ? addressBook[address].chat_title || address
          : address}
      </span>
      <>
        <Icon
          src="red_circle"
          style={{
            userSelect: "none",
            transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            transform: "translate(-50%, -50%)",
            top: "50%",
            right: -2,
            width: 17,
            height: 17,
            opacity: onDelete && sectionData.address === address ? 1 : 0,
          }}
          onClick={(e) => {
            e.stopPropagation();
            delete_address_in_local_storage(address);
          }}
        />
        <Icon
          src="add"
          style={{
            userSelect: "none",
            transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            transform: "translate(-50%, -50%) rotate(45deg)",
            top: "50%",
            right: onDelete && sectionData.address === address ? 14 : -2,
            width: 17,
            height: 17,
            opacity: onDelete && sectionData.address === address ? 0.5 : 0,
          }}
          onClick={(e) => {
            e.stopPropagation();
            setOnDelete(!onDelete);
          }}
        />
        <Icon
          src={deleteButtonStyle.src}
          style={{
            transition:
              "right 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16), opacity 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            transform: "translate(-50%, -50%)",
            top: "50%",
            right: onDelete && sectionData.address === address ? 32 : -2,
            opacity:
              sectionData.address === address ? deleteButtonStyle.opacity : 0,
            width: 17,
            height: 17,
            userSelect: "none",
          }}
          onClick={(e) => {
            if (sectionData.address === address) {
              e.stopPropagation();
            }
            setOnDelete(!onDelete);
          }}
        />
      </>
    </div>
  );
};
const Chat_Room_List = ({}) => {
  const { start_new_section, addressBook } = useContext(RootDataContexts);

  const [chatRoomItems, setChatRoomItems] = useState([]);

  const [addButtonOnHover, setAddButtonOnHover] = useState(false);
  const [addButtonOnClick, setAddButtonOnClick] = useState(false);
  const [addButtonStyle, setAddButtonStyle] = useState({
    backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0)`,
    border: "1px solid rgba(255, 255, 255, 0)",
  });

  useEffect(() => {
    if (addButtonOnClick) {
      setAddButtonStyle({
        backgroundColor: `rgba(${R + 60}, ${G + 60}, ${B + 60}, 0.84)`,
        border: "1px solid rgba(255, 255, 255, 1)",
      });
    } else if (addButtonOnHover) {
      setAddButtonStyle({
        backgroundColor: `rgba(${R + 60}, ${G + 60}, ${B + 60}, 0.64)`,
        border: "1px solid rgba(255, 255, 255, 0.64)",
      });
    } else {
      setAddButtonStyle({
        backgroundColor: `rgba(${R + 30}, ${G + 30}, ${B + 30}, 0)`,
        border: "1px solid rgba(255, 255, 255, 0)",
      });
    }
  }, [addButtonOnHover, addButtonOnClick]);
  useEffect(() => {
    if (addressBook && Array.isArray(addressBook.avaliable_addresses)) {
      setChatRoomItems(
        addressBook.avaliable_addresses.map((address, index) => (
          <Chat_Room_Item key={index} address={address} />
        ))
      );
    }
  }, [addressBook]);
  return (
    <div
      style={{
        position: "absolute",

        top: 50,
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 32,

        overflowX: "hidden",
        overflowY: "auto",
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <Icon
        className="add_chat_section_button"
        src="add"
        style={{
          transition: "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          userSelect: "none",
          position: "absolute",
          top: 0,
          right: 13,

          width: 16,
          height: 16,
          padding: 4,

          borderRadius: 4,
          backgroundColor: addButtonStyle.backgroundColor,
          border: addButtonStyle.border,

          opacity: 0.64,
        }}
        onMouseEnter={() => {
          setAddButtonOnHover(true);
        }}
        onMouseLeave={() => {
          setAddButtonOnHover(false);
          setAddButtonOnClick(false);
        }}
        onMouseDown={() => {
          setAddButtonOnClick(true);
        }}
        onMouseUp={() => {
          setAddButtonOnClick(false);
        }}
        onClick={() => {
          start_new_section();
        }}
      ></Icon>
      <span
        style={{
          position: "absolute",
          top: 3,
          left: 14,

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
      {chatRoomItems}
    </div>
  );
};
/* { Chat Room Section } ------------------------------------------------------------------------------------------------------------------------------------------------------------ */

const Side_Menu = ({}) => {
  const { windowWidth, componentOnFocus, setComponentOnFocus } =
    useContext(RootStatusContexts);
  const [iconStyle, setIconStyle] = useState({});
  const [menuStyle, setMenuStyle] = useState({
    width: 0,
    borderRight: "0px solid rgba(255, 255, 255, 0)",
  });

  useEffect(() => {
    if (componentOnFocus === component_name) {
      if (window.innerWidth * 0.25 > 256) {
        setMenuStyle({
          width: window.innerWidth * 0.25,
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
        });
        setIconStyle({
          src: "arrow",
          top: 16,
          left: window.innerWidth * 0.25 - 26,
          transform: "translate(-50%, -50%) rotate(180deg)",
        });
      } else {
        setMenuStyle({
          width: 256,
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
        });
        setIconStyle({
          src: "arrow",
          top: 16,
          left: 256 - 26,
          transform: "translate(-50%, -50%) rotate(180deg)",
        });
      }
    } else {
      setMenuStyle({
        width: 0,
        borderRight: "0px solid rgba(255, 255, 255, 0)",
      });
      setIconStyle({
        src: "side_menu",
        top: 20,
        left: 18,
        transform: "translate(-50%, -50%)",
      });
    }
  }, [windowWidth, componentOnFocus]);

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

          backgroundColor: `rgba(${R}, ${G}, ${B}, 0.64)`,
          backdropFilter: "blur(36px)",
        }}
      >
        <Chat_Room_List />
      </div>
      <div
        className="icon-container"
        style={{
          transition:
            "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16), left 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "fixed",
          transform: iconStyle.transform,

          top: iconStyle.top,
          left: iconStyle.left,
        }}
      >
        <Icon
          src={iconStyle.src}
          style={{
            userSelect: "none",
            height: 20,
            opacity: 0.5,
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (componentOnFocus === component_name) {
              setComponentOnFocus("");
            } else {
              setComponentOnFocus(component_name);
            }
          }}
        />
      </div>
    </div>
  );
};

export default Side_Menu;
