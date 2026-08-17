import { useContext, useEffect, useRef } from "react";

import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ContextCompositionPanel, {
  DESCRIPTION_ID,
  TITLE_ID,
  contextCompositionPalette,
} from "./context_composition_panel";

/**
 * Centred shell, reached from a trace chain inside a chat bubble.
 *
 * The attach-panel entry uses the anchored popover instead
 * (`chat-input/components/context_composition_progress`); a bubble lives in a
 * scroll container, so anchoring there would fight the scroll and cover the
 * message being explained. Both shells render the same
 * `ContextCompositionPanel`, so the two entries cannot drift apart.
 */
export const ContextCompositionModal = ({
  open,
  onClose,
  bundle,
  returnFocusRef,
}) => {
  useModalLifecycle("context-composition-modal", open);
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const palette = contextCompositionPalette(theme, isDark);
  const scopeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => scopeRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const handleClose = () => {
    onClose?.();
    returnFocusRef?.current?.focus?.();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      ariaLabelledBy={TITLE_ID}
      ariaDescribedBy={DESCRIPTION_ID}
      style={{
        width: 364,
        minWidth: 0,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "70vh",
        padding: "14px 16px 12px",
        backgroundColor: palette.background,
        color: palette.text,
        overflow: "hidden",
      }}
    >
      <ContextCompositionPanel
        bundle={bundle}
        open={open}
        palette={palette}
        scopeRef={scopeRef}
        trailing={
          <Button
            prefix_icon="close"
            ariaLabel="Close Context Usage"
            title="Close"
            onClick={handleClose}
            style={{
              flex: "0 0 auto",
              paddingVertical: 4,
              paddingHorizontal: 4,
              iconOnlyPaddingVertical: 4,
              iconOnlyPaddingHorizontal: 4,
              borderRadius: 6,
              opacity: 0.45,
              WebkitAppRegion: "no-drag",
              content: {
                prefixIconWrap: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  lineHeight: 0,
                },
                icon: { width: 13, height: 13 },
              },
            }}
          />
        }
      />
    </Modal>
  );
};

export default ContextCompositionModal;
