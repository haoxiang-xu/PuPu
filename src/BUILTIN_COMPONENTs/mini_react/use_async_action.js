import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../../SERVICEs/toast";
import { start as progressStart, stop as progressStop } from "../../SERVICEs/progress_bus";

let nextInstanceId = 1;

function isAbort(err) {
  return err && (err.name === "AbortError" || err.code === "ABORT_ERR");
}

export default function useAsyncAction(action, options = {}) {
  const {
    label = "action",
    pendingDelayMs = 200,
    progressThresholdMs = 300,
    onError,
    onSuccess,
  } = options;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const runningRef = useRef(false);
  const abortRef = useRef(null);
  const pendingTimerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const progressIdRef = useRef(null);
  const idRef = useRef(`async-${nextInstanceId++}`);
  const mountedRef = useRef(true);

  const actionRef = useRef(action);
  const labelRef = useRef(label);
  const pendingDelayRef = useRef(pendingDelayMs);
  const progressThresholdRef = useRef(progressThresholdMs);
  const onErrorRef = useRef(onError);
  const onSuccessRef = useRef(onSuccess);
  actionRef.current = action;
  labelRef.current = label;
  pendingDelayRef.current = pendingDelayMs;
  progressThresholdRef.current = progressThresholdMs;
  onErrorRef.current = onError;
  onSuccessRef.current = onSuccess;

  useEffect(() => () => {
    mountedRef.current = false;
    if (abortRef.current) abortRef.current.abort();
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    if (progressIdRef.current) progressStop(progressIdRef.current);
  }, []);

  const cleanup = useCallback(() => {
    if (pendingTimerRef.current) { clearTimeout(pendingTimerRef.current); pendingTimerRef.current = null; }
    if (progressTimerRef.current) { clearTimeout(progressTimerRef.current); progressTimerRef.current = null; }
    if (progressIdRef.current) { progressStop(progressIdRef.current); progressIdRef.current = null; }
  }, []);

  const run = useCallback(async (...args) => {
    if (runningRef.current) return undefined;
    runningRef.current = true;
    setError(null);

    const ac = new AbortController();
    abortRef.current = ac;

    pendingTimerRef.current = setTimeout(() => {
      if (mountedRef.current && runningRef.current) setPending(true);
    }, pendingDelayRef.current);

    progressTimerRef.current = setTimeout(() => {
      if (runningRef.current) {
        const pid = `${idRef.current}-${Date.now()}`;
        progressIdRef.current = pid;
        progressStart(pid, labelRef.current);
      }
    }, progressThresholdRef.current);

    try {
      const result = await actionRef.current(...args, { signal: ac.signal });
      cleanup();
      runningRef.current = false;
      if (mountedRef.current) setPending(false);
      if (onSuccessRef.current) onSuccessRef.current(result);
      return result;
    } catch (err) {
      cleanup();
      runningRef.current = false;
      if (mountedRef.current) { setPending(false); setError(err); }
      if (isAbort(err)) return undefined;
      if (onErrorRef.current) onErrorRef.current(err);
      else toast.error(`${labelRef.current}: ${err?.message || "失败"}`);
      return undefined;
    }
  }, [cleanup]);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
