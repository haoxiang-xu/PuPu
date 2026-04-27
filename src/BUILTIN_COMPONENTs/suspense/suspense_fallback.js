import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ArcSpinner from "../spinner/arc_spinner";

export default function SuspenseFallback({ minHeight = 120, fullscreen = false }) {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const layout = fullscreen
    ? { position: "fixed", inset: 0, pointerEvents: "none" }
    : { minHeight, width: "100%" };
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      ...layout,
    }}>
      <ArcSpinner size={24} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
    </div>
  );
}
