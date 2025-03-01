import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
} from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";
import { RequestContexts } from "../../CONTAINERs/requests/contexts";
import { DataContexts } from "../../CONTAINERs/data/contexts";

import { list_of_setting_menus } from "./constants";

const SettingPanelContexts = createContext("");

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
        height: 28,
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
        borderRadius: 3,
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
        {label}
      </span>
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
          right: -12,
          bottom: 12,
          width: 2,
          backgroundColor: settingPanel.separator,
        }}
      ></div>
      {list_of_setting_menus.map((label) => (
        <SideListItem label={label} />
      ))}
    </div>
  );
};
const SettingPanel = () => {
  const { RGB, colorOffset, settingPanel } = useContext(ConfigContexts);
  const [selectedMenu, setSelectedMenu] = useState("");

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
      >
        <SideList />
      </div>
    </SettingPanelContexts.Provider>
  );
};

export default SettingPanel;
