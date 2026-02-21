import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

import Button from "../../BUILTIN_COMPONENTs/input/button";

const SideMenu = () => {
  const { theme, onFragment, setOnFragment } = useContext(ConfigContext);
  return (
    <div
      style={{
        transition: "width 0.3s ease",
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: onFragment === "side_menu" ? 300 : 0,
        backgroundColor: theme?.backgroundColor || "rgba(255,255,255,0.02)",
        borderRight: `1px solid ${theme?.foregroundColor || "rgba(255,255,255,0.06)"}`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 2049,
      }}
    >
      <Button
        prefix_icon={
          onFragment === "main" ? "side_menu_left" : "side_menu_close"
        }
        style={{
          position: "absolute",
          top: 25,
          transform: "translateY(-50%)",
          right: 10,
          fontSize: 14,
          marginLeft: 12,
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => {
          if (onFragment === "main") {
            setOnFragment("side_menu");
          } else {
            setOnFragment("main");
          }
        }}
      />
      <Button
        prefix_icon="settings"
        label="Settings"
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          fontSize: 14,
          WebkitAppRegion: "no-drag",
        }}
      />
    </div>
  );
};

export default SideMenu;
