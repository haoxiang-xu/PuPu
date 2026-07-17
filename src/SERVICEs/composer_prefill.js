/* composer_prefill — the "Try in chat" channel between the Plugins app-store
   modal and the chat composer.
   PluginDetailPage dispatches this window event with the command text; the
   chat page (src/PAGEs/chat/chat.js) mounts a listener once and writes the
   text into the active session's input value. Kept as a plain window event
   (not a new context provider) because the modal and the chat page do not
   share a component tree — this is the smallest coupling that crosses that
   boundary. */

export const PUPU_PREFILL_COMPOSER = "pupu:prefill-composer";

export function dispatchComposerPrefill(text) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(PUPU_PREFILL_COMPOSER, { detail: { text: String(text || "") } }),
  );
}
