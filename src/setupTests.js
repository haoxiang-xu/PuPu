// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Credential mirrors are session memory now. Each test models a fresh session.
beforeEach(() => {
  jest.requireActual('./SERVICEs/bridges/settings_storage_bridge').resetSessionBootstrapSnapshotForTests();
  jest.requireActual('./SERVICEs/settings_secret_adapter').resetProviderSecretSessionForTests();
});

// This jsdom version predates Web Crypto. Match Chromium with Node's real
// getRandomValues implementation so durable ID tests exercise secure entropy.
// Leave unrelated crypto APIs to the suites that explicitly configure them.
if (!globalThis.crypto?.getRandomValues) {
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    },
  });
}

// ResizeObserver mock — jsdom doesn't implement it; GradientSlider (color_picker) needs it
if (!window.ResizeObserver) {
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = MockResizeObserver;
}

// jsdom has no Element.scrollTo. The chat's message list scrolls itself (it
// is also mounted by the Agent Builder's Test panel); a no-op keeps those
// mounts quiet. Suites that assert scrolling install their own.
if (typeof window !== "undefined" && typeof window.Element?.prototype?.scrollTo !== "function") {
  window.Element.prototype.scrollTo = function scrollTo() {};
}
