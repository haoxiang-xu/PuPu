import copy from "../../docs/implementation/ticket-278-copy.json";
import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";
import zhTW from "../locales/zh-TW.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import de from "../locales/de.json";
import it from "../locales/it.json";
import ptBR from "../locales/pt-BR.json";
import ru from "../locales/ru.json";

const locales = { en, "zh-CN": zhCN, "zh-TW": zhTW, ja, ko, es, fr, de, it, "pt-BR": ptBR, ru };

test.each(Object.entries(locales))("%s supplies every trust label and the same accessible-name placeholders", (locale, messages) => {
  for (const [key, text] of Object.entries(copy)) {
    const translated = messages.toolkit[key];
    expect(typeof translated).toBe("string");
    expect(translated.trim()).not.toBe("");
    expect((translated.match(/\{\w+\}/g) || []).sort()).toEqual((text.match(/\{\w+\}/g) || []).sort());
    expect(translated).not.toContain("toolkit.trust_");
  }
});

test("English matches the reviewed vocabulary and Chinese matches the selected UI terms", () => {
  for (const [key, text] of Object.entries(copy)) expect(en.toolkit[key]).toBe(text);
  expect(zhCN.toolkit.trust_status_verified).toBe("已核验");
  expect(zhCN.toolkit.trust_status_pending).toBe("待核验");
  expect(zhCN.toolkit.trust_status_unverified).toBe("未核验");
  expect(zhCN.toolkit.trust_hash_on_download).toBe("下载时校验 SHA-256");
});
