// src/BUILTIN_COMPONENTs/layer/__tests__/z_layers_guard.test.js
//
// 守住 z_layers.js 的单一来源地位。仿照 theme/shell_background_guard.test.js:
// 扫描源码,禁止某个模式,例外走显式白名单。
//
// 两种模式都要抓,不是一种 —— 首轮清点漏了三处,因为魔数藏在测试的比较值里
// (期望值写死在 toBeLessThan 的括号里),而不是 zIndex 赋值里。那种断言在层级
// 调整后会静默失效:数值早已不在那个量级,断言却依然通过,看上去还在守着不变量,
// 实际上已经停了。
//
// 扫描按整文件做,不按行 —— 正则里的 \s* 本来就能跨行,按行切割反而会漏掉
// 值写在下一行的写法。行号由匹配位置反算。
import fs from "fs";
import path from "path";

// 静态 boot shell 无法 import JS 模块,BOOT 的值在那里有一份副本。
// z_layers.js 的头注释记录了这个重复。
const ALLOWLIST = ["public/index.html:36"];

const SCAN_ROOTS = ["src", "public"];
const SKIP_DIRS = new Set(["node_modules", "build", "dist", "coverage"]);
// 定义方本身不受自己的规则约束 —— 它就是那些数字该在的地方。
// 本守卫文件不豁免:它的注释被刻意写成不含任何四位数字面量,所以能被自己扫过。
const SELF_EXEMPT = [
  path.join("src", "BUILTIN_COMPONENTs", "layer", "z_layers.js"),
];

// 裸的 z-index 赋值。\s* 跨行,所以值写在下一行也能抓到。
const ASSIGNMENT = /(?:zIndex\s*:\s*["']?|z-index\s*:\s*)(\d{4,})/g;
// 断言里写死的期望值(toBeLessThan/toBe/... 括号里的四位以上数字)。
const COMPARISON =
  /(?:toBeLessThan|toBeGreaterThan|toBeLessThanOrEqual|toBeGreaterThanOrEqual|toBe|toEqual)\(\s*["']?(\d{4,})["']?\s*\)/g;

const walk = (dir, out) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, out);
      continue;
    }
    if (/\.(js|cjs|mjs|css|html)$/.test(entry.name)) out.push(full);
  }
  return out;
};

const collectFiles = () =>
  SCAN_ROOTS.filter((root) => fs.existsSync(path.join(process.cwd(), root)))
    .flatMap((root) => walk(path.join(process.cwd(), root), []))
    .map((abs) => path.relative(process.cwd(), abs))
    .filter((rel) => !SELF_EXEMPT.includes(rel));

const readSource = (rel) =>
  fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

const lineTextAt = (source, index) => {
  const start = source.lastIndexOf("\n", index) + 1;
  const end = source.indexOf("\n", index);
  return source.slice(start, end === -1 ? undefined : end).trim();
};

/* 整文件扫描,返回 `rel:line  行文本` 形式的违规列表。 */
const scanSource = (rel, regex, filterMatch) => {
  const source = readSource(rel);
  const hits = [];
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(source))) {
    if (Number(match[1]) < 1000) continue;
    const line = lineOf(source, match.index);
    const key = `${rel}:${line}`;
    if (ALLOWLIST.includes(key)) continue;
    if (filterMatch && !filterMatch(source, match)) continue;
    hits.push(`${key}  ${lineTextAt(source, match.index)}`);
  }
  return hits;
};

test("没有裸的 z-index 赋值 >= 1000 —— 一律走 z_layers.js", () => {
  const violations = collectFiles().flatMap((rel) =>
    scanSource(rel, ASSIGNMENT),
  );
  expect(violations).toEqual([]);
});

test("测试里的层级断言不得写死期望值 —— 必须引用 Z", () => {
  // 只看谈论 z-index 的断言,否则会误伤 timeout、字节数之类的比较。
  const nearZIndex = (source, match) => {
    const from = source.lastIndexOf("\n", source.lastIndexOf("\n", match.index) - 1) + 1;
    const to = source.indexOf("\n", match.index);
    return /zIndex|z-index/i.test(source.slice(from, to === -1 ? undefined : to));
  };
  const violations = collectFiles()
    .filter((rel) => /\.test\.(js|cjs)$/.test(rel))
    .flatMap((rel) => scanSource(rel, COMPARISON, nearZIndex));
  expect(violations).toEqual([]);
});
