# code-owner-ui-primitives — Memory Index

- [主题取值的运行时陷阱](theme-runtime-resolution-trap.md) — default_mini_theme.json 的颜色键运行时被语义 palette 全量覆盖；读它取值必错，加新键会造死值
- [语义 alpha 阶梯：已发货、零消费者、无护栏](semantic-alpha-ladder-unused-and-unguarded.md) — --pupu-text-* 存在但没人用；alpha 步不受可读性窗口约束；9 预设下只有 0.75 一档恒过 AA
- [Button/Icon 的 a11y 债与归属](button-icon-a11y-debt.md) — ariaLabel 槽位早有但 81/100 调用点没传（含我自己的 title_bar）；焦点态结构性无出口；button.js 零测试
- [i18n 回退的罪名要限缩](i18n-fallback-blame-correction.md) — 退化成 key 只在 en.json 也缺键时发生；49 个 locale 缺口实际渲染正确英文；对等性测试捞不到这类 bug
- [上收原语的门槛](primitive-uptake-threshold.md) — 三个消费者才上收；两个就先各落一份。附全仓只有 2 个 live region 的库存事实
