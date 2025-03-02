import React, { useState, useEffect, useContext, createContext } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { RequestContexts } from "../../CONTAINERs/requests/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import ModelDownloader from "../model_downloader/model_downloader";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { LocalStoragePanel } from "../local_storage_panel/local_storage_panel";
import { available_large_language_models } from "../../CONTAINERs/consts/ollama";
import { list_of_setting_menus } from "./constants";

const SettingPanelContexts = createContext("");

const MenuContainer = ({ children }) => {
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
const SideListItem = ({ label }) => {
  const { RGB, settingPanel, sideMenu } = useContext(ConfigContexts);
  const { selectedMenu, setSelectedMenu } = useContext(SettingPanelContexts);

  const [onHover, setOnHover] = useState(false);

  return (
    <div
      style={{
        transition: "box-shadow 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "relative",
        width: "calc(100% - 12px)",
        height: 36,
        margin: "6px 6px 0 6px",

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

          fontSize: 14,

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
          left: 6,
          width: 16,
          height: 16,
          userSelect: "none",
          pointerEvents: "none",
          opacity: selectedMenu === label ? 0.72 : 0.32,
        }}
      />
    </div>
  );
};
const SideList = () => {
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
        <SideListItem key={index} label={label} />
      ))}
    </div>
  );
};
const SettingPanel = () => {
  const { setComponentOnFocus } = useContext(StatusContexts);
  const [selectedMenu, setSelectedMenu] = useState("");
  const [menu, setMenu] = useState(<div></div>);

  useEffect(() => {
    switch (selectedMenu) {
      case "models":
        setMenu(
          <ModelDownloader available_models={available_large_language_models} />
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
        <SideList />
        <MenuContainer>{menu}</MenuContainer>
      </div>
    </SettingPanelContexts.Provider>
  );
};

export default SettingPanel;
