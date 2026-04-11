import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";

const SectionLabel = ({ children, isDark }) => {
  const { theme } = useContext(ConfigContext);
  return (
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "1.6px",
        fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
        color: isDark ? "#fff" : "#222",
        opacity: 0.3,
        padding: "20px 0 10px",
        userSelect: "none",
      }}
    >
      {children}
    </div>
  );
};

export default SectionLabel;
