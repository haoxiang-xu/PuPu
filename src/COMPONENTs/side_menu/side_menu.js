import React, {
  useState,
  useRef,
  useEffect,
  useContext,
  createContext,
  use,
} from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";

import Context_Menu from "../context_menu/context_menu";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const component_name = "side_menu";

const Contexts = createContext();

/* { Chat Button Function Panel } --------------------------------------------------------------------------------------------------------------------------------------------------- */
const Bottom_Function_Panel_Theme_Switch = ({}) => {
  const { theme, setTheme, switchs } = useContext(ConfigContexts);
  return (
    <div
      style={{
        position: "absolute",
        transform: "translate(0%, -50%)",
        top: "50%",
        left: 32,

        width: 38,
        height: 24,

        borderRadius: 32,
        border: switchs.border,
        backgroundColor: switchs.backgroundColor,
        boxShadow: "inset 0 0 12px rgba(0, 0, 0, 0.16)",
        cursor: "pointer",
      }}
      onClick={() => {
        setTheme((prev) =>
          prev === "light_theme" ? "dark_theme" : "light_theme"
        );
      }}
    >
      <Icon
        src="sun"
        style={{
          transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          transform: "translate(0%, -50%)",
          top: theme === "light_theme" ? "50%" : "200%",
          left: -24,
          width: 18,
          height: 18,
          userSelect: "none",
          opacity: 0.8,
        }}
      />
      <Icon
        src="moon"
        style={{
          transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          transform: "translate(0%, -50%)",
          top: theme === "light_theme" ? "200%" : "50%",
          left: -24,
          width: 18,
          height: 18,
          userSelect: "none",
          opacity: 0.8,
        }}
      />
      <div
        style={{
          transition: "all 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          transform: "translate(0%, -50%)",
          top: "50%",
          left: theme === "light_theme" ? 3 : 16,

          width: 19,
          height: 19,

          borderRadius: 32,
          backgroundColor: switchs.toggle.backgroundColor,
        }}
      ></div>
    </div>
  );
};
const Bottom_Function_Panel = ({ width }) => {
  const { setOnDialog, setComponentOnFocus } = useContext(StatusContexts);
  return (
    <div
      style={{
        transition: "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "absolute",
        bottom: 0,
        left: 0,

        width: width,
        height: 40,
        overflow: "hidden",
      }}
    >
      <Icon
        src="settings"
        style={{
          position: "absolute",
          transform: "translate(0%, -50%)",

          top: "50%",
          right: 10,

          width: 20,
          height: 20,
          opacity: 0.8,
          cursor: "pointer",
        }}
        onClick={() => {
          setOnDialog("setting");
          setComponentOnFocus("setting");
        }}
      />
      <Bottom_Function_Panel_Theme_Switch />
    </div>
  );
};
/* { Chat Button Function Panel } --------------------------------------------------------------------------------------------------------------------------------------------------- */

const Chat_List_Item = ({ address }) => {
  const { RGB, sideMenu } = useContext(ConfigContexts);
  const {
    update_title,
    addressBook,
    sectionData,
    load_section_data,
    delete_address_in_local_storage,
  } = useContext(DataContexts);
  const { load_context_menu, unload_context_menu } = useContext(StatusContexts);
  const {
    onSelectAddress,
    setOnSelectAddress,
    onRenameAddress,
    setOnRenameAddress,
  } = useContext(Contexts);
  const [onHover, setOnHover] = useState(false);

  const inputRef = useRef(null);
  const tagRef = useRef(null);
  const [renameValue, setRenameValue] = useState("");
  useEffect(() => {
    if (onRenameAddress === address && inputRef.current) {
      inputRef.current.focus();
      setTimeout(() => {
        inputRef.current?.select();
      }, 32);
      setRenameValue(
        addressBook[address]
          ? addressBook[address].chat_title || address
          : address
      );
    }
  }, [onRenameAddress, address]);

  const [containerStyle, setContainerStyle] = useState({
    backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0.64)`,
    boxShadow: "none",
    border: "1px solid rgba(255, 255, 255, 0)",
  });

  useEffect(() => {
    if (address === sectionData.address) {
      setContainerStyle({
        backgroundColor: sideMenu.chat_room_item.backgroundColor_onActive,
        boxShadow: sideMenu.chat_room_item.boxShadow_onActive,
        border: sideMenu.chat_room_item.border_onActive,
      });
      return;
    }
    if (onHover) {
      setContainerStyle({
        backgroundColor: sideMenu.chat_room_item.backgroundColor_onHover,
        boxShadow: "none",
        border: sideMenu.chat_room_item.border_onHover,
      });
    } else {
      setContainerStyle({
        backgroundColor: "rgba(0, 0, 0, 0)",
        boxShadow: "none",
        border: "1px solid rgba(255, 255, 255, 0)",
      });
    }
  }, [onHover, address, sectionData, sideMenu]);

  return (
    <div
      ref={tagRef}
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
        cursor: onSelectAddress === address ? "cursor" : "pointer",
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
        setOnSelectAddress(null);
        unload_context_menu();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setOnRenameAddress(address);
      }}
      onContextMenu={(e) => {
        load_context_menu(e, 180, [
          {
            img_src: "rename",
            label: "Rename",
            onClick: () => {
              setOnRenameAddress(address);
              unload_context_menu();
            },
          },
          {
            img_src: "delete",
            label: "Delete",
            onClick: () => {
              delete_address_in_local_storage(address);
              unload_context_menu();
            },
          },
        ]);
      }}
    >
      <Icon
        src={"more"}
        style={{
          position: "absolute",
          transform: "translate(-50%, -50%)",
          top: "50%",
          right: 0,
          width: 17,
          height: 17,
          opacity: 0.64,

          userSelect: "none",
          cursor: "pointer",
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (onSelectAddress === address) {
            setOnSelectAddress(null);
          } else {
            setOnSelectAddress(address);
          }
          load_context_menu(
            e,
            180,
            [
              {
                img_src: "rename",
                label: "Rename",
                onClick: () => {
                  setOnRenameAddress(address);
                  unload_context_menu();
                },
              },
              {
                img_src: "delete",
                label: "Delete",
                onClick: () => {
                  delete_address_in_local_storage(address);
                  unload_context_menu();
                },
              },
            ],
            tagRef.current?.getBoundingClientRect().x +
              tagRef.current?.offsetWidth -
              32,
            tagRef.current?.getBoundingClientRect().y + 28
          );
        }}
      />
      {onRenameAddress === address ? (
        <input
          ref={inputRef}
          style={{
            position: "absolute",
            transform: "translate(0%, -50%)",
            display: "block",
            top: "50%",
            left: 9,

            width: "calc(100% - 40px)",

            fontSize: 14,
            fontFamily: "inherit",
            color: sideMenu.color,

            backgroundColor: "rgba(0, 0, 0, 0)",
            border: "none",
            outline: "none",
          }}
          value={renameValue}
          onChange={(e) => {
            setRenameValue(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setOnRenameAddress(null);
              update_title(address, renameValue);
              setRenameValue("");
            } else if (e.key === "Escape") {
              setOnRenameAddress(null);
              setRenameValue("");
            }
          }}
          onBlur={() => {
            setOnRenameAddress(null);
            setRenameValue("");
          }}
        />
      ) : (
        <span
          style={{
            transition: "all 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            display: "block",

            transform: "translateY(-50%)",
            top: "50%",
            left: 11,
            width: "calc(100% - 40px)",

            fontSize: 14,

            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            overflow: "hidden",
            color: sideMenu.color,

            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {addressBook[address]
            ? addressBook[address].chat_title || address
            : address}
        </span>
      )}
    </div>
  );
};
const Chat_List = ({}) => {
  const { RGB, sideMenu } = useContext(ConfigContexts);
  const { start_new_section, addressBook } = useContext(DataContexts);
  const { componentOnFocus, setComponentOnFocus } = useContext(StatusContexts);

  const [chatRoomItems, setChatRoomItems] = useState([]);

  const [addButtonOnHover, setAddButtonOnHover] = useState(false);
  const [addButtonOnClick, setAddButtonOnClick] = useState(false);
  const [addButtonStyle, setAddButtonStyle] = useState({
    backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0)`,
    border: "1px solid rgba(255, 255, 255, 0)",
  });

  useEffect(() => {
    if (addButtonOnClick) {
      setAddButtonStyle({
        backgroundColor: `rgba(${RGB.R + 60}, ${RGB.G + 60}, ${
          RGB.B + 60
        }, 0.84)`,
        border: "1px solid rgba(255, 255, 255, 0.32)",
      });
    } else if (addButtonOnHover) {
      setAddButtonStyle({
        backgroundColor: `rgba(${RGB.R + 60}, ${RGB.G + 60}, ${
          RGB.B + 60
        }, 0.64)`,
        border: "1px solid rgba(255, 255, 255, 0.32)",
      });
    } else {
      setAddButtonStyle({
        backgroundColor: `rgba(${RGB.R + 30}, ${RGB.G + 30}, ${RGB.B + 30}, 0)`,
        border: "1px solid rgba(255, 255, 255, 0)",
      });
    }
  }, [addButtonOnHover, addButtonOnClick]);
  useEffect(() => {
    if (addressBook && Array.isArray(addressBook.avaliable_addresses)) {
      setChatRoomItems(
        addressBook.avaliable_addresses.map((address, index) => (
          <Chat_List_Item key={index} address={address} />
        ))
      );
    }
  }, [addressBook]);
  return (
    <div
      className="scrolling-space"
      style={{
        position: "absolute",

        top: 72,
        left: 0,
        right: 0,
        bottom: 36,
        marginRight: 3,
        marginBottom: 3,

        overflowX: "hidden",
        overflowY: "auto",
      }}
    >
      {chatRoomItems}
      <Icon
        className="add_chat_section_button"
        src="add"
        style={{
          transition: "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          userSelect: "none",
          position: "fixed",
          top: 46,
          right: 16,

          width: 16,
          height: 16,
          padding: 4,

          borderRadius: 4,
          backgroundColor: addButtonStyle.backgroundColor,
          border: addButtonStyle.border,

          opacity: 0.96,

          cursor: "pointer",
          userSelect: "none",
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
          setComponentOnFocus("message_list");
        }}
      ></Icon>
      <span
        style={{
          transition: "left 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "fixed",
          top: 46,
          left: componentOnFocus === component_name ? 14 : -100,

          fontSize: 19,
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: sideMenu.color,

          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        Chat Rooms
      </span>
    </div>
  );
};
const Side_Menu = ({}) => {
  const { RGB, theme, sideMenu } = useContext(ConfigContexts);
  const {
    windowWidth,
    windowIsMaximized,
    componentOnFocus,
    setComponentOnFocus,
    unload_context_menu,
  } = useContext(StatusContexts);
  const [iconStyle, setIconStyle] = useState({});
  const [menuStyle, setMenuStyle] = useState({
    width: 0,
    borderRight: "0px solid rgba(255, 255, 255, 0)",
  });
  const [onSelectAddress, setOnSelectAddress] = useState(null);
  const [onRenameAddress, setOnRenameAddress] = useState(null);

  useEffect(() => {
    if (componentOnFocus === component_name) {
      if (window.innerWidth > 700) {
        setMenuStyle({
          width: 300,
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
        });
        setIconStyle({
          src: "arrow",
          top:
            window.osInfo.platform === "darwin"
              ? theme === "dark_theme"
                ? 17
                : 21
              : theme === "dark_theme"
              ? 14
              : 18,
          left: 300 - 16,
          transform: "translate(-50%, -50%) rotate(180deg)",
        });
      } else {
        setMenuStyle({
          width: 256,
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
        });
        setIconStyle({
          src: "arrow",
          top: window.osInfo.platform === "darwin" ? 17 : 14,
          left: 256 - 16,
          transform: "translate(-50%, -50%) rotate(180deg)",
        });
      }
    } else {
      setMenuStyle({
        width: 0,
        borderRight: "0px solid rgba(255, 255, 255, 0)",
      });
      if (window.osInfo.platform === "darwin") {
        setIconStyle({
          src: "side_menu",
          top: 24.3,
          left: windowIsMaximized ? 25 : 85,
          transform: "translate(-50%, -50%)",
        });
      } else {
        setIconStyle({
          src: "side_menu",
          top: 20,
          left: 18,
          transform: "translate(-50%, -50%)",
        });
      }
      setOnSelectAddress(null);
      setOnRenameAddress(null);
    }
  }, [windowWidth, componentOnFocus, windowIsMaximized, theme]);

  return (
    <Contexts.Provider
      value={{
        onSelectAddress,
        setOnSelectAddress,
        onRenameAddress,
        setOnRenameAddress,
      }}
    >
      <div>
        <div
          style={{
            transition: "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "fixed",

            top: theme === "dark_theme" ? 0 : 8,
            left: theme === "dark_theme" ? 0 : 8,
            bottom: theme === "dark_theme" ? 0 : 8,

            width:
              theme === "dark_theme"
                ? menuStyle.width
                : Math.max(menuStyle.width - 8, 0),

            boxSizing: "border-box",
            borderRight:
              theme === "dark_theme"
                ? componentOnFocus === component_name
                  ? sideMenu.border
                  : "0px solid rgba(255, 255, 255, 0)"
                : "none",
            scrollBehavior: "smooth",
            borderRadius: theme === "dark_theme" ? 0 : 12,

            backgroundColor: sideMenu.backgroundColor,
            boxShadow: sideMenu.boxShadow,
            backdropFilter: "blur(36px)",
            WebkitAppRegion: "no-drag",
          }}
          onClick={(e) => {
            e.stopPropagation();
            unload_context_menu();
            setOnSelectAddress(null);
          }}
        >
          <Chat_List />
          <Bottom_Function_Panel
            width={
              theme === "dark_theme"
                ? menuStyle.width
                : Math.max(menuStyle.width - 8, 0)
            }
          />
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
              cursor: "pointer",
              userSelect: "none",
              height: 20,
              opacity: 0.8,
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
    </Contexts.Provider>
  );
};

export default Side_Menu;
