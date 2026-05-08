import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { subscribe } from "../../SERVICEs/progress_bus";

export default function TopProgressBar() {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [phase, setPhase] = useState("idle");
  const [widthPct, setWidthPct] = useState(0);
  const finishTimerRef = useRef(null);

  useEffect(() => {
    const unsub = subscribe(({ count }) => {
      if (finishTimerRef.current) { clearTimeout(finishTimerRef.current); finishTimerRef.current = null; }
      if (count > 0) {
        setPhase("running");
        setWidthPct(0);
        requestAnimationFrame(() => setWidthPct(80));
      } else {
        setPhase("finishing");
        setWidthPct(100);
        finishTimerRef.current = setTimeout(() => {
          setPhase("idle");
          setWidthPct(0);
        }, 200);
      }
    });
    return () => {
      unsub();
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  if (phase === "idle") return null;

  return (
    <div data-testid="top-progress-bar" style={{
      position: "fixed", top: 0, left: 0,
      height: 2, width: `${widthPct}%`,
      background: isDark ? "#4a9fd4" : "#2a7fc4",
      zIndex: 10000,
      transition: "width 400ms ease-out, opacity 200ms ease-out",
      opacity: phase === "finishing" ? 0 : 1,
      pointerEvents: "none",
    }} />
  );
}
