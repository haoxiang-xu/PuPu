import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ConfigContext, LocaleContext } from "../../../CONTAINERs/config/context";
import { TokenUsageSettings } from "./index";
import {
  resetTokenUsageStorageForTests,
  TOKEN_USAGE_MIGRATION_MARKER_KEY,
} from "./storage";

let lastBarChartProps = null;

jest.mock("../../../BUILTIN_COMPONENTs/select/select", () => {
  const MockSelect = ({
    options = [],
    value = "",
    set_value = () => {},
    placeholder = "select",
  }) => (
    <select
      data-testid="mock-select"
      value={value || ""}
      onChange={(event) => set_value(event.target.value)}
      aria-label={placeholder}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label || option.value}
        </option>
      ))}
    </select>
  );

  return {
    __esModule: true,
    default: MockSelect,
    Select: MockSelect,
  };
});

jest.mock("../../../BUILTIN_COMPONENTs/bar_chart", () => ({
  __esModule: true,
  BarChart: (props) => {
    lastBarChartProps = props;
    return <div data-testid="bar-chart" />;
  },
}));

jest.mock("../appearance", () => ({
  __esModule: true,
  SettingsSection: ({ title, children }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick = () => {}, disabled = false }) => (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  ),
}));

const renderTokenUsageSettings = () =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <TokenUsageSettings />
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

const setTokenUsageRecords = (records) => {
  window.localStorage.setItem(
    "token_usage",
    JSON.stringify({
      records,
    }),
  );
};

const expectStatCardValue = (label, value) => {
  const testId = `token-usage-stat-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
  expect(
    within(screen.getByTestId(testId)).getByText(String(value)),
  ).toBeInTheDocument();
};

describe("TokenUsageSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    lastBarChartProps = null;
  });

  test("keeps the page responsive without horizontal overflow", () => {
    setTokenUsageRecords([
      {
        timestamp: Date.now(),
        provider: "openai",
        model: "gpt-5-thinking",
        model_id:
          "openai:gpt-5-thinking-preview-2026-03-very-long-model-identifier",
        consumed_tokens: 1280,
        input_tokens: 640,
        output_tokens: 640,
      },
    ]);

    renderTokenUsageSettings();

    expect(screen.getByTestId("token-usage-page")).toHaveStyle(
      "overflow-x: hidden",
    );
    expect(screen.getByTestId("token-usage-overview-grid")).toHaveStyle(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
    expect(screen.getByTestId("token-usage-filters")).toHaveStyle(
      "flex-wrap: nowrap",
    );
    expect(
      within(screen.getByTestId("token-usage-stat-top-model")).getByText(
        "openai:gpt-5-thinking-preview-2026-03-very-long-model-identifier",
      ),
    ).toBeInTheDocument();
  });

  test("renders consumed, input, and output summaries for mixed legacy and new records", () => {
    const now = Date.now();
    setTokenUsageRecords([
      {
        timestamp: now,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 11,
      },
      {
        timestamp: now,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        input_tokens: 7,
        output_tokens: 5,
      },
      {
        timestamp: now,
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        model_id: "anthropic:claude-sonnet-4-6",
        consumed_tokens: 8,
        input_tokens: 3,
        output_tokens: 5,
      },
    ]);

    renderTokenUsageSettings();

    expectStatCardValue("Consumed Tokens", "31");
    expectStatCardValue("Input Tokens", "10");
    expectStatCardValue("Output Tokens", "10");
    expectStatCardValue("Requests", "3");
    expectStatCardValue("Avg Consumed / Request", "10");
    expectStatCardValue("Top Model", "openai:gpt-5");
    expect(screen.getByTestId("bar-chart")).toBeInTheDocument();
    expect(screen.getByTestId("token-breakdown-chart")).toBeInTheDocument();
    expect(screen.getByText("Input / Output Breakdown")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Input .+: 10 tokens$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Output .+: 10 tokens$/)).toBeInTheDocument();
    expect(lastBarChartProps).toBeTruthy();
    expect(lastBarChartProps.data.reduce((sum, item) => sum + item.value, 0)).toBe(
      31,
    );
  });

  test("uses scrollable chart layouts for dense daily data", () => {
    const now = Date.now();
    const DAY = 86_400_000;
    setTokenUsageRecords(
      Array.from({ length: 31 }, (_, index) => ({
        timestamp: now - index * DAY,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 100 + index,
        input_tokens: 60 + index,
        output_tokens: 40 + index,
      })),
    );

    renderTokenUsageSettings();
    const rangeSelect = screen.getAllByTestId("mock-select")[3];
    fireEvent.change(rangeSelect, { target: { value: "all" } });

    expect(lastBarChartProps).toBeTruthy();
    expect(lastBarChartProps.minBarWidth).toBe(12);
    expect(screen.getByTestId("token-breakdown-scroll-area")).toHaveStyle(
      "overflow-x: auto",
    );
    expect(screen.getByTestId("token-breakdown-scroll-area")).toHaveClass(
      "scrollable",
    );
  });

  test("series colors follow theme tokens (accent for output, text for input)", () => {
    // Read the source file to verify theme token references
    const fs = require("fs");
    const path = require("path");
    const sourceFile = fs.readFileSync(
      path.join(__dirname, "index.js"),
      "utf-8",
    );

    // Assert that series colors reference semantic theme tokens
    expect(sourceFile).toMatch(/--pupu-accent-rgb/);
    expect(sourceFile).toMatch(/--pupu-text-rgb/);

    // Assert old hardcoded values are no longer in the file
    expect(sourceFile).not.toMatch(/rgba\(14,165,233/);
    expect(sourceFile).not.toMatch(/rgba\(249,115,22/);
  });
});

describe("TokenUsageSettings — SQL mode (Phase 2)", () => {
  const DAY = 86_400_000;

  const installSqlBridge = (records) => {
    window.settingsStorageAPI = {
      bootstrap: jest.fn(() => ({
        available: true,
        degraded: false,
        schemaVersion: 2,
        migration: { state: "complete" },
        namespaces: {},
        revisions: {},
      })),
      migrateLegacy: jest.fn(() => Promise.resolve({ status: "complete" })),
      setNamespace: jest.fn(() => Promise.resolve({ ok: true })),
      deleteNamespace: jest.fn(() => Promise.resolve({ ok: true })),
      appendTokenUsage: jest.fn(() => Promise.resolve({ ok: true, id: 1 })),
      queryTokenUsage: jest.fn(() =>
        Promise.resolve({ ok: true, records }),
      ),
      clearTokenUsage: jest.fn(() => Promise.resolve({ ok: true, cleared: 0 })),
      migrateLegacyTokenUsage: jest.fn(() =>
        Promise.resolve({ status: "complete", digest: "d", migratedAt: 1 }),
      ),
    };
    return window.settingsStorageAPI;
  };

  beforeEach(() => {
    window.localStorage.clear();
    lastBarChartProps = null;
    resetTokenUsageStorageForTests();
    // marker present → no migration attempt from the UI mount
    window.localStorage.setItem(
      TOKEN_USAGE_MIGRATION_MARKER_KEY,
      JSON.stringify({ digest: "d", completedAt: 1 }),
    );
  });

  afterEach(() => {
    resetTokenUsageStorageForTests();
    delete window.settingsStorageAPI;
  });

  test("loads the selected date range through the SQL bridge query", async () => {
    const now = Date.now();
    const api = installSqlBridge([
      {
        timestamp: now,
        provider: "openai",
        model: "gpt-5",
        model_id: "openai:gpt-5",
        consumed_tokens: 31,
        input_tokens: 20,
        output_tokens: 11,
      },
    ]);

    renderTokenUsageSettings();

    await waitFor(() => expectStatCardValue("Consumed Tokens", "31"));
    expect(api.queryTokenUsage).toHaveBeenCalled();
    const query = api.queryTokenUsage.mock.calls[0][0];
    // default range is 30d — a bounded SQL range query, not a full pull
    expect(typeof query.startMs).toBe("number");
    expect(typeof query.endMs).toBe("number");
    expect(Math.round((query.endMs - query.startMs) / DAY)).toBe(30);
    expectStatCardValue("Requests", "1");
  });

  test("changing the range re-queries SQL ('all' = unbounded start)", async () => {
    const api = installSqlBridge([]);
    renderTokenUsageSettings();
    await waitFor(() => expect(api.queryTokenUsage).toHaveBeenCalledTimes(1));

    const rangeSelect = screen.getAllByTestId("mock-select")[3];
    fireEvent.change(rangeSelect, { target: { value: "all" } });

    await waitFor(() => expect(api.queryTokenUsage).toHaveBeenCalledTimes(2));
    expect(api.queryTokenUsage.mock.calls[1][0].startMs).toBe(0);
  });
});
