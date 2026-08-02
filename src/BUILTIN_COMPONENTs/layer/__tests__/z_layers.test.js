import { Z } from "../z_layers";

describe("z_layers canonical scale", () => {
  test("every tier is a finite number", () => {
    Object.entries(Z).forEach(([name, value]) => {
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
    });
  });

  test("tiers are strictly ascending in declaration order", () => {
    const values = Object.values(Z);
    values.forEach((value, i) => {
      if (i === 0) return;
      expect(value).toBeGreaterThan(values[i - 1]);
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

  test("相邻层之间留有插入空间(BOOT 除外)", () => {
    const values = Object.entries(Z)
      .filter(([name]) => name !== "BOOT" && name !== "CONTENT_RAISED")
      .map(([, value]) => value);
    values.forEach((value, i) => {
      if (i === 0) return;
      expect(value - values[i - 1]).toBeGreaterThanOrEqual(1000);
    });
  });
});
