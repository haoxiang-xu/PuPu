import { lazy, Suspense, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";

const ToolkitModalContent = lazy(() =>
  import("./toolkit_modal_content").then((m) => ({
    default: m.ToolkitModalContent,
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

export const ToolkitModal = ({ open, onClose }) => {
  useModalLifecycle("toolkit-modal", open);
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const panelBg = isDark ? "#141414" : "#ffffff";

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        minWidth: 600,
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: panelBg,
        color: isDark ? "#fff" : "#222",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Suspense fallback={<ToolkitModalLoading />}>
        <ToolkitModalContent open={open} onClose={onClose} />
      </Suspense>
    </Modal>
  );
};
