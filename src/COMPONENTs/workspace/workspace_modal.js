import { lazy, Suspense, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";

const WorkspaceModalContent = lazy(() =>
  import("./workspace_modal_content").then((m) => ({
    default: m.WorkspaceModalContent,
  })),
);

const WorkspaceModalLoading = () => {
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

export const WorkspaceModal = ({ open, onClose }) => {
  useModalLifecycle("workspace-modal", open);
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 560,
        maxWidth: "92vw",
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: isDark ? "#141414" : "#ffffff",
        color: isDark ? "#fff" : "#222",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Suspense fallback={<WorkspaceModalLoading />}>
        <WorkspaceModalContent onClose={onClose} />
      </Suspense>
    </Modal>
  );
};
