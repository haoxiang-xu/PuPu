const fs = require("fs");
const path = require("path");

/* The title bar's fade sits directly over the top of the message list, so
   whatever paints it has to move with the rest of the shell. Reading the JS
   `theme` object does not: `theme` changes only when the theme editor
   commits, while --pupu-* change on every preview frame — which is exactly
   how this strip ended up as the one patch of the window that waited for the
   color picker to close.

   jsdom drops any value containing var() from the CSSOM (style.background
   reads back empty), so this cannot be asserted through a render. Same
   constraint, same remedy as the shell scan in container.test.js and the
   armed-reset scan in theme_editor.test.js: scan the source. */
const src = fs.readFileSync(path.join(__dirname, "title_bar.js"), "utf8");

describe("title_bar paints from the live CSS variables", () => {
  test("the top fade reads --pupu-background, with the JS theme only as fallback", () => {
    expect(src).toMatch(
      /const topBarBackground = `var\(--pupu-background, \$\{themeBackground\}\)`/,
    );
    expect(src).toMatch(/linear-gradient\(180deg, \$\{topBarBackground\}/);
  });

  test("the foreground reads --pupu-text, with the JS theme only as fallback", () => {
    expect(src).toMatch(
      /const topBarForeground = `var\(--pupu-text, \$\{themeForeground\}\)`/,
    );
  });

  test("no painted value is taken straight off the theme object", () => {
    /* The two `theme?.` reads that remain are the var() fallbacks and the
       font family, which carries no color. A bare `color: theme?.…` or
       `background: theme?.…` would be the regression this catches. */
    const barePaint = src.match(
      /(?:^|[^-\w])(?:background|backgroundColor|color):\s*(?:`?\$?\{?\s*)?theme\?\./g,
    );
    expect(barePaint).toBeNull();
  });
});
