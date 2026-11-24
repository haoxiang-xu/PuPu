import ShadowSurface from "../material/shadow_surface";
import { parseSurfaceColor } from "../material/surface_composite";
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
import { Z } from "../layer/z_layers";
import { ConfigContext } from "../../CONTAINERs/config/context";
import {
  register as ttl_register,
  unregister as ttl_unregister,
  requestOpen as ttl_requestOpen,
  notifyClose as ttl_notifyClose,
  isClickInNestedTooltip as ttl_isClickInNestedTooltip,
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
/* Gap kept between any bubble and the window edge. */
const VIEWPORT_MARGIN = 8;
/* Clamp into [min, max]; when the range is empty (bubble wider/taller than
   the room) pin to `min` so the start edge stays readable. */
const clamp_into = (value, min, max) => Math.max(min, Math.min(value, max));
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
function is_focus_visible(element) {
  try {
    return element.matches(":focus-visible");
  } catch (_) {
    return true;
  }
}

const Tooltip = ({
  children,
  label = "",
  tooltip_component,
  position = "top",
  offset = 8,
  trigger = default_trigger,
  open_delay = 80,
  close_delay = 80,
  /* Opt-in: with the "focus" trigger, open only for focus the user can see
     (keyboard, or a text field), not for the focus a button keeps after a
     click — the pointer already answered that with the hover. */
  focus_visible_only = false,
  show_arrow = true,
  align = "center",
  arrow_size = 8,
  arrow_width,
  arrow_radius = 4,
  arrow_join_radius = 6,
  corner_radius = 6,
  style,
  wrapper_style,
  /* Interactive viewers share this engine but sit above ordinary hints. */
  layer = "tooltip",
  open,
  on_open_change,
  /* Keep the bubble on an anchor that MOVES while the bubble is open — an
     anchor inside a panel that is animating into place, say. Scroll and
     resize are already handled; this watches the trigger's own rect every
     frame and re-positions the moment it changes. Off by default: most
     anchors never move, and a frame loop is not free. */
  follow_trigger = false,
  /* Opt-in: place the bubble against a part of the trigger rather than its
     whole box — a trigger whose shape is wider than what it stands for. The
     whole trigger still opens it. Horizontal placement only: the bubble
     keeps its distance from the trigger's own edge. */
  anchor_selector,
  /* Opt-in for menus (Select dropdowns): the bubble never grows past the
     window. Its content box becomes a column whose max size is the room on
     the chosen side, so a panel with `minHeight: 0` and a scrollable list
     shrinks into the window and scrolls instead of being cut off. Width
     follows the window too instead of the plain-tooltip 260px cap. */
  fit_viewport = false,
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
  const focused_ref = useRef(null);
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
  /* fit_viewport: room (px) on the side the bubble opened to; null = not
     measured yet this open, so the first measure sees the natural size. */
  const [availableHeight, setAvailableHeight] = useState(null);

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
    ttl_register(
      id,
      force_close,
      () => tooltip_ref.current,
      () => trigger_ref.current,
    );
    return () => {
      ttl_notifyClose(id);
      ttl_unregister(id);
    };
  }, [force_close]);

  useEffect(() => {
    if (isOpen) {
      ttl_requestOpen(ttl_id_ref.current, trigger_ref.current);
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
      const whole = trigger_ref.current.getBoundingClientRect();
      if (!whole) return;
      const part = anchor_selector ? trigger_ref.current.querySelector(anchor_selector) : null;
      const partRect = part ? part.getBoundingClientRect() : null;
      const rect = partRect && partRect.width > 0
        ? { left: partRect.left, right: partRect.right, width: partRect.width,
            top: whole.top, bottom: whole.bottom, height: whole.height }
        : whole;

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

      const opposite = {
        top: "bottom",
        bottom: "top",
        left: "right",
        right: "left",
      };
      const vertical = position === "top" || position === "bottom";
      const M = VIEWPORT_MARGIN;
      /* Room along the main axis on each side, after offset, arrow and the
         window margin. */
      const room = {
        top: rect.top - offset - arrowExtent - M,
        bottom: viewportHeight - rect.bottom - offset - arrowExtent - M,
        left: rect.left - offset - arrowExtent - M,
        right: viewportWidth - rect.right - offset - arrowExtent - M,
      };
      const need = vertical ? size.height : size.width;

      /* Preferred side if it fits; else the opposite if that fits; else
         whichever side has more room (fit_viewport then shrinks into it).
         Stable under the shrink: once clamped to the bigger side's room the
         bubble still does not fit the smaller preferred side. */
      let nextPosition = position;
      if (need > room[position]) {
        const other = opposite[position];
        if (need <= room[other] || room[other] > room[position]) {
          nextPosition = other;
        }
      }

      const anchor = get_anchor(nextPosition);
      let anchorX = anchor.x;
      let anchorY = anchor.y;

      const adjustedSize = get_size_for_pos(nextPosition, size);
      if (adjustedSize) {
        const w = adjustedSize.width;
        const h = adjustedSize.height;
        if (nextPosition === "top" || nextPosition === "bottom") {
          /* anchorX is the bubble's start / end / centre depending on align;
             convert the window box [M, vw - M] into that frame. */
          const shift =
            resolvedAlign === "start" ? 0 : resolvedAlign === "end" ? w : w / 2;
          anchorX = clamp_into(anchorX, M + shift, viewportWidth - M - w + shift);
        } else {
          anchorY = clamp_into(
            anchorY,
            M + h / 2,
            viewportHeight - M - h / 2,
          );
        }
      }

      if (fit_viewport) {
        const nextAvailable = Math.max(
          0,
          Math.floor(
            nextPosition === "top" || nextPosition === "bottom"
              ? room[nextPosition]
              : viewportHeight - 2 * M,
          ),
        );
        setAvailableHeight((prev) =>
          prev === nextAvailable ? prev : nextAvailable,
        );
      }

      setActivePosition(nextPosition);
      setPositionStyle({
        top: anchorY,
        left: anchorX,
        transform: anchor.transform,
      });
    },
    [position, offset, show_arrow, arrowHeight, align, anchor_selector, fit_viewport],
  );

  useLayoutEffect(() => {
    if (!isOpen) {
      setIsReady(false);
      setAvailableHeight(null);
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

  /* Re-position whenever the tooltip content resizes (e.g. list filter,
     group collapse) — without this the bubble stays at its original coords
     until the next unrelated re-render. */
  useEffect(() => {
    if (!isOpen) return undefined;
    const el = content_ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const measured = measure_bubble();
        if (measured) update_position(measured);
      });
    });
    ro.observe(el);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [isOpen, measure_bubble, update_position]);

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
    if (!isOpen || !follow_trigger) return undefined;
    if (typeof requestAnimationFrame !== "function") return undefined;
    let rafId = 0;
    let last = null;
    const tick = () => {
      const el = trigger_ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const key = `${rect.left}|${rect.top}|${rect.width}|${rect.height}`;
        if (last !== null && key !== last) {
          update_position(measure_bubble() || undefined);
        }
        last = key;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isOpen, follow_trigger, update_position, measure_bubble]);

  useEffect(() => {
    const isClickActive = isControlled ? open : isClickOpen;
    if (!isClickEnabled || !isClickActive) return undefined;
    const handleMouseDown = (e) => {
      if (trigger_ref.current?.contains(e.target)) return;
      if (tooltip_ref.current?.contains(e.target)) return;
      /* Every tooltip bubble renders into the SAME shared portal root
         (_acquirePortal), as a DOM SIBLING of every other one — not a
         descendant of whichever tooltip's own trigger it visually sits
         inside of. A tooltip nested inside another one's content (e.g. a
         Select's own dropdown rendered inside an already-open popover) is
         therefore invisible to the containment checks above: the click lands
         outside THIS tooltip's own trigger/bubble nodes even though it is
         squarely inside the popover the user is still interacting with,
         closing the outer one out from under them. Only exempt clicks
         inside a genuine CHILD popover (one opened from within this
         tooltip's own bubble) — a click elsewhere in the shared portal,
         e.g. some other row in this same popover, must still close THIS
         tooltip normally when it isn't the one being clicked into. */
      if (ttl_isClickInNestedTooltip(tooltip_ref.current, e.target)) return;
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
    /* CAPTURE phase, deliberately. Portal content bubbles through the REACT
       tree, not the DOM tree — a popover physically portaled to document.body
       still has its React ancestors wherever its component sits (e.g. the
       attach panel's stop-propagation selectWrap around the trigger). Any
       ancestor's synthetic stopPropagation kills the native mousedown at
       React's delegation point, so a bubble-phase document listener would
       simply never fire for clicks INSIDE such a popover — leaving a nested
       dropdown unable to close on them. Capture runs on the way DOWN, before
       any of that; the containment checks above only read e.target, so the
       phase changes nothing else. */
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
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
  const handle_trigger_focus = (e) => {
    if (!isFocusEnabled) return;
    if (focus_visible_only && !is_focus_visible(e.target)) return;
    focused_ref.current = e.target;
    setIsFocused(true);
  };
  const handle_trigger_blur = (e) => {
    if (!isFocusEnabled) return;
    if (tooltip_ref.current?.contains(e.relatedTarget)) return;
    setIsFocused(false);
  };
  /* A focused control can lose focus without a blur: it is unmounted (a Run
     button that becomes Stop) or disabled, and the browser moves focus to
     the body silently. Without this check the bubble stays open for good.
     Checked whenever the trigger's children are rendered anew, which is when
     a control can be swapped out or disabled. */
  useEffect(() => {
    if (!isFocused) return;
    const focused = focused_ref.current;
    if (focused && trigger_ref.current?.contains(focused) && !focused.disabled) return;
    focused_ref.current = null;
    setIsFocused(false);
  }, [isFocused, children]);

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
  const contentMaxWidth =
    styleMaxWidth ??
    (fit_viewport ? `calc(100vw - ${VIEWPORT_MARGIN * 2}px)` : 260);
  /* fit_viewport: a column capped at the measured room, so a shrinkable
     child (minHeight: 0) gives up height and scrolls inside. */
  const fitStyle = fit_viewport
    ? {
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        maxHeight:
          availableHeight !== null
            ? availableHeight
            : `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
      }
    : null;
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
                zIndex: layer === "popover" ? Z.POPOVER : Z.TOOLTIP,
                width: tooltipWidth,
                height: tooltipHeight,
                pointerEvents: isReady ? "auto" : "none",
                opacity: isReady ? 1 : 0,
                visibility: isReady ? "visible" : "hidden",
                transition: "opacity 120ms ease",
                /* will-change: opacity forms a backdrop root even at
                   opacity 1, which kills any descendant backdrop-filter
                   (e.g. the palette dropdown) — hint only while animating */
                willChange: isReady ? "auto" : "transform, opacity",
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
                  transform: isReady ? "none" : "scale(0.9)",
                  transformOrigin: transformOrigin,
                  transition:
                    "transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  willChange: isReady ? "auto" : "transform",
                }}
              >
                {tooltipPath ? (
                  <ShadowSurface as="svg"
                    shadowShape={{ path: tooltipPath, shadow: shadowValue, opacity: parseSurfaceColor(bubbleColor)?.[3] ?? 1 }}
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
                  </ShadowSurface>
                ) : null}
                <div
                  ref={content_ref}
                  style={{
                    position: "absolute",
                    top: bubbleOffsetY,
                    left: bubbleOffsetX,
                    padding: contentPadding,
                    // Measure intrinsic content independently of the bubble.
                    // Otherwise an auto-width box inherits the previous
                    // measurement plus the side arrow, growing on each RO tick.
                    width: "max-content",
                    maxWidth: contentMaxWidth,
                    color: textColor,
                    fontSize: contentFontSize,
                    lineHeight: contentLineHeight,
                    fontFamily: contentFontFamily,
                    ...fitStyle,
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
