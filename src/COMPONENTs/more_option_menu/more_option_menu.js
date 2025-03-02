import React, { useContext, useEffect, useState } from "react";

import { ConfigContexts } from "../../CONTAINERs/config/contexts";
import { StatusContexts } from "../../CONTAINERs/status/contexts";

import Icon from "../../BUILTIN_COMPONENTs/icon/icon";

const OptionItem = ({ img_src, label, onClick }) => {
  const { RGB, colorOffset, moreOptionMenu } = useContext(ConfigContexts);
  const [onHover, setOnHover] = useState(false);

  return (
    <>
      <div
        style={{
          transition: "border 0.16s cubic-bezier(0.72, -0.16, 0.2, 1.16)",
          position: "relative",
          display: "block",
          width: "calc(100% - 12px)",
          height: 30,
          margin: 5,

          border: onHover
            ? moreOptionMenu.option_item.border
            : "1px solid transparent",
          borderRadius: 5,
          backgroundColor: onHover ? moreOptionMenu.option_item.backgroundColor : "transparent",
          boxShadow: onHover ? moreOptionMenu.option_item.boxShadow : "none",
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
            opacity: onHover ? 1 : 0.72,
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
            opacity: onHover ? 1 : 0.96,
          }}
        >
          {label}
        </span>
      </div>
    </>
  );
};
const MoreOptionMenu = ({ model, width, options }) => {
  const { RGB, colorOffset, moreOptionMenu } = useContext(ConfigContexts);
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
        position: "absolute",
        maxHeight: (width + 2) * 0.618,
        top: 20,
        right: -1,
        width: style.width,
        zIndex: 12,

        backgroundColor: moreOptionMenu.backgroundColor,
        borderRadius: 8,
        border: moreOptionMenu.border,
        boxSizing: "border-box",
        boxShadow: moreOptionMenu.boxShadow,
        opacity: style.opacity,

        overflowX: "hidden",
      }}
    >
      {options.map((option, index) => {
        return (
          <OptionItem
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

export default MoreOptionMenu;
