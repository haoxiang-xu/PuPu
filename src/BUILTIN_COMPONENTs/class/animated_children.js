import { useEffect, useRef, useState } from "react";

/**
 * AnimatedChildren — collapse / expand wrapper
 *
 * Animates height between 0 and scrollHeight using CSS transitions.
 * Uses double-rAF trick for collapse to force the browser to paint
 * the full height before animating to 0.
 *
 * @param {boolean}  open           — whether the container is expanded
 * @param {boolean}  skipAnimation  — skip transition (instant open/close)
 * @param {boolean}  unmountWhenClosed — unmount children after close animation
 * @param {React.ReactNode} children
 */
const AnimatedChildren = ({
  open,
  skipAnimation,
  unmountWhenClosed = false,
  children,
}) => {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(open ? "auto" : 0);
  const [overflow, setOverflow] = useState(open ? "visible" : "hidden");
  const [mountedChildren, setMountedChildren] = useState(open);
  const prevOpenRef = useRef(open);

  useEffect(() => {
    if (!unmountWhenClosed || open) {
      setMountedChildren(true);
    }

    /* only a real open/close transition may animate — a skipAnimation
       flip alone (e.g. drag end) must not replay the collapse animation
       on an already-closed container */
    if (prevOpenRef.current === open) {
      if (skipAnimation) {
        /* snap to the final state in case an animation was interrupted
           (the cleanup below cancels a pending expand timer) */
        setHeight(open ? "auto" : 0);
        setOverflow(open ? "visible" : "hidden");
        if (unmountWhenClosed && !open) {
          setMountedChildren(false);
        }
      }
      return;
    }
    prevOpenRef.current = open;

    if (skipAnimation) {
      setHeight(open ? "auto" : 0);
      setOverflow(open ? "visible" : "hidden");
      if (unmountWhenClosed && !open) {
        setMountedChildren(false);
      }
      return;
    }

    const el = contentRef.current;
    if (!el) return;

    if (open) {
      const h = el.scrollHeight;
      setHeight(h);
      setOverflow("hidden");
      const timer = setTimeout(() => {
        setHeight("auto");
        setOverflow("visible");
      }, 280);
      return () => clearTimeout(timer);
    } else {
      const h = el.scrollHeight;
      setHeight(h);
      setOverflow("hidden");
      let rafB = null;
      const rafA = requestAnimationFrame(() => {
        rafB = requestAnimationFrame(() => {
          setHeight(0);
        });
      });
      const unmountTimer = unmountWhenClosed
        ? setTimeout(() => {
            setMountedChildren(false);
          }, 280)
        : null;
      return () => {
        cancelAnimationFrame(rafA);
        if (rafB) {
          cancelAnimationFrame(rafB);
        }
        if (unmountTimer) {
          clearTimeout(unmountTimer);
        }
      };
    }
  }, [open, skipAnimation, unmountWhenClosed]);

  const shouldRenderChildren = !unmountWhenClosed || open || mountedChildren;

  return (
    <div
      ref={contentRef}
      style={{
        height,
        overflow,
        transition: skipAnimation
          ? "none"
          : "height 0.28s cubic-bezier(0.32, 1, 0.32, 1)",
        willChange: "height",
      }}
    >
      {shouldRenderChildren ? children : null}
    </div>
  );
};

export default AnimatedChildren;
