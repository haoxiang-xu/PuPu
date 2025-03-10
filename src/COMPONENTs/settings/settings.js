import React, { useState, useEffect, useContext, createContext } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";

import Language_Model_Manager from "./language_model_manager/language_model_manager";
import Vision_Model_Manager from "./vision_model_manager/vision_model_manager";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { Storage_Manager } from "./storage_manager/storage_manager";
import { available_large_language_models } from "./ollama";
import { available_vision_models } from "./ollama";
import { list_of_setting_menus } from "./constants";

const SettingPanelContexts = createContext("");

const component_name = "settings";

const Submenu = ({ children }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 156,
        right: 0,
        bottom: 0,
        borderRadius: 6,
      }}
    >
      {children}
    </div>
  );
};
const Submenu_Side_List_Item = ({ index, menu_key, left_padding }) => {
  const { RGB, settingPanel, sideMenu, theme } = useContext(ConfigContexts);
  const { selectedMenu, setSelectedMenu } = useContext(SettingPanelContexts);

  const [onHover, setOnHover] = useState(false);
  const [isSubmenuExpanded, setIsSubmenuExpanded] = useState(false);

  if (list_of_setting_menus[menu_key] === undefined) {
    return;
  } else if (list_of_setting_menus[menu_key].sub_menus !== undefined) {
    return (
      <>
        <div
          style={{
            transition: "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "relative",
            width:
              theme === "light_theme"
                ? `calc(100% - ${12 + left_padding}px)`
                : `calc(100% - ${4 + left_padding}px)`,
            height: 30,
            margin:
              theme === "light_theme"
                ? index === 0
                  ? `6px 6px 0 ${6 + left_padding}px`
                  : `3px 6px 0 ${6 + left_padding}px`
                : index === 0
                ? `3px 2px 0 ${2 + left_padding}px`
                : `3px 2px 0 ${2 + left_padding}px`,

            border: onHover
              ? settingPanel.side_menu_item.border_onHover
              : "1px solid rgba(0, 0, 0, 0)",
            backgroundColor: onHover
              ? settingPanel.side_menu_item.backgroundColor_onHover
              : "transparent",
            boxShadow: "none",
            borderRadius: 4,
            boxSizing: "border-box",
          }}
          onMouseEnter={() => {
            setOnHover(true);
          }}
          onMouseLeave={() => {
            setOnHover(false);
          }}
          onClick={() => {
            setSelectedMenu(menu_key);
          }}
        >
          <span
            style={{
              transition: "all 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
              position: "absolute",
              display: "block",

              transform: "translateY(-50%)",
              top: "50%",
              left: 28,
              width: "calc(100% - 40px)",

              fontSize: 16,

              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflow: "hidden",
              color: sideMenu.color,

              userSelect: "none",
              pointerEvents: "none",
            }}
          >
            {list_of_setting_menus[menu_key].title || menu_key}
          </span>
          <Icon
            src={"arrow"}
            style={{
              transition:
                "transform 0.08s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
              position: "absolute",
              transform:
                "translateY(-50%)" +
                (isSubmenuExpanded ? "rotate(-90deg)" : "rotate(90deg)"),
              top: "50%",
              right: 5,
              width: 18,
              height: 18,
              opacity: 0.5,

              userSelect: "none",
            }}
            onClick={() => {
              setIsSubmenuExpanded(!isSubmenuExpanded);
            }}
          />
          <Icon
            src={list_of_setting_menus[menu_key].img_src || menu_key}
            style={{
              position: "absolute",
              transform: "translateY(-50%)",
              top: "50%",
              left: 5,
              width: 18,
              height: 18,
              userSelect: "none",
              pointerEvents: "none",
              opacity: selectedMenu === menu_key ? 1 : 0.32,
            }}
          />
        </div>
        {isSubmenuExpanded
          ? list_of_setting_menus[menu_key].sub_menus.map(
              (submenu_key, index) => (
                <div
                  style={{
                    position: "relative",
                    transition:
                      "all 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
                  }}
                >
                  <Submenu_Side_List_Item
                    key={index}
                    index={index}
                    menu_key={submenu_key}
                    left_padding={left_padding + 12}
                  />
                </div>
              )
            )
          : null}
      </>
    );
  } else {
    return (
      <div
        style={{
          transition: "box-shadow 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "relative",
          width:
            theme === "light_theme"
              ? `calc(100% - ${12 + left_padding}px)`
              : `calc(100% - ${4 + left_padding}px)`,
          height: 30,
          margin:
            theme === "light_theme"
              ? index === 0
                ? `6px 6px 0 ${6 + left_padding}px`
                : `3px 6px 0 ${6 + left_padding}px`
              : index === 0
              ? `3px 2px 0 ${2 + left_padding}px`
              : `3px 2px 0 ${2 + left_padding}px`,

          border:
            selectedMenu === menu_key
              ? settingPanel.side_menu_item.border_onActive
              : onHover
              ? settingPanel.side_menu_item.border_onHover
              : "1px solid rgba(0, 0, 0, 0)",
          backgroundColor:
            selectedMenu === menu_key
              ? settingPanel.side_menu_item.backgroundColor_onActive
              : onHover
              ? settingPanel.side_menu_item.backgroundColor_onHover
              : "transparent",
          boxShadow:
            selectedMenu === menu_key
              ? settingPanel.side_menu_item.boxShadow_onActive
              : "none",
          borderRadius: 4,
          boxSizing: "border-box",
        }}
        onMouseEnter={() => {
          setOnHover(true);
        }}
        onMouseLeave={() => {
          setOnHover(false);
        }}
        onClick={() => {
          setSelectedMenu(menu_key);
        }}
      >
        <span
          style={{
            transition: "all 0.2s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
            position: "absolute",
            display: "block",

            transform: "translateY(-50%)",
            top: "50%",
            left: 28,
            width: "calc(100% - 40px)",

            fontSize: 16,

            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            overflow: "hidden",
            color: sideMenu.color,

            userSelect: "none",
            pointerEvents: "none",
          }}
        >
          {list_of_setting_menus[menu_key].title || menu_key}
        </span>
        <Icon
          src={list_of_setting_menus[menu_key].img_src || menu_key}
          style={{
            position: "absolute",
            transform: "translateY(-50%)",
            top: "50%",
            left: 5,
            width: 18,
            height: 18,
            userSelect: "none",
            pointerEvents: "none",
            opacity: selectedMenu === menu_key ? 1 : 0.32,
          }}
        />
      </div>
    );
  }
};
const Submenu_Side_List = () => {
  const { settingPanel } = useContext(ConfigContexts);
  return (
    <div
      style={{
        position: "absolute",
        top: 6,
        left: 6,
        width: 144,
        bottom: 6,
        borderRadius: 6,
        border: settingPanel.border,
        backgroundColor: settingPanel.backgroundColor,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          right: -7,
          bottom: 12,
          width: 2,
          backgroundColor: settingPanel.separator,
        }}
      ></div>
      {list_of_setting_menus.root.sub_menus.map((menu_key, index) => (
        <Submenu_Side_List_Item
          key={index}
          index={index}
          menu_key={menu_key}
          left_padding={0}
        />
      ))}
    </div>
  );
};
const Settings = () => {
  const { setComponentOnFocus, unload_context_menu } =
    useContext(StatusContexts);
  const [selectedMenu, setSelectedMenu] = useState(list_of_setting_menus[0]);
  const [menu, setMenu] = useState(<div></div>);

  useEffect(() => {
    switch (selectedMenu) {
      case "language_models":
        setMenu(
          <Language_Model_Manager
            available_models={available_large_language_models}
          />
        );
        break;
      case "vision_models":
        setMenu(
          <Vision_Model_Manager available_models={available_vision_models} />
        );
        break;
      case "local_storage":
        setMenu(<Storage_Manager />);
        break;
      default:
        setMenu(<div></div>);
        break;
    }
  }, [selectedMenu]);

  return (
    <SettingPanelContexts.Provider value={{ selectedMenu, setSelectedMenu }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
        onClick={() => {
          setComponentOnFocus(component_name);
          unload_context_menu();
        }}
      >
        <Submenu_Side_List />
        <Submenu>{menu}</Submenu>
      </div>
    </SettingPanelContexts.Provider>
  );
};

export default Settings;
