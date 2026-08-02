// src/BUILTIN_COMPONENTs/layer/__tests__/z_layers_guard.test.js
//
// 守住 z_layers.js 的单一来源地位。仿照 theme/shell_background_guard.test.js:
// 扫描源码,禁止某个模式,例外走显式白名单。
//
// 两种模式都要抓,不是一种 —— 首轮清点漏了三处,因为魔数藏在测试的比较值里
// (toBeLessThan(99999)),而不是 zIndex: 赋值里。那种断言在层级调整后会静默
// 失效:数值早已不在那个量级,断言却依然通过。
import fs from "fs";
import path from "path";

// 静态 boot shell 无法 import JS 模块,BOOT 的值在那里有一份副本。
// z_layers.js 的头注释记录了这个重复。
const ALLOWLIST = ["public/index.html:36"];

const SCAN_ROOTS = ["src", "public"];
const SKIP_DIRS = new Set(["node_modules", "build", "dist", "coverage"]);
// 定义方(scale 本身)和守卫方(本文件,注释里必须能引用那些旧魔数当反例)
// 都不受自己的规则约束。
const SELF_EXEMPT = [
  path.join("src", "BUILTIN_COMPONENTs", "layer", "z_layers.js"),
  path.join("src", "BUILTIN_COMPONENTs", "layer", "__tests__", "z_layers_guard.test.js"),
];

// 裸的 z-index 赋值:zIndex: 9999 / z-index: 9999 / zIndex: "9999"
const ASSIGNMENT = /(?:zIndex\s*:\s*["']?|z-index\s*:\s*)(\d{4,})/g;
// 断言里的硬编码比较值:toBeLessThan(99999) / toBe("9999") ...
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

const readLines = (rel) =>
  fs.readFileSync(path.join(process.cwd(), rel), "utf8").split("\n");

test("没有裸的 z-index 赋值 >= 1000 —— 一律走 z_layers.js", () => {
  const violations = collectFiles()
    .flatMap((rel) => {
      const hits = [];
      readLines(rel).forEach((line, i) => {
        ASSIGNMENT.lastIndex = 0;
        let match;
        while ((match = ASSIGNMENT.exec(line))) {
          if (Number(match[1]) < 1000) continue;
          const key = `${rel}:${i + 1}`;
          if (ALLOWLIST.includes(key)) continue;
          hits.push(`${key}  ${line.trim()}`);
        }
      });
      return hits;
    });
  expect(violations).toEqual([]);
});

test("测试里的层级断言不得硬编码比较值 —— 必须引用 Z", () => {
  const violations = collectFiles()
    .filter((rel) => /\.test\.(js|cjs)$/.test(rel))
    .flatMap((rel) => {
      const lines = readLines(rel);
      const hits = [];
      lines.forEach((line, i) => {
        // 只看谈论 z-index 的断言(本行或上一行提到),否则会误伤 timeout 之类
        const context = `${lines[i - 1] || ""}\n${line}`;
        if (!/zIndex|z-index/i.test(context)) return;
        COMPARISON.lastIndex = 0;
        let match;
        while ((match = COMPARISON.exec(line))) {
          if (Number(match[1]) < 1000) continue;
          hits.push(`${rel}:${i + 1}  ${line.trim()}`);
        }
      });
      return hits;
    });
  expect(violations).toEqual([]);
});
