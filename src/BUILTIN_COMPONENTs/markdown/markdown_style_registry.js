/* markdown_style_registry.js — 共享 <style> 注册表(引用计数)

   markdown.js 原本每个实例渲染一张 <style>{css}</style>,选择器用唯一实例 id。
   N 条消息 = N 张样式表 —— 长会话结构性累积。

   这里把「相同主题/字号」的实例合并成一张全局 <style>:
   - css 模板用占位符 __SID__ 作选择器,注入时替换为分配的 sid;
   - 相同 cssText(逐字节相同)复用同一 <style data-markdown-shared={sid}>,引用计数;
   - refcount 归零时移除。

   acquireMarkdownStyle(cssText) -> { sid, release }
   SSR / 无 document 时退化为 no-op(sid="ssr")。 */

const registry = new Map(); // cssText -> { sid, count, el }
let nextSid = 1;

export function acquireMarkdownStyle(cssText) {
  if (typeof document === "undefined") {
    return { sid: "ssr", release: () => {} };
  }

  let entry = registry.get(cssText);
  if (!entry) {
    const sid = `mds-${nextSid++}`;
    const el = document.createElement("style");
    el.setAttribute("data-markdown-shared", sid);
    el.textContent = cssText.split("__SID__").join(sid);
    document.head.appendChild(el);
    entry = { sid, count: 0, el };
    registry.set(cssText, entry);
  }
  entry.count += 1;

  const sid = entry.sid;
  let released = false;
  return {
    sid,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      entry.count -= 1;
      if (entry.count <= 0) {
        entry.el.remove();
        registry.delete(cssText);
      }
    },
  };
}
