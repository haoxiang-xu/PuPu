import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import SubagentPicker from "./subagent_picker";
import { entry_reference, ineligible_reason } from "./subagent_eligibility";
import { api } from "../../../../SERVICEs/api";
import zh from "../../../../locales/zh-CN.json";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: { listRecipes: jest.fn() } } }));
test("legacy inline picker preserves authored text, focus and exact saved shape across a locale-only switch", async () => {
  api.unchain.listRecipes.mockResolvedValue({ recipes: [] }); const onPick = jest.fn();
  const tree = (locale) => <ConfigContext.Provider value={{ theme: {} }}><LocaleContext.Provider value={{ locale }}>
    <SubagentPicker onPick={onPick} onClose={jest.fn()} isDark={false} />
  </LocaleContext.Provider></ConfigContext.Provider>;
  const view = render(tree("en")); fireEvent.click(await screen.findByText("Author inline"));
  const input = screen.getByPlaceholderText("Subagent name");
  const name = "Referenced · agents.raw {name}"; const prompt = "{{#start.text#}} é\n用户原文";
  fireEvent.change(input, { target: { value: name } });
  const text = screen.getByPlaceholderText("You are...");
  fireEvent.change(text, { target: { value: prompt } });
  input.focus(); input.setSelectionRange(3, 7);
  view.rerender(tree("zh-CN"));
  expect(screen.getByDisplayValue(name)).toBe(input); expect(input).toHaveFocus();
  expect(input.selectionStart).toBe(3); expect(input.selectionEnd).toBe(7); expect(text).toHaveValue(prompt);
  expect(screen.queryByText("Author inline")).not.toBeInTheDocument(); expect(onPick).not.toHaveBeenCalled();
  await waitFor(() => expect(api.unchain.listRecipes).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: zh.agents.legacy_picker?.add || "添加" }));
  expect(onPick).toHaveBeenCalledWith({ kind: "inline", name, prompt_format: "soul", template: { prompt }, disabled_tools: [] });
});
test("legacy reference captions and eligibility prose translate without changing names or null admission", () => {
  const t = (key) => `T:${key}`;
  const entry = { kind: "recipe_ref", recipe_name: "Referenced" };
  expect(entry_reference(entry, t).name).toBe("Referenced"); expect(entry_reference(entry, t).source).toMatch(/^T:agents\./);
  for (const resource of [{ name: "raw" }, { name: "raw", kind: "workflow" }, { name: "raw", kind: "unknown" }, {}]) {
    const original = ineligible_reason(resource); const translated = ineligible_reason(resource, t);
    expect(translated === null).toBe(original === null);
    expect(translated).toEqual(original === null ? null : expect.stringMatching(/^T:agents\./));
  }
});
