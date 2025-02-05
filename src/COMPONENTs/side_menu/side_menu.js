import React, { useState, useEffect, useRef, useCallback } from "react";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const R = 30;
const G = 30;
const B = 30;

const Side_Menu = ({}) => {
  const [iconStyle, setIconStyle] = useState({
    src: "menu",
  });
  const [menuStyle, setMenuStyle] = useState({
    width: 0,
  });
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      setMenuStyle({
        width: 256,
      });
    } else {
      setMenuStyle({
        width: 0,
      });
    }
  }, [isExpanded]);

  return (
    <div>
      <div
        className="scrolling-space"
        style={{
          transition: "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",

          top: 0,
          left: 0,
          bottom: 0,

          width: menuStyle.width,

          boxSizing: "border-box",
          borderRight: "1px solid rgba(255, 255, 255, 0.12)",
          scrollBehavior: "smooth",

          backgroundColor: `rgba(${R + 60}, ${G + 60}, ${B + 60}, 0.16)`,
          backdropFilter: "blur(24px)",
        }}
      ></div>
      <div
        className="icon-container"
        style={{
          transition: "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "absolute",
          top: 8,
          left: 8,
        }}
      >
        <Icon
          src="menu"
          style={{
            height: 20,
            opacity: 0.32,
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
