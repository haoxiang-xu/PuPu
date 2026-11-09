import { agentError, agentMessage, agentProblemMessage } from "./agents_i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import { accept_run_observation, observation_finished } from "./run_observation_state";

const initial = (key) => ({ key, run: null, phase: key ? "loading" : "closed", error: null, refreshing: false });
const nothing = () => {};

/* One in-flight read per opened view. Timers read persisted state only; they
 * never touch the pending/recovery or execution entry points. The key and live
 * ticket fence even a promise answering after navigation/unmount. */
export default function useSkeletonRunObservation(scope) {
  const key = scope ? JSON.stringify([scope.owner_chat_id, scope.execution_id, scope.resource_id, scope.root_run_id]) : null;
  const currentKey = useRef(key);
  currentKey.current = key;
  const [state, setState] = useState(() => initial(key));
  const refreshRef = useRef(nothing);
  const refresh = useCallback(() => refreshRef.current(), []);
  useEffect(() => {
    let live = true;
    let busy = false;
    let timer = null;
    let run = null;
    setState(initial(key));
    if (!scope) { refreshRef.current = nothing; return undefined; }
    const request = { owner_chat_id: scope.owner_chat_id, execution_id: scope.execution_id, resource_id: scope.resource_id,
      ...(scope.root_run_id ? { root_run_id: scope.root_run_id } : {}) };
    const wanted = () => live && currentKey.current === key;
    const read = async () => {
      if (!wanted() || busy) return;
      clearTimeout(timer);
      busy = true;
      setState((previous) => ({ ...previous, refreshing: true }));
      try {
        const method = api.unchain.getSkeletonRunObservation;
        if (typeof method !== "function") throw agentError("agents.runtime.observation_unavailable");
        const result = await method({ ...request, ...(run ? { root_run_id: run.root_run_id } : {}) });
        if (!wanted()) return;
        if (!result || result.ok !== true) throw (typeof result?.error?.message === "string" ? new Error(result.error.message) : agentError("agents.runtime.observation_failed"));
        const accepted = accept_run_observation(run, result.data.run, request);
        if (!accepted.ok) throw agentError("agents.runtime.observation_rejected", { code: accepted.error });
        run = accepted.run;
        setState({ key, run, phase: run ? "ready" : "empty", error: null, refreshing: false });
      } catch (error) {
        if (wanted()) setState({ key, run, phase: "error", error: typeof error?.message === "string" ? error.message : "The recorded run could not be read.", errorCaption: typeof error?.message === "string" ? agentProblemMessage(error, agentMessage) : agentMessage("agents.runtime.observation_failed"), refreshing: false });
      } finally {
        busy = false;
        if (wanted() && !observation_finished(run)) timer = setTimeout(read, 2500);
      }
    };
    refreshRef.current = read;
    read();
    return () => { live = false; clearTimeout(timer); refreshRef.current = nothing; };
    // Only exact scope identity opens another observation, not a rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ...(state.key === key ? state : initial(key)), refresh };
}
