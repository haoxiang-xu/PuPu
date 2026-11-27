import { useSyncExternalStore } from "react";

/* The side menu's search field stays put while its panes slide; in the
   Agents pane it searches the agent list, which the Agents workspace draws
   into that pane. This is the query they share: the field writes it, the
   docked list reads it. Kept out of the app's contexts so a keystroke only
   re-renders the two of them. Session-only, like the pane itself. */
let query = "";
const listeners = new Set();

export const getAgentsSidebarSearch = () => query;

export const setAgentsSidebarSearch = (value) => {
  const next = String((typeof value === "function" ? value(query) : value) ?? "");
  if (next === query) return;
  query = next;
  listeners.forEach((listener) => listener());
};

export const subscribeAgentsSidebarSearch = (listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useAgentsSidebarSearch = () => [
  useSyncExternalStore(subscribeAgentsSidebarSearch, getAgentsSidebarSearch, getAgentsSidebarSearch),
  setAgentsSidebarSearch,
];
