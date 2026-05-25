import { lazy, Suspense, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";

const SettingsModalContent = lazy(() =>
  import("./settings_modal_content").then((m) => ({
    default: m.SettingsModalContent,
  })),
);

const SettingsModalLoading = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ArcSpinner size={24} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
    </div>
  );
};

export const SettingsModal = ({ open, onClose }) => {
  useModalLifecycle("settings-modal", open);
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        minWidth: 600,
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: isDark ? "#141414" : "#ffffff",
        color: isDark ? "#fff" : "#222",
        display: "flex",
        overflow: "hidden",
      }}
    >
      <Suspense fallback={<SettingsModalLoading />}>
        <SettingsModalContent onClose={onClose} />
      </Suspense>
    </Modal>
  );
};
