import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import en from "../../../locales/en.json";
import zhCN from "../../../locales/zh-CN.json";
import { resolvePluginTrust } from "../../../SERVICEs/plugin_trust";
import PluginTrustBadge from "./plugin_trust_badge";

jest.mock("../../../SERVICEs/plugin_trust", () => ({
  resolvePluginTrust: jest.fn(),
}));

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`trust-icon-${src}`} />,
}));

const VERIFIED_TRUST = {
  origin: "official",
  status: "verified",
  publisher: "PuPu",
  scope: [
    "publisher_identity",
    "permissions",
    "unknown_scope",
    "__proto__",
    "constructor",
  ],
  reviewedAt: "2026-09-12",
  reviewedBy: "PuPu security",
  reference: "https://evidence.example/PUPU-278-test",
};

const ENTRY = { id: "builtin.computer", source: "builtin", version: "1" };

const renderBadge = ({
  entry = ENTRY,
  locale = "en",
  isDark = false,
  onRowClick,
} = {}) =>
  render(
    <LocaleContext.Provider value={{ locale, setLocale: jest.fn() }}>
      <ConfigContext.Provider
        value={{ theme: { font: { fontFamily: "Test Font" } } }}
      >
        <div onClick={onRowClick}>
          <PluginTrustBadge entry={entry} isDark={isDark} />
        </div>
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

describe("PluginTrustBadge", () => {
  beforeEach(() => {
    resolvePluginTrust.mockReturnValue(VERIFIED_TRUST);
  });

  test("renders the selected joined two-cell marker and resolves the entry", () => {
    renderBadge();

    expect(resolvePluginTrust).toHaveBeenCalledWith(ENTRY);
    expect(screen.getByTestId("plugin-trust-origin")).toHaveTextContent(
      en.toolkit.trust_origin_official,
    );
    expect(screen.getByTestId("plugin-trust-origin")).toHaveStyle({
      color: "#2563eb",
    });
    expect(screen.getByRole("button")).toHaveTextContent(
      en.toolkit.trust_status_verified,
    );
    expect(screen.getByRole("button")).toHaveStyle({ fontWeight: "500" });
    expect(screen.getByTestId("trust-icon-verified")).toBeInTheDocument();
    expect(screen.getByTestId("plugin-trust-marker").children).toHaveLength(2);
    expect(screen.getByTestId("plugin-trust-badge")).toHaveAttribute(
      "data-origin",
      "official",
    );
    expect(screen.getByTestId("plugin-trust-badge")).toHaveAttribute(
      "data-status",
      "verified",
    );
  });

  test("expands scoped verification details without triggering the enclosing row", () => {
    const onRowClick = jest.fn();
    renderBadge({ onRowClick });

    const toggle = screen.getByRole("button", {
      name: en.toolkit.trust_toggle
        .replace("{origin}", en.toolkit.trust_origin_official)
        .replace("{status}", en.toolkit.trust_status_verified),
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(onRowClick).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByRole("region", {
      name: en.toolkit.trust_details,
    });
    expect(toggle).toHaveAttribute("aria-controls", details.id);
    expect(details).toHaveTextContent(en.toolkit.trust_official_explanation);
    expect(details).toHaveTextContent(en.toolkit.trust_limits);
    expect(details).toHaveTextContent("PuPu security");
    expect(details).toHaveTextContent("2026-09-12");
    expect(details).toHaveTextContent(
      "https://evidence.example/PUPU-278-test",
    );
    expect(details).toHaveTextContent(en.toolkit.trust_scope_publisher_identity);
    expect(details).toHaveTextContent(en.toolkit.trust_scope_permissions);
    expect(details).not.toHaveTextContent("unknown_scope");
    expect(details).not.toHaveTextContent("__proto__");
    expect(details).not.toHaveTextContent("constructor");

    fireEvent.click(details);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  test("uses a native button and Escape closes details and restores its focus", () => {
    renderBadge();
    const toggle = screen.getByRole("button");

    expect(toggle.tagName).toBe("BUTTON");
    fireEvent.click(toggle);
    const details = screen.getByTestId("plugin-trust-details");
    toggle.blur();
    expect(toggle).not.toHaveFocus();

    fireEvent.keyDown(details, { key: "Escape" });

    expect(screen.queryByTestId("plugin-trust-details")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  test("guards unknown resolver states and malformed optional fields", () => {
    resolvePluginTrust.mockReturnValue({
      origin: "partner",
      status: "trusted_forever",
      publisher: "   ",
      scope: "permissions",
      reviewedAt: 123,
      reviewedBy: {},
      reference: null,
    });
    renderBadge({ isDark: true });

    expect(screen.getByTestId("plugin-trust-origin")).toHaveTextContent(
      en.toolkit.trust_origin_unknown,
    );
    const toggle = screen.getByRole("button");
    expect(toggle).toHaveTextContent(en.toolkit.trust_status_unknown);
    expect(screen.getByTestId("trust-icon-question_mark")).toBeInTheDocument();

    fireEvent.click(toggle);
    const details = screen.getByTestId("plugin-trust-details");
    expect(details).toHaveTextContent(en.toolkit.trust_publisher_unknown);
    expect(details).toHaveTextContent(en.toolkit.trust_unknown_explanation);
    expect(details).toHaveTextContent(
      en.toolkit.trust_unknown_status_explanation,
    );
    expect(details).toHaveTextContent(en.toolkit.trust_limits);
    expect(screen.queryByTestId("plugin-trust-scope")).not.toBeInTheDocument();
  });

  test("pending is visually distinct from unknown and uses the available calendar icon", () => {
    resolvePluginTrust.mockReturnValue({
      ...VERIFIED_TRUST,
      origin: "third_party",
      status: "pending",
      scope: [],
    });
    renderBadge();

    expect(screen.getByTestId("plugin-trust-origin")).toHaveTextContent(
      en.toolkit.trust_origin_third_party,
    );
    expect(screen.getByTestId("plugin-trust-origin")).toHaveStyle({
      color: "rgba(var(--pupu-text-rgb),0.60)",
    });
    expect(screen.getByRole("button")).toHaveTextContent(
      en.toolkit.trust_status_pending,
    );
    expect(screen.getByTestId("trust-icon-calendar")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));
    const details = screen.getByTestId("plugin-trust-details");
    expect(details).toHaveTextContent(en.toolkit.trust_pending_explanation);
    expect(details).toHaveTextContent(en.toolkit.trust_limits);
    expect(details).not.toHaveTextContent("PuPu security");
    expect(details).not.toHaveTextContent("2026-09-12");
  });

  test("an entry change closes old details and renders the new trust state", () => {
    resolvePluginTrust.mockImplementation((entry) =>
      entry.id === "first"
        ? VERIFIED_TRUST
        : {
            origin: "third_party",
            status: "unverified",
            publisher: "Elsewhere",
            scope: [],
            reviewedAt: "",
            reviewedBy: "",
            reference: "",
          },
    );
    const first = { id: "first" };
    const second = { id: "second" };
    const { rerender } = render(
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <PluginTrustBadge entry={first} />
      </LocaleContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("plugin-trust-details")).toBeInTheDocument();

    rerender(
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <PluginTrustBadge entry={second} />
      </LocaleContext.Provider>,
    );

    expect(screen.queryByTestId("plugin-trust-details")).not.toBeInTheDocument();
    expect(screen.getByTestId("plugin-trust-origin")).toHaveTextContent(
      en.toolkit.trust_origin_third_party,
    );
    expect(screen.getByRole("button")).toHaveTextContent(
      en.toolkit.trust_status_unverified,
    );
  });

  test("switching LocaleContext updates an already-open explanation", () => {
    const { rerender } = render(
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <PluginTrustBadge entry={ENTRY} />
      </LocaleContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("plugin-trust-details")).toHaveTextContent(
      en.toolkit.trust_official_explanation,
    );

    rerender(
      <LocaleContext.Provider value={{ locale: "zh-CN", setLocale: jest.fn() }}>
        <PluginTrustBadge entry={ENTRY} />
      </LocaleContext.Provider>,
    );

    expect(screen.getByTestId("plugin-trust-details")).toHaveTextContent(
      zhCN.toolkit.trust_official_explanation,
    );
    expect(screen.getByRole("button")).toHaveAccessibleName(
      zhCN.toolkit.trust_toggle
        .replace("{origin}", zhCN.toolkit.trust_origin_official)
        .replace("{status}", zhCN.toolkit.trust_status_verified),
    );
  });

  test("keeps essential labels wrappable on narrow cards", () => {
    renderBadge();

    expect(screen.getByTestId("plugin-trust-marker")).toHaveStyle({
      maxWidth: "100%",
      minWidth: "0",
    });
    expect(screen.getByTestId("plugin-trust-origin")).toHaveStyle({
      whiteSpace: "normal",
      overflowWrap: "anywhere",
    });
    expect(screen.getByRole("button")).toHaveStyle({
      whiteSpace: "normal",
      overflowWrap: "anywhere",
    });
  });
});
