import React, { useState, useEffect, useRef, useCallback } from "react";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const R = 30;
const G = 30;
const B = 30;

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
      ></div>
      <div
        className="icon-container"
        style={{
          transition: "width 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16), left 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16), transform 0.32s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "fixed",
          transform: iconStyle.transform,

          top: "50%",
          left: iconStyle.left,
        }}
      >
        <Icon
          src="arrow"
          style={{
            height: 20,
            opacity: isExpanded ? 0.64 : 0.32,
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
