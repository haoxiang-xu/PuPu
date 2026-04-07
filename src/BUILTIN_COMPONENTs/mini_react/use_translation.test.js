import { renderHook } from "@testing-library/react";
import { useTranslation, resolveKey } from "./use_translation";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* ── resolveKey unit tests ── */

describe("resolveKey", () => {
  const messages = {
    common: { cancel: "Cancel", delete: "Delete" },
    appearance: { title: "Appearance" },
  };

  it("resolves a dot-path key", () => {
    expect(resolveKey(messages, "common.cancel")).toBe("Cancel");
  });

  it("resolves a nested key", () => {
    expect(resolveKey(messages, "appearance.title")).toBe("Appearance");
  });

  it("returns undefined for missing key", () => {
    expect(resolveKey(messages, "common.missing")).toBeUndefined();
  });

  it("returns undefined for empty key", () => {
    expect(resolveKey(messages, "")).toBeUndefined();
  });
});

/* ── useTranslation hook tests ── */

const wrapper =
  (locale) =>
  ({ children }) => (
    <ConfigContext.Provider value={{ locale, setLocale: () => {} }}>
      {children}
    </ConfigContext.Provider>
  );

describe("useTranslation", () => {
  it("returns English string by default", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("en"),
    });
    expect(result.current.t("common.cancel")).toBe("Cancel");
    expect(result.current.locale).toBe("en");
  });

  it("returns Chinese string for zh-CN locale", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("zh-CN"),
    });
    expect(result.current.t("common.cancel")).toBe("\u53d6\u6d88");
  });

  it("falls back to English when key missing in zh-CN", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("zh-CN"),
    });
    expect(result.current.t("common.cancel")).toBeTruthy();
  });

  it("returns the key itself when not found in any locale", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("en"),
    });
    expect(result.current.t("nonexistent.key")).toBe("nonexistent.key");
  });

  it("interpolates {placeholder} variables", () => {
    const { result } = renderHook(() => useTranslation(), {
      wrapper: wrapper("en"),
    });
    expect(
      result.current.t("app_update.downloading", { progress: 42 }),
    ).toBe("Downloading 42%");
  });
});
