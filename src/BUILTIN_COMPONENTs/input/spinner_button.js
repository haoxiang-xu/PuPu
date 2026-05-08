import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import ArcSpinner from "../spinner/arc_spinner";

export default function SpinnerButton({
  pending: pendingProp,
  disabled,
  onClick,
  children,
  spinnerSize = 14,
  style,
  ...rest
}) {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [autoPending, setAutoPending] = useState(false);
  const [minWidth, setMinWidth] = useState(null);
  const btnRef = useRef(null);

  const pending = pendingProp || autoPending;
  const blocked = pending || disabled;

  useEffect(() => {
    if (btnRef.current && minWidth == null) {
      setMinWidth(btnRef.current.offsetWidth);
    }
  }, [minWidth, children]);

  const handleClick = (e) => {
    if (blocked) { e.preventDefault(); return; }
    const result = onClick?.(e);
    if (result && typeof result.then === "function") {
      setAutoPending(true);
      result.finally(() => setAutoPending(false));
    }
  };

  return (
    <button ref={btnRef} onClick={handleClick} disabled={blocked} style={{
      minWidth: minWidth ?? undefined,
      opacity: disabled ? 0.4 : 1,
      cursor: pending ? "wait" : (disabled ? "not-allowed" : "pointer"),
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      ...style,
    }} {...rest}>
      {pending
        ? <ArcSpinner size={spinnerSize} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
        : children}
    </button>
  );
}
