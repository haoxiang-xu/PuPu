import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLayoutEffect } from "../mini_react/mini_use";
import { ConfigContext } from "../../CONTAINERs/config/context";
import {
  register as ttl_register,
  unregister as ttl_unregister,
  requestOpen as ttl_requestOpen,
  notifyClose as ttl_notifyClose,
} from "./tooltip_trigger_listener";

let _tooltipIdCounter = 0;

/* Track whether mouse actually moved (vs scroll-induced mouseenter).
   `_mouseMovedSinceScroll` is set to false on every scroll event and
   back to true only when a real mousemove fires.  During scrolling the
   cursor stays still so _mouseMovedSinceScroll remains false, which
   lets us suppress all scroll-induced mouseenter events. */
let _mouseMovedSinceScroll = true;
let _scrollEndTimer = null;

const _trackGlobalMouse = () => {
  _mouseMovedSinceScroll = true;
};
const _trackGlobalScroll = () => {
  _mouseMovedSinceScroll = false;
  /* Keep suppression active for a short window after scrolling stops,
     because the last scroll event may precede a final mouseenter. */
  clearTimeout(_scrollEndTimer);
  _scrollEndTimer = setTimeout(() => {
    /* If the mouse still hasn't moved 120ms after scrolling stopped,
       keep suppression.  It will clear on the next real mousemove. */
  }, 120);
};
if (typeof window !== "undefined") {
  window.addEventListener("mousemove", _trackGlobalMouse, true);
  window.addEventListener("scroll", _trackGlobalScroll, true);
}

/* Shared portal root — all tooltips render into the same container */
let _sharedPortalRoot = null;
let _sharedPortalRefCount = 0;
const _acquirePortal = () => {
  if (!_sharedPortalRoot) {
    _sharedPortalRoot = document.createElement("div");
    _sharedPortalRoot.setAttribute("data-mini-ui-tooltip-root", "true");
    document.body.appendChild(_sharedPortalRoot);
  }
  _sharedPortalRefCount++;
  return _sharedPortalRoot;
};
const _releasePortal = () => {
  _sharedPortalRefCount--;
  if (_sharedPortalRefCount <= 0 && _sharedPortalRoot) {
    document.body.removeChild(_sharedPortalRoot);
    _sharedPortalRoot = null;
    _sharedPortalRefCount = 0;
  }
};

const default_trigger = ["hover", "focus", "click"];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const toNumber = (value, fallback) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
};
const buildRoundedRectPath = ({ x, y, width, height, radius }) => {
  const r = clamp(radius, 0, Math.min(width / 2, height / 2));
  return [
    `M ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `L ${x + width} ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `L ${x + r} ${y + height}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `L ${x} ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
};
const buildVerticalArrowPath = ({
  bubbleWidth,
  bubbleHeight,
  arrowWidth,
  arrowHeight,
  cornerRadius,
  arrowRadius,
  joinRadius,
  arrowOnTop,
}) => {
  const width = Math.max(0, bubbleWidth);
  const height = Math.max(0, bubbleHeight);
  const r = clamp(cornerRadius, 0, Math.min(width / 2, height / 2));
  const maxArrowWidth = Math.max(0, width - 2 * (r + joinRadius));
  const aw = clamp(arrowWidth, 0, maxArrowWidth);
  const jr = clamp(joinRadius, 0, aw / 2);
  const ah = Math.max(0, arrowHeight);
  const ar = clamp(arrowRadius, 0, Math.min(ah, aw / 2));
  const bubbleX = 0;
  const bubbleY = arrowOnTop ? ah : 0;
  const baseY = arrowOnTop ? bubbleY : bubbleY + height;
  const tipY = arrowOnTop ? baseY - ah : baseY + ah;

  if (aw === 0 || ah === 0) {
    return buildRoundedRectPath({
      x: bubbleX,
      y: bubbleY,
      width,
      height,
      radius: r,
    });
  }

  const cx = bubbleX + width / 2;
  const baseLeft = cx - aw / 2;
  const baseRight = cx + aw / 2;
  const sideDx = aw / 2;
  const sideDy = arrowOnTop ? -ah : ah;
  const len = Math.sqrt(sideDx * sideDx + sideDy * sideDy) || 1;
  const ux = sideDx / len;
  const uy = sideDy / len;
  const rightUx = -ux;
  const rightUy = uy;

  const leftJoin = { x: baseLeft + ux * jr, y: baseY + uy * jr };
  const rightJoin = { x: baseRight + rightUx * jr, y: baseY + rightUy * jr };
  const leftTip = { x: cx - ux * ar, y: tipY - uy * ar };
  const rightTip = { x: cx + ux * ar, y: tipY - uy * ar };

  if (!arrowOnTop) {
    return [
      `M ${bubbleX + r} ${bubbleY}`,
      `L ${bubbleX + width - r} ${bubbleY}`,
      `A ${r} ${r} 0 0 1 ${bubbleX + width} ${bubbleY + r}`,
      `L ${bubbleX + width} ${bubbleY + height - r}`,
      `A ${r} ${r} 0 0 1 ${bubbleX + width - r} ${bubbleY + height}`,
      `L ${baseRight + jr} ${baseY}`,
      `Q ${baseRight} ${baseY} ${rightJoin.x} ${rightJoin.y}`,
      `L ${rightTip.x} ${rightTip.y}`,
      `Q ${cx} ${tipY} ${leftTip.x} ${leftTip.y}`,
      `L ${leftJoin.x} ${leftJoin.y}`,
      `Q ${baseLeft} ${baseY} ${baseLeft - jr} ${baseY}`,
      `L ${bubbleX + r} ${baseY}`,
      `A ${r} ${r} 0 0 1 ${bubbleX} ${bubbleY + height - r}`,
      `L ${bubbleX} ${bubbleY + r}`,
      `A ${r} ${r} 0 0 1 ${bubbleX + r} ${bubbleY}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${bubbleX + r} ${bubbleY}`,
    `L ${baseLeft - jr} ${baseY}`,
    `Q ${baseLeft} ${baseY} ${leftJoin.x} ${leftJoin.y}`,
    `L ${leftTip.x} ${leftTip.y}`,
    `Q ${cx} ${tipY} ${rightTip.x} ${rightTip.y}`,
    `L ${rightJoin.x} ${rightJoin.y}`,
    `Q ${baseRight} ${baseY} ${baseRight + jr} ${baseY}`,
    `L ${bubbleX + width - r} ${bubbleY}`,
    `A ${r} ${r} 0 0 1 ${bubbleX + width} ${bubbleY + r}`,
    `L ${bubbleX + width} ${bubbleY + height - r}`,
    `A ${r} ${r} 0 0 1 ${bubbleX + width - r} ${bubbleY + height}`,
    `L ${bubbleX + r} ${bubbleY + height}`,
    `A ${r} ${r} 0 0 1 ${bubbleX} ${bubbleY + height - r}`,
    `L ${bubbleX} ${bubbleY + r}`,
    `A ${r} ${r} 0 0 1 ${bubbleX + r} ${bubbleY}`,
    "Z",
  ].join(" ");
};
const buildHorizontalArrowPath = ({
  bubbleWidth,
  bubbleHeight,
  arrowWidth,
  arrowHeight,
  cornerRadius,
  arrowRadius,
  joinRadius,
  arrowOnLeft,
}) => {
  const width = Math.max(0, bubbleWidth);
  const height = Math.max(0, bubbleHeight);
  const r = clamp(cornerRadius, 0, Math.min(width / 2, height / 2));
  const maxArrowWidth = Math.max(0, height - 2 * (r + joinRadius));
  const aw = clamp(arrowWidth, 0, maxArrowWidth);
  const jr = clamp(joinRadius, 0, aw / 2);
  const ah = Math.max(0, arrowHeight);
  const ar = clamp(arrowRadius, 0, Math.min(ah, aw / 2));
  const bubbleX = arrowOnLeft ? ah : 0;
  const bubbleY = 0;
  const baseX = arrowOnLeft ? bubbleX : bubbleX + width;
  const tipX = arrowOnLeft ? baseX - ah : baseX + ah;

  if (aw === 0 || ah === 0) {
    return buildRoundedRectPath({
      x: bubbleX,
      y: bubbleY,
      width,
      height,
      radius: r,
    });
  }

  const cy = bubbleY + height / 2;
  const baseTop = cy - aw / 2;
  const baseBottom = cy + aw / 2;
  const sideDx = arrowOnLeft ? -ah : ah;
  const sideDy = aw / 2;
  const len = Math.sqrt(sideDx * sideDx + sideDy * sideDy) || 1;
  const ux = sideDx / len;
  const uy = sideDy / len;
  const bottomUx = ux;
  const bottomUy = -uy;

  const topJoin = { x: baseX + ux * jr, y: baseTop + uy * jr };
  const bottomJoin = {
    x: baseX + bottomUx * jr,
    y: baseBottom + bottomUy * jr,
  };
  const topTip = { x: tipX - ux * ar, y: cy - uy * ar };
  const bottomTip = { x: tipX - bottomUx * ar, y: cy - bottomUy * ar };

  if (!arrowOnLeft) {
    return [
      `M ${bubbleX + r} ${bubbleY}`,
      `L ${bubbleX + width - r} ${bubbleY}`,
      `A ${r} ${r} 0 0 1 ${bubbleX + width} ${bubbleY + r}`,
      `L ${baseX} ${baseTop - jr}`,
      `Q ${baseX} ${baseTop} ${topJoin.x} ${topJoin.y}`,
      `L ${topTip.x} ${topTip.y}`,
      `Q ${tipX} ${cy} ${bottomTip.x} ${bottomTip.y}`,
      `L ${bottomJoin.x} ${bottomJoin.y}`,
      `Q ${baseX} ${baseBottom} ${baseX} ${baseBottom + jr}`,
      `L ${bubbleX + width} ${bubbleY + height - r}`,
      `A ${r} ${r} 0 0 1 ${bubbleX + width - r} ${bubbleY + height}`,
      `L ${bubbleX + r} ${bubbleY + height}`,
      `A ${r} ${r} 0 0 1 ${bubbleX} ${bubbleY + height - r}`,
      `L ${bubbleX} ${bubbleY + r}`,
      `A ${r} ${r} 0 0 1 ${bubbleX + r} ${bubbleY}`,
      "Z",
    ].join(" ");
  }

  return [
    `M ${bubbleX + r} ${bubbleY}`,
    `L ${bubbleX + width - r} ${bubbleY}`,
    `A ${r} ${r} 0 0 1 ${bubbleX + width} ${bubbleY + r}`,
    `L ${bubbleX + width} ${bubbleY + height - r}`,
    `A ${r} ${r} 0 0 1 ${bubbleX + width - r} ${bubbleY + height}`,
    `L ${bubbleX + r} ${bubbleY + height}`,
    `A ${r} ${r} 0 0 1 ${bubbleX} ${bubbleY + height - r}`,
    `L ${baseX} ${baseBottom + jr}`,
    `Q ${baseX} ${baseBottom} ${bottomJoin.x} ${bottomJoin.y}`,
    `L ${bottomTip.x} ${bottomTip.y}`,
    `Q ${tipX} ${cy} ${topTip.x} ${topTip.y}`,
    `L ${topJoin.x} ${topJoin.y}`,
    `Q ${baseX} ${baseTop} ${baseX} ${baseTop - jr}`,
    `L ${bubbleX} ${bubbleY + r}`,
    `A ${r} ${r} 0 0 1 ${bubbleX + r} ${bubbleY}`,
    "Z",
  ].join(" ");
};
const buildTooltipPath = ({
  bubbleWidth,
  bubbleHeight,
  arrowWidth,
  arrowHeight,
  cornerRadius,
  arrowRadius,
  joinRadius,
  position,
}) => {
  if (position === "bottom") {
    return buildVerticalArrowPath({
      bubbleWidth,
      bubbleHeight,
      arrowWidth,
      arrowHeight,
      cornerRadius,
      arrowRadius,
      joinRadius,
      arrowOnTop: true,
    });
  }
  if (position === "left") {
    return buildHorizontalArrowPath({
      bubbleWidth,
      bubbleHeight,
      arrowWidth,
      arrowHeight,
      cornerRadius,
      arrowRadius,
      joinRadius,
      arrowOnLeft: false,
    });
  }
  if (position === "right") {
    return buildHorizontalArrowPath({
      bubbleWidth,
      bubbleHeight,
      arrowWidth,
      arrowHeight,
      cornerRadius,
      arrowRadius,
      joinRadius,
      arrowOnLeft: true,
    });
  }
  return buildVerticalArrowPath({
    bubbleWidth,
    bubbleHeight,
    arrowWidth,
    arrowHeight,
    cornerRadius,
    arrowRadius,
    joinRadius,
    arrowOnTop: false,
  });
};
const Tooltip = ({
  children,
  label = "",
  tooltip_component,
  position = "top",
  offset = 8,
  trigger = default_trigger,
  open_delay = 80,
  close_delay = 80,
  show_arrow = true,
  align = "center",
  arrow_size = 8,
  arrow_width,
  arrow_radius = 4,
  arrow_join_radius = 6,
  corner_radius = 6,
  style,
  wrapper_style,
  open,
  on_open_change,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const trigger_ref = useRef(null);
  const tooltip_ref = useRef(null);
  const content_ref = useRef(null);
  const [portal_element, setPortalElement] = useState(null);
  const open_timer_ref = useRef(null);
  const close_timer_ref = useRef(null);
  const open_ref = useRef(open);
  const has_open_sync_ref = useRef(false);

  /* --- tooltip trigger listener (global singleton) --- */
  const ttl_id_ref = useRef(`__ttl_${++_tooltipIdCounter}`);

  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false);
  const [isHoverPending, setIsHoverPending] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isClickOpen, setIsClickOpen] = useState(false);
  const [activePosition, setActivePosition] = useState(position);
  const [bubbleSize, setBubbleSize] = useState({ width: 0, height: 0 });
  const bubbleSizeRef = useRef({ width: 0, height: 0 });
  const [positionStyle, setPositionStyle] = useState({
    top: 0,
    left: 0,
    transform: "translate(-50%, -100%)",
  });
  const [isReady, setIsReady] = useState(false);

  const triggerList = useMemo(() => {
    if (Array.isArray(trigger)) return trigger;
    if (typeof trigger === "string") return [trigger];
    return default_trigger;
  }, [trigger]);

  const has_trigger = useCallback(
    (name) => triggerList.includes(name),
    [triggerList],
  );

  const isHoverEnabled = has_trigger("hover");
  const isFocusEnabled = has_trigger("focus");
  const isClickEnabled = has_trigger("click");
  const isControlled = open !== undefined;

  const derivedOpen =
    (isHoverEnabled && (isHoveringTrigger || isHoveringTooltip)) ||
    (isFocusEnabled && isFocused) ||
    (isClickEnabled && isClickOpen);
  const isOpen = isControlled ? open : derivedOpen;

  const content = tooltip_component !== undefined ? tooltip_component : label;

  const {
    backgroundColor: styleBackgroundColor,
    boxShadow: styleBoxShadow,
    color: styleTextColor,
    padding: stylePadding,
    borderRadius: styleBorderRadius,
    maxWidth: styleMaxWidth,
    fontSize: styleFontSize,
    lineHeight: styleLineHeight,
    fontFamily: styleFontFamily,
    ...contentStyleOverrides
  } = style || {};
  const arrowHeight = Math.max(0, toNumber(arrow_size, 8));
  const arrowWidthValue = Math.max(0, toNumber(arrow_width, arrowHeight * 2));
  const cornerRadiusValue = toNumber(styleBorderRadius, corner_radius);
  const arrowJoinRadiusValue = toNumber(arrow_join_radius, 4);
  const arrowRadiusValue = toNumber(arrow_radius, 2);

  const clear_open_timer = useCallback(() => {
    if (!open_timer_ref.current) return;
    clearTimeout(open_timer_ref.current);
    open_timer_ref.current = null;
  }, []);
  const clear_close_timer = useCallback(() => {
    if (!close_timer_ref.current) return;
    clearTimeout(close_timer_ref.current);
    close_timer_ref.current = null;
  }, []);

  const schedule_open = useCallback(
    (openFn) => {
      clear_open_timer();
      if (!open_delay || open_delay <= 0) {
        openFn();
        return;
      }
      open_timer_ref.current = setTimeout(() => {
        open_timer_ref.current = null;
        openFn();
      }, open_delay);
    },
    [clear_open_timer, open_delay],
  );
  const schedule_close = useCallback(
    (closeFn) => {
      clear_close_timer();
      if (!close_delay || close_delay <= 0) {
        closeFn();
        return;
      }
      close_timer_ref.current = setTimeout(() => {
        close_timer_ref.current = null;
        closeFn();
      }, close_delay);
    },
    [clear_close_timer, close_delay],
  );

  /* --- register / unregister with global listener --- */
  const force_close = useCallback(() => {
    clear_open_timer();
    clear_close_timer();
    setIsHoveringTrigger(false);
    setIsHoveringTooltip(false);
    setIsHoverPending(false);
    setIsFocused(false);
    setIsClickOpen(false);
    if (isControlled && on_open_change) {
      on_open_change(false);
    }
  }, [isControlled, on_open_change, clear_open_timer, clear_close_timer]);

  useEffect(() => {
    const id = ttl_id_ref.current;
    ttl_register(id, force_close);
    return () => {
      ttl_notifyClose(id);
      ttl_unregister(id);
    };
  }, [force_close]);

  useEffect(() => {
    if (isOpen) {
      ttl_requestOpen(ttl_id_ref.current);
    } else {
      ttl_notifyClose(ttl_id_ref.current);
    }
  }, [isOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const el = _acquirePortal();
    setPortalElement(el);
    return () => {
      _releasePortal();
    };
  }, []);
  useEffect(() => {
    return () => clear_close_timer();
  }, [clear_close_timer]);
  useEffect(() => {
    return () => clear_open_timer();
  }, [clear_open_timer]);

  useEffect(() => {
    if (!isClickEnabled) setIsClickOpen(false);
  }, [isClickEnabled]);
  useEffect(() => {
    open_ref.current = open;
  }, [open]);
  useEffect(() => {
    if (!isControlled) return;
    if (!isClickEnabled) return;
    setIsClickOpen(!!open);
  }, [open, isControlled, isClickEnabled]);
  useEffect(() => {
    if (!isControlled || !on_open_change) return;
    if (isClickEnabled) return;
    if (!isHoverEnabled && !isFocusEnabled) return;
    if (!has_open_sync_ref.current) {
      has_open_sync_ref.current = true;
      return;
    }
    if (derivedOpen === open_ref.current) return;
    on_open_change(derivedOpen);
  }, [
    derivedOpen,
    isControlled,
    on_open_change,
    isClickEnabled,
    isHoverEnabled,
    isFocusEnabled,
  ]);

  const measure_bubble = useCallback(() => {
    if (!content_ref.current) return null;
    const width = content_ref.current.offsetWidth;
    const height = content_ref.current.offsetHeight;
    if (!width && !height) return null;
    const size = { width, height };
    bubbleSizeRef.current = size;
    setBubbleSize((prev) =>
      prev.width === size.width && prev.height === size.height ? prev : size,
    );
    return size;
  }, []);

  const update_position = useCallback(
    (sizeOverride) => {
      if (!trigger_ref.current) return;
      const rect = trigger_ref.current.getBoundingClientRect();
      if (!rect) return;

      const size = sizeOverride || bubbleSizeRef.current;
      if (!size || (!size.width && !size.height)) return;

      const viewportWidth = window.innerWidth || 0;
      const viewportHeight = window.innerHeight || 0;
      const arrowExtent = show_arrow ? arrowHeight : 0;
      const resolvedAlign =
        align === "start" || align === "end" ? align : "center";

      const get_anchor = (pos) => {
        if (pos === "bottom") {
          const anchorX =
            resolvedAlign === "start"
              ? rect.left
              : resolvedAlign === "end"
                ? rect.right
                : rect.left + rect.width / 2;
          return {
            x: anchorX,
            y: rect.bottom + offset,
            transform:
              resolvedAlign === "start"
                ? "translate(0%, 0%)"
                : resolvedAlign === "end"
                  ? "translate(-100%, 0%)"
                  : "translate(-50%, 0%)",
          };
        }
        if (pos === "left") {
          return {
            x: rect.left - offset,
            y: rect.top + rect.height / 2,
            transform: "translate(-100%, -50%)",
          };
        }
        if (pos === "right") {
          return {
            x: rect.right + offset,
            y: rect.top + rect.height / 2,
            transform: "translate(0%, -50%)",
          };
        }
        const anchorX =
          resolvedAlign === "start"
            ? rect.left
            : resolvedAlign === "end"
              ? rect.right
              : rect.left + rect.width / 2;
        return {
          x: anchorX,
          y: rect.top - offset,
          transform:
            resolvedAlign === "start"
              ? "translate(0%, -100%)"
              : resolvedAlign === "end"
                ? "translate(-100%, -100%)"
                : "translate(-50%, -100%)",
        };
      };

      const get_size_for_pos = (pos, bubble) => {
        if (!bubble) return null;
        if (!show_arrow || arrowExtent <= 0) return bubble;
        if (pos === "top" || pos === "bottom") {
          return { width: bubble.width, height: bubble.height + arrowExtent };
        }
        return { width: bubble.width + arrowExtent, height: bubble.height };
      };

      const get_top_left = (pos, anchor, totalSize) => {
        if (!totalSize) return { left: anchor.x, top: anchor.y };
        if (pos === "bottom") {
          if (resolvedAlign === "start") {
            return { left: anchor.x, top: anchor.y };
          }
          if (resolvedAlign === "end") {
            return { left: anchor.x - totalSize.width, top: anchor.y };
          }
          return { left: anchor.x - totalSize.width / 2, top: anchor.y };
        }
        if (pos === "left") {
          return {
            left: anchor.x - totalSize.width,
            top: anchor.y - totalSize.height / 2,
          };
        }
        if (pos === "right") {
          return { left: anchor.x, top: anchor.y - totalSize.height / 2 };
        }
        if (resolvedAlign === "start") {
          return { left: anchor.x, top: anchor.y - totalSize.height };
        }
        if (resolvedAlign === "end") {
          return {
            left: anchor.x - totalSize.width,
            top: anchor.y - totalSize.height,
          };
        }
        return {
          left: anchor.x - totalSize.width / 2,
          top: anchor.y - totalSize.height,
        };
      };

      const get_overflow = (pos, bubble) => {
        const totalSize = get_size_for_pos(pos, bubble);
        if (!totalSize) {
          return { top: 0, bottom: 0, left: 0, right: 0 };
        }
        const anchor = get_anchor(pos);
        const topLeft = get_top_left(pos, anchor, totalSize);
        return {
          left: Math.max(0, -topLeft.left),
          right: Math.max(0, topLeft.left + totalSize.width - viewportWidth),
          top: Math.max(0, -topLeft.top),
          bottom: Math.max(0, topLeft.top + totalSize.height - viewportHeight),
        };
      };

      let nextPosition = position;
      const overflow = get_overflow(position, size);
      const mainOverflow =
        position === "top"
          ? overflow.top
          : position === "bottom"
            ? overflow.bottom
            : position === "left"
              ? overflow.left
              : overflow.right;
      if (mainOverflow > 0) {
        nextPosition =
          position === "top"
            ? "bottom"
            : position === "bottom"
              ? "top"
              : position === "left"
                ? "right"
                : "left";
      }

      const anchor = get_anchor(nextPosition);
      let anchorX = anchor.x;
      let anchorY = anchor.y;

      const adjustedSize = get_size_for_pos(nextPosition, size);
      if (adjustedSize) {
        if (nextPosition === "top" || nextPosition === "bottom") {
          if (resolvedAlign === "start") {
            const minX = 0;
            const maxX = viewportWidth - adjustedSize.width;
            anchorX = Math.min(Math.max(anchorX, minX), maxX);
          } else if (resolvedAlign === "end") {
            const minX = adjustedSize.width;
            const maxX = viewportWidth;
            anchorX = Math.min(Math.max(anchorX, minX), maxX);
          } else {
            const minX = adjustedSize.width / 2;
            const maxX = viewportWidth - adjustedSize.width / 2;
            anchorX = Math.min(Math.max(anchorX, minX), maxX);
          }
        } else {
          const minY = adjustedSize.height / 2;
          const maxY = viewportHeight - adjustedSize.height / 2;
          anchorY = Math.min(Math.max(anchorY, minY), maxY);
        }
      }

      setActivePosition(nextPosition);
      setPositionStyle({
        top: anchorY,
        left: anchorX,
        transform: anchor.transform,
      });
    },
    [position, offset, show_arrow, arrowHeight, align],
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      return;
    }
    const measured = measure_bubble();
    if (!measured) {
      setIsReady(false);
      return;
    }
    update_position(measured);
    setIsReady(true);
  }, [isOpen, measure_bubble, update_position, content, style]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let rafId = 0;
    const handleMove = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        update_position();
      });
    };
    window.addEventListener("scroll", handleMove, true);
    window.addEventListener("resize", handleMove);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleMove, true);
      window.removeEventListener("resize", handleMove);
    };
  }, [isOpen, update_position]);

  useEffect(() => {
    const isClickActive = isControlled ? open : isClickOpen;
    if (!isClickEnabled || !isClickActive) return undefined;
    const handleMouseDown = (e) => {
      if (trigger_ref.current?.contains(e.target)) return;
      if (tooltip_ref.current?.contains(e.target)) return;
      if (isControlled) {
        if (on_open_change) on_open_change(false);
      }
      setIsClickOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isControlled) {
          if (on_open_change) on_open_change(false);
        }
        setIsClickOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isClickEnabled, isClickOpen, isControlled, on_open_change, open]);

  const handle_trigger_mouse_enter = () => {
    if (!isHoverEnabled) return;
    /* Ignore scroll-induced mouseenter: if the page is scrolling and the
       mouse hasn't physically moved, this mouseenter was caused by DOM
       content scrolling under a stationary cursor, not real user intent. */
    if (!_mouseMovedSinceScroll) return;
    clear_close_timer();
    setIsHoverPending(true);
    schedule_open(() => {
      setIsHoveringTrigger(true);
      setIsHoverPending(false);
    });
  };
  const handle_trigger_focus = () => {
    if (!isFocusEnabled) return;
    setIsFocused(true);
  };
  const handle_trigger_blur = (e) => {
    if (!isFocusEnabled) return;
    if (tooltip_ref.current?.contains(e.relatedTarget)) return;
    setIsFocused(false);
  };
  const handle_trigger_click = () => {
    if (!isClickEnabled) return;
    clear_open_timer();
    setIsHoverPending(false);
    if (isControlled) {
      if (on_open_change) on_open_change(!open_ref.current);
      return;
    }
    setIsClickOpen((prev) => !prev);
  };

  const handle_tooltip_mouse_enter = () => {
    if (!isHoverEnabled) return;
    clear_close_timer();
    setIsHoveringTooltip(true);
  };
  const handle_mouse_move = useCallback(
    (e) => {
      if (!isHoverEnabled) return;
      const rect_trigger = trigger_ref.current?.getBoundingClientRect();
      const rect_tooltip = tooltip_ref.current?.getBoundingClientRect();
      if (!rect_trigger && !rect_tooltip) return;

      const x = e.clientX;
      const y = e.clientY;
      const in_trigger = rect_trigger
        ? x >= rect_trigger.left &&
          x <= rect_trigger.right &&
          y >= rect_trigger.top &&
          y <= rect_trigger.bottom
        : false;
      const in_tooltip = rect_tooltip
        ? x >= rect_tooltip.left &&
          x <= rect_tooltip.right &&
          y >= rect_tooltip.top &&
          y <= rect_tooltip.bottom
        : false;

      if (isHoverPending && !in_trigger) {
        clear_open_timer();
        setIsHoverPending(false);
      }

      if (in_trigger || in_tooltip) {
        clear_close_timer();
        return;
      }

      if (isHoveringTrigger || isHoveringTooltip) {
        schedule_close(() => {
          setIsHoveringTrigger(false);
          setIsHoveringTooltip(false);
        });
      }
    },
    [
      clear_close_timer,
      clear_open_timer,
      isHoverEnabled,
      isHoverPending,
      isHoveringTooltip,
      isHoveringTrigger,
      schedule_close,
    ],
  );

  useEffect(() => {
    if (!isHoverEnabled) return undefined;
    if (!isHoverPending && !isHoveringTrigger && !isHoveringTooltip) {
      return undefined;
    }
    window.addEventListener("mousemove", handle_mouse_move, { passive: true });
    return () => window.removeEventListener("mousemove", handle_mouse_move);
  }, [
    handle_mouse_move,
    isHoverEnabled,
    isHoverPending,
    isHoveringTrigger,
    isHoveringTooltip,
  ]);
  /* Forward wheel events through the portal boundary.
     When tooltip inner content is at its scroll boundary, propagate
     the wheel to the trigger's nearest scrollable ancestor so the
     page continues scrolling naturally. */
  const handle_tooltip_wheel = useCallback((e) => {
    /* Walk from the event target up to the tooltip root and check if
         any scrollable element can still consume the delta. */
    let node = e.target;
    const bubble = tooltip_ref.current;
    while (node && node !== bubble) {
      const cs = getComputedStyle(node);
      const scrollable = cs.overflowY === "auto" || cs.overflowY === "scroll";
      if (scrollable && node.scrollHeight > node.clientHeight) {
        const atTop = node.scrollTop <= 0 && e.deltaY < 0;
        const atBottom =
          node.scrollTop + node.clientHeight >= node.scrollHeight - 1 &&
          e.deltaY > 0;
        if (!atTop && !atBottom) return; // inner element still scrollable
      }
      node = node.parentElement;
    }

    /* Nothing inside the tooltip consumed the scroll —
         forward to the trigger's scroll parent. */
    const triggerEl = trigger_ref.current;
    if (!triggerEl) return;
    let parent = triggerEl.parentElement;
    while (parent) {
      const ps = getComputedStyle(parent);
      const isScrollable = ps.overflowY === "auto" || ps.overflowY === "scroll";
      if (isScrollable && parent.scrollHeight > parent.clientHeight) {
        parent.scrollBy({ top: e.deltaY });
        return;
      }
      parent = parent.parentElement;
    }
  }, []);

  const handle_tooltip_focus = () => {
    if (!isFocusEnabled) return;
    setIsFocused(true);
  };
  const handle_tooltip_blur = (e) => {
    if (!isFocusEnabled) return;
    if (trigger_ref.current?.contains(e.relatedTarget)) return;
    setIsFocused(false);
  };

  const isDarkMode = onThemeMode === "dark_mode";
  const defaultTooltipStyle = isDarkMode
    ? {
        color: "#111111",
        backgroundColor: "rgba(245, 245, 245, 0.96)",
        boxShadow: "0 8px 18px rgba(0, 0, 0, 0.45)",
      }
    : {
        color: "white",
        backgroundColor: "rgba(20, 20, 20, 0.92)",
        boxShadow: "0 6px 14px rgba(0, 0, 0, 0.28)",
      };
  const bubbleColor =
    styleBackgroundColor ??
    theme?.tooltip?.backgroundColor ??
    defaultTooltipStyle.backgroundColor;
  const textColor =
    styleTextColor ?? theme?.tooltip?.color ?? defaultTooltipStyle.color;
  const shadowValue =
    styleBoxShadow ??
    theme?.tooltip?.boxShadow ??
    defaultTooltipStyle.boxShadow;
  const contentPadding = stylePadding ?? "6px";
  const contentMaxWidth = styleMaxWidth ?? 260;
  const contentFontSize = styleFontSize ?? 12;
  const contentLineHeight = styleLineHeight ?? 1.4;
  const contentFontFamily =
    styleFontFamily ?? theme?.font?.fontFamily ?? "Jost";

  const arrowExtent = show_arrow ? arrowHeight : 0;
  const tooltipWidth =
    bubbleSize.width +
    (activePosition === "left" || activePosition === "right" ? arrowExtent : 0);
  const tooltipHeight =
    bubbleSize.height +
    (activePosition === "top" || activePosition === "bottom" ? arrowExtent : 0);
  const bubbleOffsetX = activePosition === "right" ? arrowExtent : 0;
  const bubbleOffsetY = activePosition === "bottom" ? arrowExtent : 0;
  const tooltipPath = useMemo(() => {
    if (!bubbleSize.width || !bubbleSize.height) return "";
    if (!show_arrow || arrowHeight <= 0 || arrowWidthValue <= 0) {
      return buildRoundedRectPath({
        x: 0,
        y: 0,
        width: bubbleSize.width,
        height: bubbleSize.height,
        radius: cornerRadiusValue,
      });
    }
    return buildTooltipPath({
      bubbleWidth: bubbleSize.width,
      bubbleHeight: bubbleSize.height,
      arrowWidth: arrowWidthValue,
      arrowHeight: arrowHeight,
      cornerRadius: cornerRadiusValue,
      arrowRadius: arrowRadiusValue,
      joinRadius: arrowJoinRadiusValue,
      position: activePosition,
    });
  }, [
    bubbleSize,
    show_arrow,
    arrowHeight,
    arrowWidthValue,
    cornerRadiusValue,
    arrowRadiusValue,
    arrowJoinRadiusValue,
    activePosition,
  ]);
  const dropShadow =
    shadowValue && shadowValue !== "none"
      ? `drop-shadow(${shadowValue})`
      : "none";
  const transformOrigin =
    activePosition === "bottom"
      ? "center top"
      : activePosition === "left"
        ? "right center"
        : activePosition === "right"
          ? "left center"
          : "center bottom";

  return (
    <>
      <div
        ref={trigger_ref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          ...wrapper_style,
        }}
        onMouseEnter={handle_trigger_mouse_enter}
        onFocus={handle_trigger_focus}
        onBlur={handle_trigger_blur}
        onClick={handle_trigger_click}
      >
        {children}
      </div>
      {portal_element &&
      isOpen &&
      content !== "" &&
      content !== undefined &&
      content !== null
        ? createPortal(
            <div
              ref={tooltip_ref}
              role="tooltip"
              style={{
                position: "fixed",
                top: positionStyle.top,
                left: positionStyle.left,
                transform: positionStyle.transform,
                zIndex: 9999,
                width: tooltipWidth,
                height: tooltipHeight,
                pointerEvents: isReady ? "auto" : "none",
                opacity: isReady ? 1 : 0,
                visibility: isReady ? "visible" : "hidden",
                transition: "opacity 120ms ease",
                willChange: "transform, opacity",
              }}
              onMouseEnter={handle_tooltip_mouse_enter}
              onFocus={handle_tooltip_focus}
              onBlur={handle_tooltip_blur}
              onWheel={handle_tooltip_wheel}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: tooltipWidth,
                  height: tooltipHeight,
                  transform: `scale(${isReady ? 1 : 0.9})`,
                  transformOrigin: transformOrigin,
                  transition:
                    "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  willChange: "transform",
                }}
              >
                {tooltipPath ? (
                  <svg
                    width={tooltipWidth}
                    height={tooltipHeight}
                    viewBox={`0 0 ${tooltipWidth} ${tooltipHeight}`}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      filter: dropShadow,
                      pointerEvents: "none",
                    }}
                  >
                    <path d={tooltipPath} fill={bubbleColor} />
                  </svg>
                ) : null}
                <div
                  ref={content_ref}
                  style={{
                    position: "absolute",
                    top: bubbleOffsetY,
                    left: bubbleOffsetX,
                    padding: contentPadding,
                    maxWidth: contentMaxWidth,
                    color: textColor,
                    fontSize: contentFontSize,
                    lineHeight: contentLineHeight,
                    fontFamily: contentFontFamily,
                    ...contentStyleOverrides,
                  }}
                >
                  {content}
                </div>
              </div>
            </div>,
            portal_element,
          )
        : null}
    </>
  );
};

export default Tooltip;
