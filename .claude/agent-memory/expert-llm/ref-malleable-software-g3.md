---
name: ref-malleable-software-g3
description: 愿景研究 G3 参照系统;intent→工具UI/可塑软件/artifacts-canvas 的范式对照(Artifacts/Canvas/v0/bolt/websim/Ink&Switch)+ PuPu 现状缺口
metadata:
  type: reference
---

愿景研究 G3 集群("按意图召唤任务专属可交互 UI / 软件可塑化")的一手参照与对照结论。CEO 大图景:ultra-app,UI 按需即时变形;文字=AI 时代的 CLI(高层/模糊意图),最后一公里精确编辑交给任务专属直接操作 UI。与 PuPu 第二条腿(伪常驻 agent / recipe builder)同产品。

## PuPu 现状(对照锚点,代码已读)
- artifact-summary 是**只读快照**,非可运行 UI:`src/COMPONENTs/chat-bubble/artifact-summary/artifact_kind_registry.js`(kind 白名单 file_diff/plan/markdown/table/kv/log/link)+ `artifact_summary.js`(固定 renderer 分发,`ALLOWED_FALLBACK_RENDERERS`)。AI 只能往已知 kind 塞数据,不能产新交互界面。
- recipe builder 是**人手搭的固定节点 graph**:`src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js`(节点类型 start/end/agent/toolkit_pool/subagent_pool 预定义)+ `recipe_connection_rules.js`(连线规则硬编码)。是"用户给 agent 编程",不是"AI 为用户编程出 UI"。
- 缺的是第三样:一句意图→AI 当场生成可直接操作界面。两条腿都不指向这里。

## 外部系统机制(一手 URL)
- Claude Artifacts:单文件可交互物(MD/HTML/SVG/React),右侧窗口渲染,对话迭代,可调 Claude 文本 API 成"AI app"。support.claude.com/en/articles/9487310 + claude.com/blog/build-artifacts。**两页均无沙箱技术细节(信息缺口,需复核)**。
- ChatGPT Canvas:区域级直接编辑(选中→改)+内联快捷(改长度/阅读级别/加注释/代码审查/跑控制台)。openai.com/index/introducing-canvas(403 未取正文,需复核)。
- v0(Vercel):产生产级 React(shadcn/ui+Tailwind);检索 grounding+前沿模型+流式 **AutoFix** 纠错;预览跑 **Firecracker microVM**+frame-src CSP。vercel.com/blog/announcing-v0-generative-ui。
- bolt.new(StackBlitz):浏览器内 **WebContainer**(WASM Node 运行时),AI 操控 fs/终端/server。机制需复核(blog 404)。
- websim:Claude 3.5 Sonnet 实时生成整个"幻觉网页",点链接=生成下一页。

## 核心对照结论
1. PuPu 缺的不是渲染力,是**产出物范式**:artifact 要从"快照"升级为"可运行实例",需沙箱执行容器——Electron 端无现成 Firecracker/WebContainer 等价物=最大工程缺口。
2. **Canvas 范式比 Artifacts 更契合 CEO"最后一公里直接操作"**(区域级直接编辑 vs 对话重生成);flow_editor 已是"直接操作"雏形,但节点固定非 AI 召唤。
3. recipe builder 腿须吸收 **Ink & Switch Malleable Software**(inkandswitch.com/essay/malleable-software)教训:三原则=Tools over Apps / Shared Data Substrates / gentle slope;其明言"AI code generation alone does not address all the barriers to malleability"——一次性生成缺持久化+同步=用完即弃。Patchwork 是合题(AI 快速召唤+环境留存)。一次性 UI 够用于 chat 侧用完即走场景;recipe 侧必须可持久化/可复用/可演化。
4. **安全是 PuPu 比 web 同行更早撞墙处**:生成式可操作 UI 必触达系统能力,与 PuPu IPC 封闭边界(renderer 永不碰 ipcRenderer)正面冲突;此方向任何 spike 应先拉 [[team_roster]] 的 security-expert(守)定"生成界面能触达什么能力、在什么沙箱"。v0 的 AutoFix=把模型产出当不可信输入流式校验,值得借鉴。

## 与其他愿景研究集群关系
A2A/agent org 见 [[a2a-channel-direction]];durable execution(让长流程可恢复)见 [[ref-durable-execution-c2]];何时打扰用户见 [[ref-proactivity-calibration]]。G3 是"产出物范式/UI 可塑"维度。
