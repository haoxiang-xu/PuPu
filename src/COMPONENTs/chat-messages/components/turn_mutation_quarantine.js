import { useEffect, useState } from "react";

import Button from "../../../BUILTIN_COMPONENTs/input/button";

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const OPEN_CURVE = "cubic-bezier(0.32, 0.72, 0, 1)";

/* Docked hold banner for a paused turn mutation. It caps the composer
   capsule: same frosted material, rounded only at the top, and the capsule
   squares its own top corners while a hold is visible so the two read as one
   surface. Expansion animates via the grid 0fr→1fr trick so no height is
   ever measured; the parent keeps the row mounted through the collapse. */
const TurnMutationQuarantine = ({
  hold,
  open = true,
  isDark = false,
  onRetry,
  onDiscard,
}) => {
  /* First paint starts collapsed so the entrance actually transitions. */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!hold?.operationId) {
      setEntered(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, [hold?.operationId]);

  if (!hold?.operationId) return null;

  const expanded = open && entered;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: expanded ? "1fr" : "0fr",
        opacity: expanded ? 1 : 0,
        transition: REDUCED_MOTION
          ? "none"
          : `grid-template-rows 0.26s ${OPEN_CURVE}, opacity 0.2s ease`,
        position: "relative",
        zIndex: 2,
      }}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>
        <div
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          data-testid="turn-mutation-quarantine"
          style={{
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 13,
            padding: "11px 12px 11px 18px",
            borderRadius: "16px 16px 0 0",
            border: "1px solid var(--pupu-border-mid)",
            borderBottom: "none",
            backgroundColor: isDark
              ? "color-mix(in srgb, var(--pupu-surface, rgb(30, 30, 30)) 60%, transparent)"
              : "color-mix(in srgb, var(--pupu-surface, rgb(255, 255, 255)) 72%, transparent)",
            backdropFilter: "blur(20px) saturate(130%)",
            WebkitBackdropFilter: "blur(20px) saturate(130%)",
            transform: expanded ? "translateY(0)" : "translateY(6px)",
            transition: REDUCED_MOTION
              ? "none"
              : `transform 0.26s ${OPEN_CURVE}`,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isDark ? "rgba(255, 184, 107, 0.95)" : "#a05e00",
              boxShadow: isDark
                ? "0 0 0 4px rgba(255,184,107,0.14)"
                : "0 0 0 4px rgba(160,94,0,0.1)",
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                lineHeight: "18px",
                color: isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.85)",
              }}
            >
              Message change paused
            </div>
            <div
              style={{
                fontSize: 12,
                lineHeight: "17px",
                marginTop: 1,
                color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.52)",
              }}
            >
              {hold.message}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <Button
              label="Retry"
              ariaLabel="Retry message change"
              onClick={() => onRetry?.(hold.operationId)}
              style={{
                fontSize: 12.5,
                paddingVertical: 6,
                paddingHorizontal: 14,
                borderRadius: 9,
                root: {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.06)",
                  color: isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.8)",
                  fontWeight: 600,
                },
                hoverBackgroundColor: isDark
                  ? "rgba(255,255,255,0.16)"
                  : "rgba(0,0,0,0.1)",
              }}
            />
            {hold.canDiscard && (
              <Button
                label="Discard"
                ariaLabel="Discard message change and restore text"
                onClick={() => onDiscard?.(hold.operationId)}
                style={{
                  fontSize: 12.5,
                  paddingVertical: 6,
                  paddingHorizontal: 14,
                  borderRadius: 9,
                  root: {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.045)"
                      : "rgba(0,0,0,0.028)",
                    color: isDark
                      ? "rgba(255,255,255,0.62)"
                      : "rgba(0,0,0,0.56)",
                    fontWeight: 600,
                  },
                  hoverBackgroundColor: isDark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.07)",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TurnMutationQuarantine;
