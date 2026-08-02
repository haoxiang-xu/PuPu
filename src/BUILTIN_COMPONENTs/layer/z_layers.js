// 全 app 唯一的堆叠层级来源。任何 body portal 或 position:fixed 的浮层都必须
// 从这里取值,不得写裸数字 —— 由 __tests__/z_layers_guard.test.js 强制。
//
// 这个文件是 layer/ 子系统的视觉一半:layer_stack.js 管行为栈序(Escape 和
// 外部点击先关谁),这里管视觉栈序(谁画在谁上面)。两者应当一致。
//
// 排序理由,从下往上。每一条都由一个真实场景或回归测试锁定,不是审美选择:
//
//   CONTENT_RAISED  局部抬升。只需盖住自己容器内的内容,不参与跨层竞争。
//   SCROLL_OVERLAY  滚动条 thumb 覆盖层。就地 append 到滚动容器的父节点,
//                   必须盖过该容器内的一切内容 —— 包括各处局部抬升的装饰层
//                   (实测最高 200,见 carousel)。它迁移前是 9999,那个强度
//                   是必要的,CONTENT_RAISED 表达不了。但它仍然是局部的:
//                   低于 APP_CHROME 保证它永远不会盖住真正的外壳或浮层。
//   APP_CHROME      常驻外壳:title bar。
//   APP_CHROME_TOP  常驻外壳上层:side menu 必须盖住 title bar。迁移前靠
//                   2049 > 2048 表达,并由 container.js 的 JSX 顺序兜底;
//                   现在是显式的。
//   MODAL           阻塞对话框。
//   TOOLTIP         被动提示(tooltip、Explorer 截断标签的完整标题浮层)。
//                   必须 > MODAL:Explorer 被用在 memory-inspect modal、
//                   theme editor、recipe list 内部,压到 modal 之下会让
//                   modal 遮住自己行的提示。(PR #192)
//   POPOVER         可交互浮层:context menu、dropdown、color picker。
//                   必须 > TOOLTIP:被动提示绝不能盖住可交互菜单。(PR #192)
//                   必须 > MODAL:Agents modal → Recipes → 右键是真实路径。
//   TOAST           通知。必须 > MODAL:modal 内触发的保存/安装结果提示若
//                   落在 modal 之后,就是不可见的 UX 断裂。迁移前 toast 与
//                   modal 同为 9999,谁在上只取决于 DOM 插入顺序。
//   DRAG_GHOST      跟随光标的拖拽影像。迁移前是 999999,高于 context menu
//                   的 99999;这里保持该关系。
//   TOP_PROGRESS    全局进度条。环境信号,永远在最上(BOOT 除外)。
//   BOOT            启动遮罩,盖住一切。
//
// 跨层浮层之间留 1000 的间隔,是为了将来插入新层时不必重排既有值。局部层
// (CONTENT_RAISED / SCROLL_OVERLAY)不受这条约束 —— 它们的值只需在自己的
// 容器内够用,并保持在 APP_CHROME 之下。
//
// ⚠️ public/index.html 的静态 boot shell CSS 里有一份 BOOT 的同值副本
//    (静态 shell 无法 import JS 模块)。改 BOOT 必须同步改那里。

export const Z = {
  CONTENT_RAISED: 10,
  SCROLL_OVERLAY: 500,
  APP_CHROME: 1000,
  APP_CHROME_TOP: 2000,
  MODAL: 3000,
  TOOLTIP: 4000,
  POPOVER: 5000,
  TOAST: 6000,
  DRAG_GHOST: 7000,
  TOP_PROGRESS: 8000,
  BOOT: 2147483647,
};

export default Z;
