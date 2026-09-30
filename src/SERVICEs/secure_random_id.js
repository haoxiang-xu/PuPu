// Shared renderer identity entropy. Never fall back to predictable randomness:
// these identifiers also bind durable conversation operations and confirmations.
export const secureRandomId = () => {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};
