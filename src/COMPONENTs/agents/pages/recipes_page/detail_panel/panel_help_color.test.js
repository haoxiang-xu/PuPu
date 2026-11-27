import fs from "fs";
import path from "path";

/* The help tooltip is drawn inverted (a light bubble in the dark theme, a
   dark one in the light theme) and carries its own text colour. Help content
   that sets a colour picked for the panel's theme — note(isDark), NOTE,
   muted(isDark), CAPTION — ends up grey on light grey in the dark, or grey on
   near-black in the light. Help content must inherit the tooltip's colour. */

const DIR = __dirname;
const PANEL_COLOURS = /\bNOTE\b|\bnote\(|\bmuted\(|\bCAPTION\b|\bcolor\s*:/;

const balanced = (source, start, open, close) => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
};

const help_contents = (source) => {
  const found = [];
  const prop = /\bhelp=\{/g;
  let match;
  while ((match = prop.exec(source))) {
    found.push(balanced(source, match.index + match[0].length - 1, "{", "}"));
  }
  const tag = /<PanelHelp\b[^>]*>/g;
  while ((match = tag.exec(source))) {
    const end = source.indexOf("</PanelHelp>", match.index);
    found.push(source.slice(match.index + match[0].length, end));
  }
  return found;
};

describe("panel help content", () => {
  const files = fs.readdirSync(DIR).filter((name) => name.endsWith(".js") && !name.endsWith(".test.js"));

  it.each(files)("%s leaves the tooltip's text colour alone", (name) => {
    const source = fs.readFileSync(path.join(DIR, name), "utf8");
    const offending = help_contents(source).filter((content) => PANEL_COLOURS.test(content));
    expect(offending).toEqual([]);
  });

  it("catches a help span coloured for the panel", () => {
    const sample = 'help={<span style={note(isDark)}>{t("x")}</span>}';
    expect(help_contents(sample).some((content) => PANEL_COLOURS.test(content))).toBe(true);
  });
});
