import React, { useContext, useEffect, useState } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";

import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const Context_Menu_Item = ({ img_src, label, onClick }) => {
  const { RGB, theme, colorOffset, contextMenu } = useContext(ConfigContexts);
  const [onHover, setOnHover] = useState(false);

  return (
    <>
      <div
        style={{
          transition: "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "relative",
          display: "block",
          width: theme === "dark_theme"? "calc(100% - 14px)" : "calc(100% - 10px)",
          height: 32,
          margin: theme === "dark_theme"? 7 : 5,

          border: onHover
            ? contextMenu.option_item.border
            : "1px solid transparent",
          borderRadius: contextMenu.option_item.borderRadius,
          backgroundColor: onHover
            ? contextMenu.option_item.backgroundColor
            : "transparent",
          boxShadow: onHover ? contextMenu.option_item.boxShadow : "none",
          boxSizing: "border-box",
          cursor: "pointer",
        }}
        onClick={onClick}
        onMouseEnter={() => {
          setOnHover(true);
        }}
        onMouseLeave={() => {
          setOnHover(false);
        }}
      >
        <Icon
          src={img_src}
          style={{
            position: "absolute",
            transform: "translate(0, -50%)",
            top: "50%",
            left: 6,
            userSelect: "none",
            height: 18,
            opacity: 1,
          }}
        />
        <span
          style={{
            position: "absolute",
            transform: "translate(0, -50%)",
            top: "50%",
            left: 30,
            color: `rgba(${RGB.R + colorOffset.font}, ${
              RGB.G + colorOffset.font
            }, ${RGB.B + colorOffset.font}, 1)`,
            userSelect: "none",
            opacity: 1,
          }}
        >
          {label}
        </span>
      </div>
    </>
  );
};
const Context_Menu = ({ x, y, width, options }) => {
  const { contextMenu } = useContext(ConfigContexts);
  const [isLoaded, setIsLoaded] = useState(false);
  const [style, setStyle] = useState({
    width: 32,
    opacity: 0,
  });

  useEffect(() => {
    setIsLoaded(true);
  }, []);
  useEffect(() => {
    if (isLoaded) {
      setStyle({
        width: width + 2,
        opacity: 1,
      });
    }
  }, [isLoaded]);

  return (
    <div
      style={{
        transition: "width 0.24s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
        position: "fixed",
        maxHeight: (width + 2) * 0.618,
        top: y,
        left: x,
        width: style.width,
        zIndex: 12,

        backgroundColor: contextMenu.backgroundColor,
        borderRadius: contextMenu.borderRadius,
        border: contextMenu.border,
        boxSizing: "border-box",
        boxShadow: contextMenu.boxShadow,
        opacity: style.opacity,

        overflowX: "hidden",
      }}
    >
      {options.map((option, index) => {
        return (
          <Context_Menu_Item
            key={index}
            img_src={option.img_src}
            label={option.label}
            onClick={() => {
              option.onClick();
            }}
          />
        );
      })}
    </div>
  );
};

export default Context_Menu;
