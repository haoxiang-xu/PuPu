import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";

const REFRESH_INTERVAL = 60_000;

/**
 * Fetches availability for every unique characterId found in the chat store.
 * Returns a map: characterId → availability string (e.g. "available", "busy").
 *
 * @param {Object} chatsById - chatStore.chatsById
 * @returns {Object} characterId → availability
 */
export const useCharacterAvailability = (chatsById) => {
  const [availabilityMap, setAvailabilityMap] = useState({});
  const cancelledRef = useRef(false);

  const characterIds = useMemo(() => {
    const ids = new Set();
    if (chatsById) {
      for (const chat of Object.values(chatsById)) {
        if (chat?.kind === "character" && chat?.characterId) {
          ids.add(chat.characterId);
        }
      }
    }
    return [...ids];
  }, [chatsById]);

  useEffect(() => {
    cancelledRef.current = false;

    if (characterIds.length === 0) {
      setAvailabilityMap({});
      return;
    }

    const fetchAll = async () => {
      const next = {};
      await Promise.all(
        characterIds.map(async (cid) => {
          try {
            const result = await api.unchain.previewCharacterDecision({
              characterId: cid,
            });
            const val =
              typeof result?.evaluation?.availability === "string"
                ? result.evaluation.availability
                : "";
            next[cid] = val;
          } catch (_) {
            next[cid] = "";
          }
        }),
      );
      if (!cancelledRef.current) {
        setAvailabilityMap(next);
      }
    };

    fetchAll();
    const timer = setInterval(fetchAll, REFRESH_INTERVAL);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [characterIds]);

  return availabilityMap;
};
