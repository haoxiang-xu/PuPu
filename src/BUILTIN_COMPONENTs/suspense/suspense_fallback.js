import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ArcSpinner from "../spinner/arc_spinner";

export default function SuspenseFallback({ minHeight = 120 }) {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight, width: "100%",
    }}>
      <ArcSpinner size={24} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
    </div>
  );
}
