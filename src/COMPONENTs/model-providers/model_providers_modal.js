import { lazy, Suspense, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";

/**
 * ModelProvidersModal — the Model Providers page (#204).
 *
 * A sibling of ToolkitModal / WorkspaceModal: opened from the side menu's top
 * group, a BUILTIN Modal layered over the still-mounted chat. It takes the
 * Agent Builder modal's frame — 920 × 600, capped at 92vw / 88vh; no
 * fullscreen toggle (project owner) — because it carries a provider rail
 * beside the pane (design A1) and the Ollama store wants the width. Settings
 * keeps a narrow accordion version of the same panes (N1).
 */

export const MODEL_PROVIDERS_MODAL_ID = "model-providers-modal";

const ModelProvidersModalContent = lazy(() =>
  import("./model_providers_modal_content").then((m) => ({
    default: m.ModelProvidersModalContent,
  })),
);

const ModelProvidersModalLoading = () => {
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

export const ModelProvidersModal = ({ open, onClose, initialEntryId = null }) => {
  useModalLifecycle(MODEL_PROVIDERS_MODAL_ID, open);
  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 920,
        maxWidth: "92vw",
        height: 600,
        maxHeight: "88vh",
        padding: 0,
        backgroundColor: "var(--pupu-background)",
        color: "var(--pupu-text)",
        display: "flex",
        overflow: "hidden",
      }}
    >
      <Button
        prefix_icon="close"
        ariaLabel="Close model providers"
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

      <Suspense fallback={<ModelProvidersModalLoading />}>
        {/* Always rendered while the Modal is mounted so the exit animation
            keeps its content; `open` lets the content reset its selection and
            pause its Ollama probing between openings. */}
        <ModelProvidersModalContent open={open} initialEntryId={initialEntryId} />
      </Suspense>
    </Modal>
  );
};

export default ModelProvidersModal;
