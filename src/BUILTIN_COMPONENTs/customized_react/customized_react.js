import { useState, useEffect, useRef } from "react";
import { stringify } from "flatted";

const useCustomizedState = (initialValue, compareFunction) => {
  const [state, setState] = useState(initialValue);
  const prevStateRef = useRef();

  useEffect(() => {
    prevStateRef.current = state;
  });

  const set_custom_state = (newState) => {
    if (!compareFunction(prevStateRef.current, newState)) {
      setState(newState);
    }
  };

  return [state, set_custom_state];
};
const compareJson = (prev, next) => {
  return stringify(prev) === stringify(next);
};

export { useCustomizedState, compareJson };
