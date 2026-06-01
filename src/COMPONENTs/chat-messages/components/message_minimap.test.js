import { render } from "@testing-library/react";
import MessageMinimap from "./message_minimap";

const seg = (id, role, top, height) => ({ id, role, top, height });

const baseProps = (over = {}) => ({
  messagesRef: { current: null },
  segments: [seg("a", "user", 0, 100), seg("b", "assistant", 100, 100)],
  total: 200,
  safeVisibleStart: 0,
  measure: () => {},
  scrollToMessageIndex: jest.fn(),
  isDark: true,
  ...over,
});

test("renders one tick per segment with role data-attr", () => {
  const { container } = render(<MessageMinimap {...baseProps()} />);
  const ticks = container.querySelectorAll('[data-mm-tick]');
  expect(ticks).toHaveLength(2);
  expect(ticks[0].getAttribute("data-mm-role")).toBe("user");
  expect(ticks[1].getAttribute("data-mm-role")).toBe("assistant");
});

test("renders nothing when there are no segments", () => {
  const { container } = render(<MessageMinimap {...baseProps({ segments: [], total: 0 })} />);
  expect(container.querySelector('[data-mm-track]')).toBeNull();
});

test("user tick is grey, assistant tick is blue (dark)", () => {
  const { container } = render(<MessageMinimap {...baseProps()} />);
  const ticks = container.querySelectorAll('[data-mm-tick]');
  expect(ticks[0].style.background).toContain("255, 255, 255"); // user 灰
  expect(ticks[1].style.background).toContain("120, 170, 255"); // assistant 蓝
});
