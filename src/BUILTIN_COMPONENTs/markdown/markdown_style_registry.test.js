import { acquireMarkdownStyle } from "./markdown_style_registry";

const sharedStyles = () =>
  document.head.querySelectorAll("style[data-markdown-shared]");

describe("markdown_style_registry", () => {
  afterEach(() => {
    // 清掉任何残留的共享 style,隔离用例
    document.head
      .querySelectorAll("style[data-markdown-shared]")
      .forEach((el) => el.remove());
  });

  test("相同 cssText 两次 acquire 只产生一个 <style>,refcount 到 2", () => {
    const css = "[data-markdown-sid=\"__SID__\"] { color: red; }";
    const a = acquireMarkdownStyle(css);
    const b = acquireMarkdownStyle(css);

    expect(sharedStyles().length).toBe(1);
    expect(a.sid).toBe(b.sid);
  });

  test("release 两次后 <style> 被移除(refcount 归零)", () => {
    const css = "[data-markdown-sid=\"__SID__\"] { color: blue; }";
    const a = acquireMarkdownStyle(css);
    const b = acquireMarkdownStyle(css);
    expect(sharedStyles().length).toBe(1);

    a.release();
    expect(sharedStyles().length).toBe(1); // 还有一个引用

    b.release();
    expect(sharedStyles().length).toBe(0); // 归零后移除
  });

  test("release 幂等:重复 release 不会把别的引用的 style 误删", () => {
    const css = "[data-markdown-sid=\"__SID__\"] { color: green; }";
    const a = acquireMarkdownStyle(css);
    const b = acquireMarkdownStyle(css);

    a.release();
    a.release(); // 重复 release 应为 no-op
    expect(sharedStyles().length).toBe(1); // b 仍持有

    b.release();
    expect(sharedStyles().length).toBe(0);
  });

  test("不同 cssText 产生两个独立 <style>", () => {
    // 用例专属颜色,避免与其它用例的 cssText 逐字节相同(注册表是模块级单例)
    const cssA = "[data-markdown-sid=\"__SID__\"] { color: teal; }";
    const cssB = "[data-markdown-sid=\"__SID__\"] { color: maroon; }";
    acquireMarkdownStyle(cssA);
    acquireMarkdownStyle(cssB);
    expect(sharedStyles().length).toBe(2);
  });

  test("__SID__ 占位符在注入的 <style> 里被替换成真实 sid", () => {
    const css =
      "[data-markdown-sid=\"__SID__\"] { color: red; } [data-markdown-sid=\"__SID__\"] p { margin: 0; }";
    const { sid } = acquireMarkdownStyle(css);
    const el = document.head.querySelector(
      `style[data-markdown-shared="${sid}"]`,
    );
    expect(el).not.toBeNull();
    expect(el.textContent).not.toContain("__SID__");
    expect(el.textContent).toContain(`[data-markdown-sid="${sid}"]`);
  });
});
