import { useLayoutEffect, useRef, useState } from "react";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { ArrowHoverShape } from "./side_menu_breadcrumb";

/**
 * A side menu entry that drills into a pane of its own (Agents). Same icon,
 * label and type as the entries around it, but its block is the
 * breadcrumb's Home block: square on the left, pointed on the right — the
 * shape says "this goes one level in", so it needs no › after the label.
 */
export default function SideMenuDrillButton({ icon, label, onClick, isDark, testId }) {
  const ref = useRef(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setBox((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-testid={testId}
      style={{ position: "relative", marginBottom: 2, flexShrink: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
    >
      <ArrowHoverShape
        width={box.width}
        height={box.height}
        notch={false}
        point
        hovered={hovered}
        pressed={pressed}
        isDark={isDark}
        testId={testId ? `${testId}-shape` : undefined}
      />
      <Button
        prefix_icon={icon}
        label={label}
        onClick={onClick}
        style={{
          position: "relative",
          width: "100%",
          justifyContent: "flex-start",
          fontSize: 14,
          padding: "5px 8px",
          borderRadius: 6,
          WebkitAppRegion: "no-drag",
          iconSize: 16,
          /* The arrow behind is the hover; the button's own box is not. */
          hoverBackgroundColor: "transparent",
          activeBackgroundColor: "transparent",
        }}
      />
    </div>
  );
}
