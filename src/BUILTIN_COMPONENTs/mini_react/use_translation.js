import { useContext, useCallback, useMemo } from "react";
import { LocaleContext } from "../../CONTAINERs/config/context";

import en from "../../locales/en.json";
import zhCN from "../../locales/zh-CN.json";
import zhTW from "../../locales/zh-TW.json";
import ja from "../../locales/ja.json";
import ko from "../../locales/ko.json";
import es from "../../locales/es.json";
import fr from "../../locales/fr.json";
import de from "../../locales/de.json";
import it from "../../locales/it.json";
import ptBR from "../../locales/pt-BR.json";

const LOCALE_MAP = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ko,
  es,
  fr,
  de,
  it,
  "pt-BR": ptBR,
};

/**
 * Resolve a dot-path key against a messages object.
 * e.g. resolveKey(messages, "common.cancel") -> "Cancel"
 */
export const resolveKey = (messages, key) => {
  if (!key) return undefined;

  const parts = key.split(".");
  let current = messages;

  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }

  return typeof current === "string" ? current : undefined;
};

/**
 * Replace {placeholder} tokens in a string with values from a vars object.
 * e.g. interpolate("Downloading {progress}%", { progress: 42 }) -> "Downloading 42%"
 */
const interpolate = (template, vars) => {
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(vars, key)
      ? String(vars[key])
      : `{${key}}`,
  );
};

export const useTranslation = () => {
  const { locale, setLocale } = useContext(LocaleContext);
  const currentLocale = locale || "en";

  const messages = useMemo(
    () => LOCALE_MAP[currentLocale] || en,
    [currentLocale],
  );

  const t = useCallback(
    (key, vars) => {
      const value = resolveKey(messages, key);

      if (value !== undefined) {
        return interpolate(value, vars);
      }

      // Fallback to English
      if (currentLocale !== "en") {
        const fallback = resolveKey(en, key);
        if (fallback !== undefined) {
          return interpolate(fallback, vars);
        }
      }

      // Last resort: return key itself
      return key;
    },
    [messages, currentLocale],
  );

  return { t, locale: currentLocale, setLocale };
};
