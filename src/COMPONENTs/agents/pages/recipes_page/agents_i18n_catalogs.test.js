import en from "../../../../locales/en.json";
import zhCN from "../../../../locales/zh-CN.json";
import zhTW from "../../../../locales/zh-TW.json";
import ja from "../../../../locales/ja.json";
import ko from "../../../../locales/ko.json";
import de from "../../../../locales/de.json";
import es from "../../../../locales/es.json";
import fr from "../../../../locales/fr.json";
import it from "../../../../locales/it.json";
import ptBR from "../../../../locales/pt-BR.json";
import ru from "../../../../locales/ru.json";

const catalogs = { en, "zh-CN": zhCN, "zh-TW": zhTW, ja, ko, de, es, fr, it, "pt-BR": ptBR, ru };
const flatten = (value, prefix = "agents") => Object.fromEntries(Object.entries(value).flatMap(([key, text]) =>
  typeof text === "object" && text !== null ? Object.entries(flatten(text, `${prefix}.${key}`)) : [[`${prefix}.${key}`, text]]));
const english = flatten(en.agents);
const slots = (text) => (text.match(/\{\w+\}/g) || []).sort();
test.each(Object.entries(catalogs))("%s Agents copy has complete keys and exact interpolation multiplicity", (_locale, catalog) => {
  const values = flatten(catalog.agents);
  expect(Object.keys(values).sort()).toEqual(Object.keys(english).sort());
  for (const [key, value] of Object.entries(values)) {
    expect(typeof value).toBe("string"); expect(value.length).toBeGreaterThan(0);
    expect({ key, slots: slots(value) }).toEqual({ key, slots: slots(english[key]) });
  }
});
