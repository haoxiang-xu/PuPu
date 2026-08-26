import { useContext, useEffect, useRef } from "react";

import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
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
  const { t } = useTranslation();
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
        width: 340,
        minWidth: 0,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "70vh",
        // Keep room below the standard, absolutely-positioned close button.
        padding: "44px 12px 12px",
        backgroundColor: palette.background,
        color: palette.text,
        overflow: "hidden",
      }}
    >
      <Button
        prefix_icon="close"
        ariaLabel={t("context_usage.close_dialog")}
        title={t("context_usage.close")}
        onClick={handleClose}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          paddingVertical: 6,
          paddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 2,
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
      <ContextCompositionPanel
        bundle={bundle}
        open={open}
        palette={palette}
        scopeRef={scopeRef}
      />
    </Modal>
  );
};

export default ContextCompositionModal;
