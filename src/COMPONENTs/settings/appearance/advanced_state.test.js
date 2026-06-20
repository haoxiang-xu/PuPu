import { advancedTokenState } from "./advanced_state";

test("auto when no custom value; carries derived value from palette", () => {
  const st = advancedTokenState(
    { custom: { dark_mode: {} } },
    "dark_mode",
    { sidebar: "#151515", surface: "#1e1e1e" },
  );
  expect(st.sidebar.isAuto).toBe(true);
  expect(st.surface.value).toBe("#1e1e1e");
});

test("override when custom value present", () => {
  const st = advancedTokenState(
    { custom: { dark_mode: { surface: "#334455" } } },
    "dark_mode",
    { sidebar: "#151515", surface: "#334455" },
  );
  expect(st.surface.isAuto).toBe(false);
  expect(st.surface.value).toBe("#334455");
});
