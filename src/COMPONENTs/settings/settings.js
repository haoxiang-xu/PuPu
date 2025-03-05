import React, { useState, useEffect, useContext, createContext } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";

import OllamaModelManager from "./ollama_model_manager/ollama_model_manager";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { LocalStoragePanel } from "./storage_manager/storage_manager";
import { available_large_language_models } from "../../CONTAINERs/consts/ollama";
import { list_of_setting_menus } from "./constants";

const SettingPanelContexts = createContext("");

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
const Submenu_Side_List_Item = ({ index, label }) => {
  const { RGB, settingPanel, sideMenu, theme } = useContext(ConfigContexts);
  const { selectedMenu, setSelectedMenu } = useContext(SettingPanelContexts);

  const [onHover, setOnHover] = useState(false);

  return (
    <div
      style={{
        transition: "box-shadow 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",
        width:
          theme === "light_theme" ? "calc(100% - 12px)" : "calc(100% - 4px)",
        height: 30,
        margin:
          theme === "light_theme"
            ? index === 0
              ? "6px 6px 0 6px"
              : "3px 6px 0 6px"
            : index === 0
            ? "3px 2px 0 2px"
            : "3px 2px 0 2px",

        border:
          selectedMenu === label
            ? settingPanel.side_menu_item.border_onActive
            : onHover
            ? settingPanel.side_menu_item.border_onHover
            : "1px solid rgba(0, 0, 0, 0)",
        backgroundColor:
          selectedMenu === label
            ? settingPanel.side_menu_item.backgroundColor_onActive
            : onHover
            ? settingPanel.side_menu_item.backgroundColor_onHover
            : "transparent",
        boxShadow:
          selectedMenu === label
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
        setSelectedMenu(label);
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
        {label}
      </span>
      <Icon
        src={label.split(" ").join("_").toLowerCase()}
        style={{
          position: "absolute",
          transform: "translateY(-50%)",
          top: "50%",
          left: 5,
          width: 18,
          height: 18,
          userSelect: "none",
          pointerEvents: "none",
          opacity: selectedMenu === label ? 1 : 0.32,
        }}
      />
    </div>
  );
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
      {list_of_setting_menus.map((label, index) => (
        <Submenu_Side_List_Item key={index} index={index} label={label} />
      ))}
    </div>
  );
};
const Settings = () => {
  const { setComponentOnFocus } = useContext(StatusContexts);
  const [selectedMenu, setSelectedMenu] = useState(list_of_setting_menus[0]);
  const [menu, setMenu] = useState(<div></div>);

  useEffect(() => {
    switch (selectedMenu) {
      case "models":
        setMenu(
          <OllamaModelManager
            available_models={available_large_language_models}
          />
        );
        break;
      case "local storage":
        setMenu(<LocalStoragePanel />);
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
          setComponentOnFocus("setting");
        }}
      >
        <Submenu_Side_List />
        <Submenu>{menu}</Submenu>
      </div>
    </SettingPanelContexts.Provider>
  );
};

export default Settings;
