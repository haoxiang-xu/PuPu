import React from "react";
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { TokenUsageSettings } from "./index";

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
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <TokenUsageSettings />
    </ConfigContext.Provider>,
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
      "flex-wrap: wrap",
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
});
