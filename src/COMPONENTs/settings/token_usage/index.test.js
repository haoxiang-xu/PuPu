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
  const labelNode = screen.getByText(label);
  const card = labelNode.parentElement;
  expect(card).not.toBeNull();
  expect(within(card).getByText(String(value))).toBeInTheDocument();
};

describe("TokenUsageSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    lastBarChartProps = null;
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
