import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { subscribe } from "../../SERVICEs/toast_bus";

const DEDUPE_WINDOW_MS = 2000;

export default function ToastHost() {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [items, setItems] = useState([]);
  const dedupeRef = useRef(new Map());
  const timersRef = useRef(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    const unsub = subscribe((event) => {
      if (event.kind === "dismiss") {
        setItems((prev) => prev.filter((it) => it.id !== event.id));
        const t = timers.get(event.id);
        if (t) { clearTimeout(t); timers.delete(event.id); }
        return;
      }
      if (event.kind !== "show") return;
      const now = Date.now();
      const last = dedupeRef.current.get(event.dedupeKey);
      if (last && now - last < DEDUPE_WINDOW_MS) return;
      dedupeRef.current.set(event.dedupeKey, now);
      setItems((prev) => [...prev, event]);
      const t = setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== event.id));
        timers.delete(event.id);
      }, event.duration);
      timers.set(event.id, t);
    });
    return () => {
      unsub();
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {items.map((item) => {
        const borderColor = item.type === "error"
          ? (isDark ? "#c04a4a" : "#cc3333")
          : item.type === "success"
            ? (isDark ? "#4aa84a" : "#339933")
            : (isDark ? "#555" : "#ccc");
        return (
          <div key={item.id}
            onClick={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
            style={{
              padding: "8px 12px",
              border: `1px solid ${borderColor}`,
              color: isDark ? "#eee" : "#222",
              background: isDark ? "#1e1e1e" : "#fff",
              fontSize: 13, cursor: "pointer", pointerEvents: "auto",
              minWidth: 180, maxWidth: 360,
            }}>
            {item.message}
          </div>
        );
      })}
    </div>
  );
}
