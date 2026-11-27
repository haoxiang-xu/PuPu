import { useState } from "react";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import useReducedMotion from "../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";

/**
 * A normal side menu button with an arrow that slides in on hover to show
 * that this entry opens the next pane. The label stays in place.
 */
export default function SideMenuDrillButton({ icon, label, onClick, testId }) {
  const [hovered, setHovered] = useState(false);
  const reducedMotion = useReducedMotion();

  return (
    <div
      data-testid={testId}
      style={{ position: "relative", marginBottom: 2, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Button
        prefix_icon={icon}
        label={label}
        postfix_icon="arrow_right"
        onClick={onClick}
        style={{
          position: "relative",
          width: "100%",
          justifyContent: "flex-start",
          fontSize: 14,
          padding: "5px 8px",
          paddingRight: 32,
          borderRadius: 6,
          overflow: "hidden",
          WebkitAppRegion: "no-drag",
          iconSize: 16,
          content: {
            postfixIconWrap: {
              position: "absolute",
              top: "50%",
              right: 8,
              opacity: hovered ? 1 : 0,
              transform: `translate(${hovered ? 0 : 24}px, -50%)`,
              transition: reducedMotion
                ? "none"
                : "transform 180ms cubic-bezier(0.2, 0.9, 0.3, 1), opacity 140ms ease",
              pointerEvents: "none",
            },
          },
        }}
      />
    </div>
  );
}
