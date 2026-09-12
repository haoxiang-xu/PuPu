import { useSyncExternalStore } from "react";

import {
  getPresentationPlatform,
  subscribePresentationPlatform,
} from "../../SERVICEs/platform_presentation";

/* The platform the UI presents as (#256): the host, or in a development
   Electron build the developer's override from Settings → Developer. One
   subscription over the settings repository, so a change of the override
   re-renders every platform-conditional surface without a reload. */
const usePresentationPlatform = () =>
  useSyncExternalStore(
    subscribePresentationPlatform,
    getPresentationPlatform,
    getPresentationPlatform,
  );

export default usePresentationPlatform;
