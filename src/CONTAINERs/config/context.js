import { createContext } from "react";

/* Legacy combined context — still usable, but prefer the granular contexts below
   to avoid re-rendering on unrelated state changes (e.g. window resize). */
export const ConfigContext = createContext("");

/* Granular sub-contexts — subscribe only to what you need.
   Each is also included in ConfigContext for backward compatibility. */
export const ThemeContext = createContext(null);
export const EnvironmentContext = createContext(null);
export const NavigationContext = createContext(null);
