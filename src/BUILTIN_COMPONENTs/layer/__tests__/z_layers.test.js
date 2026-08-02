import { Z } from "../z_layers";

describe("z_layers canonical scale", () => {
  test("every tier is a finite number", () => {
    Object.entries(Z).forEach(([name, value]) => {
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
    });
  });

  test("tier values ascend strictly in enumeration order", () => {
    // 键全是非数字字符串标识符,所以枚举顺序 = 声明顺序(ECMAScript
    // OrdinaryOwnPropertyKeys)。若哪天加了个数字样式的键,它会被提到最前,
    // 这条断言就不再等价于"声明顺序" —— 下面那条禁止数字键的测试守住这点。
    const values = Object.values(Z);
    values.forEach((value, i) => {
      if (i === 0) return;
      expect(value).toBeGreaterThan(values[i - 1]);
    });
  });

  test("层名不得是数字样式的键 —— 否则枚举顺序会与声明顺序脱钩", () => {
    Object.keys(Z).forEach((name) => {
      expect(String(Number(name))).not.toBe(name);
      expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
    });
  });

  // 下面每条不变量都由一个真实场景锁定,改动必须先推翻那个场景。
  test("MODAL < TOOLTIP —— Explorer 用在 memory-inspect modal 内部,提示不能被自己的 modal 遮住 (PR #192)", () => {
    expect(Z.MODAL).toBeLessThan(Z.TOOLTIP);
  });

  test("TOOLTIP < POPOVER —— 被动提示绝不能盖住可交互菜单 (PR #192)", () => {
    expect(Z.TOOLTIP).toBeLessThan(Z.POPOVER);
  });

  test("MODAL < POPOVER —— Agents modal → Recipes → 右键是真实路径", () => {
    expect(Z.MODAL).toBeLessThan(Z.POPOVER);
  });

  test("MODAL < TOAST —— modal 里触发的提示落在 modal 之后就是不可见", () => {
    expect(Z.MODAL).toBeLessThan(Z.TOAST);
  });

  test("POPOVER < DRAG_GHOST —— 保持迁移前 999999 > 99999 的既有关系", () => {
    expect(Z.POPOVER).toBeLessThan(Z.DRAG_GHOST);
  });

  test("APP_CHROME < APP_CHROME_TOP —— side menu 必须盖住 title bar", () => {
    expect(Z.APP_CHROME).toBeLessThan(Z.APP_CHROME_TOP);
  });

  test("APP_CHROME_TOP < MODAL —— 外壳永远在浮层之下", () => {
    expect(Z.APP_CHROME_TOP).toBeLessThan(Z.MODAL);
  });

  test("BOOT 高于其他所有层", () => {
    const others = Object.entries(Z)
      .filter(([name]) => name !== "BOOT")
      .map(([, value]) => value);
    expect(Z.BOOT).toBeGreaterThan(Math.max(...others));
  });

  // 局部层不参与跨层竞争,只需在自己的容器内够用,并留在 APP_CHROME 之下。
  const LOCAL_TIERS = ["CONTENT_RAISED", "SCROLL_OVERLAY"];

  test("局部层全部低于 APP_CHROME —— 它们绝不该盖住外壳或浮层", () => {
    LOCAL_TIERS.forEach((name) => {
      expect(Z[name]).toBeLessThan(Z.APP_CHROME);
    });
  });

  test("SCROLL_OVERLAY 高于代码库里所有局部装饰值(实测最高 200)", () => {
    // 滚动条覆盖层就地 append 到滚动容器的父节点,必须盖过容器内的一切内容。
    // 迁移前它是 9999;强度是必要的,只是量级用错了地方。
    expect(Z.SCROLL_OVERLAY).toBeGreaterThan(200);
    expect(Z.SCROLL_OVERLAY).toBeGreaterThan(Z.CONTENT_RAISED);
  });

  test("跨层浮层之间留有插入空间(局部层与 BOOT 除外)", () => {
    const values = Object.entries(Z)
      .filter(([name]) => name !== "BOOT" && !LOCAL_TIERS.includes(name))
      .map(([, value]) => value);
    values.forEach((value, i) => {
      if (i === 0) return;
      expect(value - values[i - 1]).toBeGreaterThanOrEqual(1000);
    });
  });
});
