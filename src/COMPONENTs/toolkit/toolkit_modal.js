import { lazy, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import api from "../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../SERVICEs/toolkit_catalog_refresh";
import { BASE_TOOLKIT_IDENTIFIERS } from "./constants";

const PluginsShell = lazy(() =>
  import("./plugins_shell").then((m) => ({
    default: m.PluginsShell,
  })),
);

const ToolkitModalLoading = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ArcSpinner size={24} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
    </div>
  );
};

/* Same base-id filter the installed page uses — kept in sync so the sidebar
   badge count always matches what the Installed screen actually lists. */
const isBaseById = (toolkitId) => {
  if (!toolkitId) return false;
  const lower = toolkitId.trim().toLowerCase();
  return (
    BASE_TOOLKIT_IDENTIFIERS.has(lower) ||
    lower.endsWith(".toolkit") ||
    lower.endsWith(".builtin_toolkit") ||
    lower.endsWith(".base_toolkit")
  );
};

export const ToolkitModal = ({ open, onClose }) => {
  useModalLifecycle("toolkit-modal", open);
  const [activePage, setActivePage] = useState("discover");
  const [installedCount, setInstalledCount] = useState(0);

  useEffect(() => {
    if (!open) {
      setActivePage("discover");
    }
  }, [open]);

  const loadInstalledCount = useCallback(async () => {
    try {
      const payload = await api.unchain.listToolModalCatalog();
      const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
      const visible = list.filter(
        (tk) => tk.source !== "plugin" && !tk.hidden && !isBaseById(tk.toolkitId),
      );
      /* +1 for the synthetic builtin Computer row the Installed page always
         renders (S1) — it is not part of the catalog, so add it here to keep
         the sidebar badge == the number of rows the Installed screen shows. */
      setInstalledCount(visible.length + 1);
    } catch {
      /* keep previous count */
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    loadInstalledCount();
    return subscribeToolkitCatalogRefresh(() => loadInstalledCount());
  }, [open, loadInstalledCount]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        // lock the same rendered aspect as the settings modal: content must
        // never stretch the shell wider than its 600px square
        width: 600,
        minWidth: 600,
        maxWidth: 600,
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: "var(--pupu-background)",
        color: "var(--pupu-text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Button
        prefix_icon="close"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          paddingVertical: 6,
          paddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 4,
          WebkitAppRegion: "no-drag",
          content: {
            prefixIconWrap: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
            },
            icon: { width: 14, height: 14 },
          },
        }}
      />

      <Suspense fallback={<ToolkitModalLoading />}>
        <PluginsShell
          activePage={activePage}
          onNavigate={setActivePage}
          installedCount={installedCount}
          onCloseModal={onClose}
        />
      </Suspense>
    </Modal>
  );
};
