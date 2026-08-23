---
name: react-router-dom-jest-main-field
description: 5 个前端套件(App/bridges/chat-bubble/memory-inspect/settings-memory)同时挂在 "Cannot find module react-router-dom",根因是 rr-dom 7.x main 字段坏,不是 npm ci 能修
metadata:
  type: project
---

**现象(2026-06-14 release triage 实测)**:`CI=true npx react-scripts test` 下 5 个套件同时红、全是 `Cannot find module 'react-router-dom' from src/BUILTIN_COMPONENTs/mini_react/mini_router.js`:`src/App.test.js`、`src/SERVICEs/bridges/bridges.test.js`、`src/COMPONENTs/chat-bubble/chat_bubble.test.js`、`src/COMPONENTs/memory-inspect/memory_inspect_modal.test.js`、`src/COMPONENTs/settings/memory/index.test.js`。所有 toolkit/MCP 套件**不受影响**(它们不 import mini_router)——这个"5 红 + MCP 全绿"的 blast-radius 形态可一眼认出该问题。

**根因(已核实,推翻"版本漂移/npm ci 可修"的初判)**:`react-router-dom@7.13.2`(lockfile 锁定版,非漂移)dist 里只 ship `index.js`,但其 `package.json` 的 `main` 指向**不存在的 `./dist/main.js``。Node `require` 靠 `exports` map(`.require.default → ./dist/index.js`)能跑;但 CRA 的 jest-resolve 回退到 `main` 字段 → 找不到。`npm ci` 把版本恢复成 7.13.2 后**问题依旧**,因为坏的是这个版本本身,不是安装漂移。

`mini_router.js` import react-router-dom 是**正确设计**(它是包 BrowserRouter/HashRouter + Electron hash/browser 自选的适配器);CLAUDE.md 说"内部路由不用 react-router-dom"指组件从 mini_react 引、不是不用这个包。**别去改那个 import。**

**Why**: 初判说"npm ci 即可修"是错的,我亲测 7.13.2 的 main 字段就是坏的;记下来免得下次又派人去跑 npm ci 白费。

**How to apply**: 真修是前端工具链决策(owner 前端/electron dev),候选:(a) jest `moduleNameMapper` 把 `^react-router-dom$` 映射到 `dist/index.js`——但 plain `react-scripts test` 不支持自定义 jest 配置,需先上 craco 或 eject;(b) 升/换一个 main 字段正确的 react-router-dom 版本。注:本分支 package-lock 相对 main 大改过,可能是分支引入,排查时先 `git diff main -- package.json package-lock.json`。非 product blocker(应用本体 Node 下能跑),但卡 CI,该修。相关:[[registry-frontend-backend-shared-file]]。
