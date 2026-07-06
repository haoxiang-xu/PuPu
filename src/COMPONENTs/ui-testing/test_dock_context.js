import { createContext } from "react";

/**
 * Value: { dockEl: HTMLElement|null, registerControls: (on:boolean)=>void } | null
 * The modal provides the dock's portal target + a registration counter so it
 * can hide the dock when the selected runner declares no controls.
 */
export const TestDockContext = createContext(null);
