import { useCallback } from "react";
import { toast } from "../../SERVICEs/toast";

export default function useOptimisticUpdate() {
  const apply = useCallback(async ({ optimistic, commit, rollback, guard, label = "操作" }) => {
    try { optimistic(); } catch (e) { console.error("[optimistic] threw:", e); return; }
    await new Promise((r) => queueMicrotask(r));
    try {
      await commit();
    } catch (err) {
      const shouldRollback = guard ? !!guard() : true;
      if (shouldRollback) {
        try { rollback(err); } catch (e) { console.error("[rollback] threw:", e); }
      }
      toast.error(`${label}: ${err?.message || "失败"}`);
    }
  }, []);

  return { apply };
}
