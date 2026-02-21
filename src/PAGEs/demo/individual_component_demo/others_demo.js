import { useContext, useState, useRef, useEffect } from "react";
import { useSpring, animated } from "react-spring";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const OthersDemo = () => {
  const { theme } = useContext(ConfigContext);

  const cardStyle = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    padding: 24,
    borderRadius: 18,
    backgroundColor: theme?.foregroundColor || "#F2F2F2",
  };

  const labelStyle = {
    fontSize: 14,
    fontFamily: "Jost",
    color: theme?.color || "#222",
    opacity: 0.6,
    userSelect: "none",
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexWrap: "wrap",
        gap: "24px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily: "Jost",
          color: theme?.color || "black",
          userSelect: "none",
        }}
      >
        Others
      </span>

      {/* ---- Navigation Bar ---- */}
      <div
        style={{
          ...cardStyle,
          width: "100%",
          alignItems: "center",
        }}
      >
        <span style={labelStyle}>Navigation Bar</span>
        <NavBarDemo />
      </div>
    </div>
  );
};

/* ============================================================================================================================ */
/*  NavBar Demo — self-contained gooey pill animation                                                                           */
/* ============================================================================================================================ */
const NAV_ICONS = ["home", "notification_on", "email", "settings"];
const BTN = 40;
const GAP = 8;
const SEARCH_W = 240;
const BR = 999;

const NavBarDemo = () => {
  const { theme } = useContext(ConfigContext);
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef(null);

  const bgColor = theme?.backgroundColor || "#FFFFFF";
  const iconColor = theme?.icon?.color || "#222";

  /* ---- springs ---- */
  const navSpring = useSpring({
    width: searchOpen ? BTN : NAV_ICONS.length * BTN,
    config: { tension: 190, friction: 22 },
  });
  const searchSpring = useSpring({
    width: searchOpen ? SEARCH_W : BTN,
    config: { tension: 190, friction: 22 },
  });

  /* ---- focus input when opened ---- */
  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => inputRef.current?.focus?.(), 200);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: GAP,
        height: BTN,
        filter: "url(#mini-ui-group-goo)",
      }}
    >
      {/* ---- Nav pill / + circle ---- */}
      <animated.div
        style={{
          width: navSpring.width,
          height: BTN,
          borderRadius: BR,
          backgroundColor: bgColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          cursor: searchOpen ? "pointer" : "default",
          flexShrink: 0,
        }}
        onClick={() => searchOpen && setSearchOpen(false)}
      >
        {searchOpen ? (
          <Icon
            src="add"
            style={{ width: 20, height: 20, flexShrink: 0 }}
            color={iconColor}
          />
        ) : (
          NAV_ICONS.map((icon) => (
            <div
              key={icon}
              style={{
                width: BTN,
                height: BTN,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <Icon
                src={icon}
                style={{ width: 20, height: 20 }}
                color={iconColor}
              />
            </div>
          ))
        )}
      </animated.div>

      {/* ---- Search circle / pill ---- */}
      <animated.div
        style={{
          width: searchSpring.width,
          height: BTN,
          borderRadius: BR,
          backgroundColor: bgColor,
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          cursor: searchOpen ? "default" : "pointer",
          flexShrink: 0,
        }}
        onClick={() => !searchOpen && setSearchOpen(true)}
      >
        {searchOpen ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              height: "100%",
              gap: 4,
              paddingLeft: 12,
              paddingRight: 4,
            }}
          >
            <Icon
              src="search"
              style={{ width: 18, height: 18, flexShrink: 0 }}
              color={iconColor}
            />
            <input
              ref={inputRef}
              placeholder="Search..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                backgroundColor: "transparent",
                fontSize: 14,
                fontFamily: theme?.font?.fontFamily || "Jost",
                color: theme?.color || "#222",
                padding: "0 6px",
              }}
            />
            <div
              style={{
                width: 30,
                height: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
                borderRadius: "50%",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSearchOpen(false);
              }}
            >
              <Icon
                src="close"
                style={{ width: 16, height: 16 }}
                color={iconColor}
              />
            </div>
          </div>
        ) : (
          <div
            style={{
              width: BTN,
              height: BTN,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon
              src="search"
              style={{ width: 20, height: 20 }}
              color={iconColor}
            />
          </div>
        )}
      </animated.div>
    </div>
  );
};

export default OthersDemo;
