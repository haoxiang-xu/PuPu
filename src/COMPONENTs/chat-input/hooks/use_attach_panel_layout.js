import { useSyncExternalStore } from "react";

import {
  readAttachPanelLayout,
  subscribeAttachPanelLayout,
} from "../../../SERVICEs/attach_panel_layout";

/* The settings repository is the one store; a write from the arrange mode,
   from another mounted panel, or from a settings reset reaches every panel
   through its subscription. Snapshots are compared by reference, so the
   layout object is cached per underlying record and only replaced when a
   write of this namespace lands. */
let cachedLayout = null;
let cachedSerialized = null;
const getSnapshot = () => {
  const next = readAttachPanelLayout();
  const serialized = JSON.stringify(next);
  if (serialized !== cachedSerialized) {
    cachedSerialized = serialized;
    cachedLayout = next;
  }
  return cachedLayout;
};

const useAttachPanelLayout = () =>
  useSyncExternalStore(subscribeAttachPanelLayout, getSnapshot, getSnapshot);

export default useAttachPanelLayout;
