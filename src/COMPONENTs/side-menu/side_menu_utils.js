import { getPresentationPlatform } from "../../SERVICEs/platform_presentation";

/* The platform the UI presents as (#256) — the host, or the developer's
   override in a dev build. Components that must re-render when the override
   changes use the `usePresentationPlatform` hook instead of this getter. */
export const getRuntimePlatform = () => getPresentationPlatform();
