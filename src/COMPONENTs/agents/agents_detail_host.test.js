import React from "react";
import { render, screen } from "@testing-library/react";
import AgentsDetailHost from "./agents_detail_host";
import { NavigationContext } from "../../CONTAINERs/config/context";

const show = (nav) =>
  render(
    <NavigationContext.Provider value={{ appMode: "agents", setAgentsDetailSlot: () => {}, ...nav }}>
      <AgentsDetailHost />
    </NavigationContext.Provider>,
  );

test("spans the window and clips, so a panel slid out to the right adds no horizontal scroll", () => {
  show();
  const host = screen.getByTestId("agents-detail-host");
  expect(host.style.left).toBe("0px");
  expect(host.style.right).toBe("0px");
  expect(host.style.overflow).toBe("hidden");
  expect(host.style.pointerEvents).toBe("none");
});

test("hidden while the chat is showing", () => {
  show({ appMode: "chat" });
  const host = screen.getByTestId("agents-detail-host");
  expect(host.style.visibility).toBe("hidden");
  expect(host.getAttribute("aria-hidden")).toBe("true");
});
