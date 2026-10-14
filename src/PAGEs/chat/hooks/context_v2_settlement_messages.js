import en from "../../../locales/en.json";

// Keep internal errors stable across locale changes. The chat presentation
// translates these known messages using the current locale at render time.
export const CONTEXT_V2_SETTLEMENT_MESSAGES = Object.freeze({
  CANCELLED: en.chat.settlement.cancelled,
  TIMEOUT: en.chat.settlement.timeout,
});
