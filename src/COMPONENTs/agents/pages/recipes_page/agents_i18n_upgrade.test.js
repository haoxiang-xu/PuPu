import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../../CONTAINERs/config/context";
import LegacyUpgradeWizard from "./legacy_upgrade/legacy_upgrade_wizard";
import fixture from "../../../../SERVICEs/legacy_upgrade_producer.json";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {
  listToolModalCatalog: jest.fn(async () => ({ toolkits: [] })),
} } }));
jest.mock("../../../../BUILTIN_COMPONENTs/modal/modal", () => ({ __esModule: true,
  default: ({ open, children, ariaLabel }) => open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null }));
jest.mock("./detail_panel/kernel_section", () => ({ __esModule: true,
  default: () => <div data-testid="kernel-isolated" /> }));

const raw = "agents.upgrade.title {value} RAW_HOST";
const payload = (row) => JSON.parse(row.payload_json);
const row = fixture.cases.default;
const localize = (locale, element) => <ConfigContext.Provider value={{ theme: {} }}>
  <LocaleContext.Provider value={{ locale }}>{element}</LocaleContext.Provider>
</ConfigContext.Provider>;
const setup = (overrides = {}) => {
  const inventory = payload(row.inventory);
  inventory.requirements[0].message = raw;
  const services = {
    capabilities: jest.fn(async () => fixture.capabilities),
    inspect: jest.fn(async () => ({ response: row.inventory, payload: inventory })),
    preview: jest.fn(), apply: jest.fn(), read: jest.fn(), configured: () => true,
    ...overrides,
  };
  const resource = { ...row.before, name: raw };
  const onUpgraded = jest.fn(); const onClose = jest.fn();
  const element = <LegacyUpgradeWizard open resource={resource} onClose={onClose} onUpgraded={onUpgraded} isDark={false} services={services} />;
  return { element, services, onClose, onUpgraded };
};

test("upgrade language changes retain explicit answers, the same focused toolkit input and exact host requirements", async () => {
  const { element, services, onUpgraded } = setup();
  const view = render(localize("en", element));
  const slot = await screen.findByTestId("legacy-upgrade-slot-toolkit");
  const input = within(slot).getByRole("textbox");
  fireEvent.change(input, { target: { value: "agents.upgrade.title {raw}" } });
  input.focus(); input.setSelectionRange(2, 7);
  const reads = services.inspect.mock.calls.length;
  view.rerender(localize("zh-CN", element));
  expect(screen.getByRole("dialog")).not.toHaveAccessibleName("Upgrade legacy Agent");
  expect(screen.getByTestId("legacy-upgrade-wizard")).not.toHaveTextContent("Your choices");
  expect(screen.getByTestId("legacy-upgrade-info")).toHaveTextContent("builtin_prompt_review_required");
  expect(screen.getByTestId("legacy-upgrade-wizard")).toHaveTextContent(raw);
  expect(within(slot).getByRole("textbox")).toBe(input); expect(input).toHaveFocus();
  expect(input.value).toBe("agents.upgrade.title {raw}"); expect([input.selectionStart, input.selectionEnd]).toEqual([2, 7]);
  expect(services.inspect).toHaveBeenCalledTimes(reads);
  expect(services.preview).not.toHaveBeenCalled(); expect(services.apply).not.toHaveBeenCalled(); expect(onUpgraded).not.toHaveBeenCalled();
});

test("an unavailable host keeps raw refusal data while the owned explanation follows locale without a new inspect", async () => {
  const error = Object.assign(new Error(raw), { code: "RAW_CODE", path: ["raw", 2] });
  const { element, services } = setup({ capabilities: jest.fn(async () => { throw error; }) });
  const view = render(localize("en", element));
  const notice = await screen.findByTestId("legacy-upgrade-unavailable");
  expect(notice).toHaveTextContent(raw);
  const english = notice.textContent;
  view.rerender(localize("zh-CN", element));
  expect(notice.textContent).not.toBe(english); expect(notice).toHaveTextContent(raw);
  expect(services.capabilities).toHaveBeenCalledTimes(1); expect(services.inspect).not.toHaveBeenCalled();
});

test("closing a translated upgrade still performs no write", async () => {
  const { element, services, onClose } = setup();
  render(localize("zh-CN", element));
  await screen.findByTestId("legacy-upgrade-slot-toolkit");
  const cancel = screen.getAllByRole("button").find((button) => button.textContent === "取消");
  expect(cancel).toBeDefined();
  fireEvent.click(cancel);
  expect(onClose).toHaveBeenCalledTimes(1); expect(services.apply).not.toHaveBeenCalled();
});
