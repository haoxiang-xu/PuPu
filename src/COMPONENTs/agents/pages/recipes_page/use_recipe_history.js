import { useCallback, useEffect, useRef, useState } from "react";

const MAX_PAST = 50;

function capN(arr, n) {
  return arr.length > n ? arr.slice(arr.length - n) : arr;
}

export default function useRecipeHistory(activeName) {
  const [present, setPresent] = useState(null);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const presentRef = useRef(null);
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const coalesceFlag = useRef(false);

  useEffect(() => {
    presentRef.current = present;
  }, [present]);
  useEffect(() => {
    pastRef.current = past;
  }, [past]);
  useEffect(() => {
    futureRef.current = future;
  }, [future]);

  useEffect(() => {
    setPresent(null);
    setPast([]);
    setFuture([]);
    presentRef.current = null;
    pastRef.current = [];
    futureRef.current = [];
    coalesceFlag.current = false;
  }, [activeName]);

  const setRecipe = useCallback((next) => {
    if (!coalesceFlag.current) {
      const prev = presentRef.current;
      const newPast = capN([...pastRef.current, prev], MAX_PAST);
      pastRef.current = newPast;
      futureRef.current = [];
      setPast(newPast);
      setFuture([]);
      coalesceFlag.current = true;
      queueMicrotask(() => {
        coalesceFlag.current = false;
      });
    }
    presentRef.current = next;
    setPresent(next);
  }, []);

  const setRecipeSilent = useCallback((next) => {
    presentRef.current = next;
    setPresent(next);
  }, []);

  const undo = useCallback(() => {
    const p = pastRef.current;
    if (p.length === 0) return;
    const prev = p[p.length - 1];
    const remaining = p.slice(0, -1);
    const oldPresent = presentRef.current;
    const newFuture = [...futureRef.current, oldPresent];
    pastRef.current = remaining;
    futureRef.current = newFuture;
    presentRef.current = prev;
    setPast(remaining);
    setFuture(newFuture);
    setPresent(prev);
  }, []);

  const redo = useCallback(() => {
    const f = futureRef.current;
    if (f.length === 0) return;
    const next = f[f.length - 1];
    const remaining = f.slice(0, -1);
    const oldPresent = presentRef.current;
    const newPast = capN([...pastRef.current, oldPresent], MAX_PAST);
    pastRef.current = newPast;
    futureRef.current = remaining;
    presentRef.current = next;
    setPast(newPast);
    setFuture(remaining);
    setPresent(next);
  }, []);

  return {
    recipe: present,
    setRecipe,
    setRecipeSilent,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
