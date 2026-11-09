import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import { agentMessage } from "./agents_i18n";
import { drill_crumbs } from "./subagent_drill";
import SkeletonDrillBreadcrumb from "./skeleton_drill_breadcrumb";

test("only owned pool breadcrumb captions translate, never an author's identical English name", () => {
  const raw = "Subagent Pool";
  const stack = [{ label: raw, via_label: agentMessage("agents.drill.subagent_pool") }, { label: "agents.drill.subagent_pool {raw}", via_label: "Hooks Pool" }];
  const crumbs = drill_crumbs(stack, raw, (key) => `T:${key}`);
  expect(crumbs[0].label).toBe(raw);
  expect(crumbs[1].label).toBe("T:agents.drill.subagent_pool");
  expect(crumbs[2].label).toBe("agents.drill.subagent_pool {raw}");
  expect(crumbs[3].label).toBe("Hooks Pool"); expect(crumbs[4].label).toBe(raw);
});

test("breadcrumb Back aria follows current language with unchanged authored label and navigation callback", () => {
  const raw = "agents.drill.back_to {name}";
  const onNavigate = jest.fn(); const crumbs = [{ label: raw, depth: 0, navigable: true }, { label: "child", depth: null, navigable: false }];
  const tree = (locale) => <ConfigContext.Provider value={{ theme: {} }}><LocaleContext.Provider value={{ locale }}>
    <SkeletonDrillBreadcrumb crumbs={crumbs} onNavigate={onNavigate} />
  </LocaleContext.Provider></ConfigContext.Provider>;
  const view = render(tree("en")); const button = screen.getByRole("button", { name: `Back to ${raw}` });
  view.rerender(tree("zh-CN"));
  expect(screen.getByRole("button")).toBe(button); expect(button).not.toHaveAccessibleName(`Back to ${raw}`);
  expect(button).toHaveTextContent(raw); expect(onNavigate).not.toHaveBeenCalled();
});
