import { useContext, useState, useMemo, useCallback } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Select from "../../../BUILTIN_COMPONENTs/select/select";
import { BarChart } from "../../../BUILTIN_COMPONENTs/bar_chart";
import { SettingsSection } from "../appearance";
import { readTokenUsageRecords, clearTokenUsageRecords } from "./storage";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Constants                                                                                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ALL = "__all__";

const PROVIDER_ICON = {
  openai: "open_ai",
  anthropic: "Anthropic",
  ollama: "ollama",
};

const RANGE_OPTIONS = [
  { value: "7d", labelKey: "7_days", trigger_label: "7d" },
  { value: "30d", labelKey: "30_days", trigger_label: "30d" },
  { value: "90d", labelKey: "90_days", trigger_label: "90d" },
  { value: "all", labelKey: "all_time", trigger_label: "All" },
];

const GRANULARITY_OPTIONS = [
  { value: "day", labelKey: "day" },
  { value: "week", labelKey: "week" },
  { value: "month", labelKey: "month" },
];

const COMPACT_STYLE = {
  minWidth: 0,
  fontSize: 12,
  paddingVertical: 3,
  paddingHorizontal: 8,
};
const OPT_STYLE = { height: 28, padding: "4px 8px", fontSize: 12 };
const DD_STYLE = { padding: 4 };
const BREAKDOWN_CHART_HEIGHT = 220;
const BREAKDOWN_Y_GRID_LINES = 4;
const BREAKDOWN_BAR_RADIUS = 3;
const CHART_UNIT_HEADROOM = 18;
const BREAKDOWN_SERIES = [
  {
    key: "input",
    labelKey: "input",
    lightColor: "rgba(14,165,233,0.84)",
    darkColor: "rgba(56,189,248,0.9)",
  },
  {
    key: "output",
    labelKey: "output",
    lightColor: "rgba(249,115,22,0.84)",
    darkColor: "rgba(251,146,60,0.9)",
  },
];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Helpers                                                                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const rangeToCutoff = (range) => {
  const now = Date.now();
  const DAY = 86_400_000;
  switch (range) {
    case "7d":
      return now - 7 * DAY;
    case "30d":
      return now - 30 * DAY;
    case "90d":
      return now - 90 * DAY;
    default:
      return 0;
  }
};

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const weekKey = (ts) => {
  const d = new Date(ts);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d - jan1) / 86_400_000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
};

const monthKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const bucketKeyFn = (granularity) => {
  switch (granularity) {
    case "week":
      return weekKey;
    case "month":
      return monthKey;
    default:
      return dayKey;
  }
};

const formatBucketLabel = (key, granularity) => {
  if (granularity === "week") {
    return key; // "2026-W11"
  }
  if (granularity === "month") {
    const [y, m] = key.split("-");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${months[Number(m) - 1]} ${y}`;
  }
  // day
  const [, m, d] = key.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[Number(m) - 1]} ${Number(d)}`;
};

const formatTokenCount = (n) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
};

const deriveYAxisUnit = (niceMax) => {
  if (niceMax >= 1_000_000) return { suffix: "M", divisor: 1_000_000 };
  if (niceMax >= 1_000) return { suffix: "k", divisor: 1_000 };
  return { suffix: "", divisor: 1 };
};

const formatYTick = (val, divisor) => {
  const scaled = val / divisor;
  return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
};

const niceRound = (val) => {
  if (val <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
  const normalized = val / magnitude;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Custom hook — useTokenUsageData                                                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const useTokenUsageData = ({
  provider,
  model,
  range,
  granularity,
  records,
}) => {
  return useMemo(() => {
    const cutoff = rangeToCutoff(range);

    const filtered = records.filter((r) => {
      if (r.timestamp < cutoff) return false;
      if (provider !== ALL && r.provider !== provider) return false;
      if (model !== ALL && r.model_id !== model) return false;
      return true;
    });

    // Aggregate by bucket
    const keyFn = bucketKeyFn(granularity);
    const bucketMap = new Map();
    let totalConsumedTokens = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const r of filtered) {
      const k = keyFn(r.timestamp);
      const bucket = bucketMap.get(k) || {
        consumed: 0,
        input: 0,
        output: 0,
      };
      bucket.consumed += r.consumed_tokens;
      bucket.input += r.input_tokens || 0;
      bucket.output += r.output_tokens || 0;
      bucketMap.set(k, bucket);
      totalConsumedTokens += r.consumed_tokens;
      totalInputTokens += r.input_tokens || 0;
      totalOutputTokens += r.output_tokens || 0;
    }

    // Sort buckets chronologically
    const sortedKeys = [...bucketMap.keys()].sort();
    const chartData = sortedKeys.map((k) => ({
      label: formatBucketLabel(k, granularity),
      value: bucketMap.get(k)?.consumed || 0,
    }));
    const breakdownChartData = sortedKeys.map((k) => ({
      label: formatBucketLabel(k, granularity),
      input: bucketMap.get(k)?.input || 0,
      output: bucketMap.get(k)?.output || 0,
    }));

    // Stats
    const requestCount = filtered.length;
    const avgConsumedTokens =
      requestCount > 0 ? Math.round(totalConsumedTokens / requestCount) : 0;

    // Most used model
    const modelCounts = new Map();
    for (const r of filtered) {
      modelCounts.set(r.model_id, (modelCounts.get(r.model_id) || 0) + 1);
    }
    let topModel = "—";
    let topModelCount = 0;
    for (const [mid, cnt] of modelCounts) {
      if (cnt > topModelCount) {
        topModel = mid;
        topModelCount = cnt;
      }
    }

    return {
      chartData,
      breakdownChartData,
      totalConsumedTokens,
      totalInputTokens,
      totalOutputTokens,
      requestCount,
      avgConsumedTokens,
      topModel,
    };
  }, [provider, model, range, granularity, records]);
};

const ChartTitle = ({ title, description, isDark, fontFamily }) => (
  <div style={{ paddingBottom: 10 }}>
    <div
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: isDark ? "#fff" : "#222",
        fontFamily,
      }}
    >
      {title}
    </div>
    {description ? (
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
          fontFamily,
        }}
      >
        {description}
      </div>
    ) : null}
  </div>
);

const BreakdownLegend = ({ isDark, fontFamily, series }) => (
  <div
    style={{
      display: "flex",
      gap: 12,
      alignItems: "center",
      paddingBottom: 12,
      flexWrap: "wrap",
    }}
  >
    {series.map((s) => (
      <div
        key={s.key}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
          fontFamily,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            backgroundColor: isDark ? s.darkColor : s.lightColor,
          }}
        />
        {s.label}
      </div>
    ))}
  </div>
);

const TokenBreakdownChart = ({
  data = [],
  height = BREAKDOWN_CHART_HEIGHT,
  isDark,
  fontFamily,
  emptyMessage,
  series = BREAKDOWN_SERIES,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const hasUsableData = data.some(
    (entry) => entry.input > 0 || entry.output > 0,
  );

  if (!data.length || !hasUsableData) {
    return (
      <div
        data-testid="token-breakdown-chart"
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontFamily,
          color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)",
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  const maxValue = data.reduce(
    (max, entry) => Math.max(max, entry.input || 0, entry.output || 0),
    0,
  );
  const niceMax = niceRound(maxValue);
  const { suffix: yUnit, divisor: yDivisor } = deriveYAxisUnit(niceMax);
  const gridLines = Array.from({ length: BREAKDOWN_Y_GRID_LINES + 1 }, (_, i) =>
    Math.round((niceMax / BREAKDOWN_Y_GRID_LINES) * i),
  );

  return (
    <div
      data-testid="token-breakdown-chart"
      style={{
        position: "relative",
        width: "100%",
        height,
        display: "flex",
        fontFamily,
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 48,
          flexShrink: 0,
          position: "relative",
          height: "100%",
        }}
      >
        {yUnit ? (
          <span
            style={{
              position: "absolute",
              right: 4,
              top: -28,
              fontSize: 9,
              color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
              lineHeight: "12px",
              fontStyle: "italic",
            }}
          >
            {yUnit}
          </span>
        ) : null}
        {gridLines.map((val, i) => {
          const pct = (val / niceMax) * 100;
          return (
            <span
              key={i}
              style={{
                position: "absolute",
                right: 4,
                bottom: `calc(${pct}% - 6px)`,
                fontSize: 10,
                color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)",
                lineHeight: "12px",
              }}
            >
              {formatYTick(val, yDivisor)}
            </span>
          );
        })}
      </div>

      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {gridLines.map((val, i) => {
            const pct = (val / niceMax) * 100;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: `${pct}%`,
                  height: 1,
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.06)",
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "stretch",
            gap: data.length > 20 ? 4 : data.length > 10 ? 6 : 10,
            padding: "0 4px",
            position: "relative",
          }}
        >
          {data.map((entry, index) => {
            const isHovered = hoveredIndex === index;
            return (
              <div
                key={entry.label}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  position: "relative",
                  cursor: "default",
                }}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {isHovered ? (
                  <div
                    style={{
                      position: "absolute",
                      bottom: `calc(${(Math.max(entry.input, entry.output) / niceMax) * 100}% + 10px)`,
                      ...(index >= data.length - 2 && data.length > 3
                        ? { right: 0 }
                        : index <= 1 && data.length > 3
                          ? { left: 0 }
                          : { left: "50%", transform: "translateX(-50%)" }),
                      backgroundColor: isDark ? "#2a2a2a" : "#fff",
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                      borderRadius: 6,
                      padding: "6px 8px",
                      fontSize: 11,
                      color: isDark ? "#fff" : "#222",
                      whiteSpace: "nowrap",
                      zIndex: 10,
                      boxShadow: isDark
                        ? "0 4px 12px rgba(0,0,0,0.4)"
                        : "0 4px 12px rgba(0,0,0,0.08)",
                      pointerEvents: "none",
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>
                      {entry.label}
                    </div>
                    {series.map((s) => (
                      <div
                        key={s.key}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          color: isDark
                            ? "rgba(255,255,255,0.9)"
                            : "rgba(0,0,0,0.8)",
                        }}
                      >
                        <span>{s.label}</span>
                        <span>{formatTokenCount(entry[s.key] || 0)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div
                  style={{
                    width: "100%",
                    maxWidth: 52,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    gap: 4,
                    height: "100%",
                  }}
                >
                  {series.map((s) => {
                    const value = entry[s.key] || 0;
                    const pct =
                      value > 0 ? Math.max((value / niceMax) * 100, 1) : 0;
                    return (
                      <div
                        key={s.key}
                        aria-label={`${s.label} ${entry.label}: ${formatTokenCount(value)} tokens`}
                        style={{
                          flex: 1,
                          maxWidth: 18,
                          height: pct > 0 ? `${pct}%` : 0,
                          minHeight: value > 0 ? 2 : 0,
                          borderRadius: `${BREAKDOWN_BAR_RADIUS}px ${BREAKDOWN_BAR_RADIUS}px 1px 1px`,
                          backgroundColor: isDark
                            ? s.darkColor
                            : s.lightColor,
                          opacity: isHovered || value === 0 ? 1 : 0.92,
                          transition:
                            "height 0.4s cubic-bezier(.4,0,.2,1), opacity 0.15s",
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            gap: data.length > 20 ? 4 : data.length > 10 ? 6 : 10,
            padding: "6px 4px 0",
          }}
        >
          {data.map((entry) => (
            <div
              key={entry.label}
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "center",
                fontSize: 10,
                color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {entry.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Stat Card                                                                                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const StatCard = ({ label, value, isDark, fontFamily }) => {
  const testId = `token-usage-stat-${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;

  return (
    <div
      data-testid={testId}
      style={{
        minWidth: 0,
        padding: "14px 16px",
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(255,255,255,0.04)"
          : "rgba(0,0,0,0.03)",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
          fontFamily,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 400,
          color: isDark ? "#fff" : "#222",
          fontFamily,
          lineHeight: 1.2,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  TokenUsageSettings — main settings page component                                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const TokenUsageSettings = () => {
  const { t } = useTranslation();
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "inherit";

  // State
  const [records, setRecords] = useState(() => readTokenUsageRecords());
  const [provider, setProvider] = useState(ALL);
  const [model, setModel] = useState(ALL);
  const [range, setRange] = useState("30d");
  const [granularity, setGranularity] = useState("day");

  // Translated versions of module-level constants
  const rangeOptions = useMemo(() => RANGE_OPTIONS.map(opt => ({
    ...opt,
    label: t(`token_usage.${opt.labelKey}`),
  })), [t]);

  const granularityOptions = useMemo(() => GRANULARITY_OPTIONS.map(opt => ({
    ...opt,
    label: t(`token_usage.${opt.labelKey}`),
  })), [t]);

  const breakdownSeries = useMemo(() => BREAKDOWN_SERIES.map(s => ({
    ...s,
    label: t(`token_usage.${s.labelKey}`),
  })), [t]);

  // Derive provider & model options from records
  const { providerOptions, modelOptions } = useMemo(() => {
    const providerSet = new Set();
    const modelMap = new Map(); // model_id → { provider, model, model_id }

    for (const r of records) {
      providerSet.add(r.provider);
      if (!modelMap.has(r.model_id)) {
        modelMap.set(r.model_id, {
          provider: r.provider,
          model: r.model,
          model_id: r.model_id,
        });
      }
    }

    const provOpts = [
      { value: ALL, label: t("token_usage.all_providers"), trigger_label: "All" },
      ...[...providerSet].sort().map((p) => ({
        value: p,
        label: p.charAt(0).toUpperCase() + p.slice(1),
        icon: PROVIDER_ICON[p] || undefined,
        trigger_label: PROVIDER_ICON[p]
          ? " "
          : p.charAt(0).toUpperCase() + p.slice(1),
      })),
    ];

    const filteredModels =
      provider === ALL
        ? [...modelMap.values()]
        : [...modelMap.values()].filter((m) => m.provider === provider);

    const modOpts = [
      { value: ALL, label: t("token_usage.all_models"), trigger_label: t("token_usage.all_models") },
      ...filteredModels
        .sort((a, b) => a.model_id.localeCompare(b.model_id))
        .map((m) => ({
          value: m.model_id,
          label: m.model_id,
          trigger_label: m.model,
        })),
    ];

    return { providerOptions: provOpts, modelOptions: modOpts };
  }, [records, provider, t]);

  // When provider changes, reset model to ALL
  const handleProviderChange = useCallback((val) => {
    setProvider(val);
    setModel(ALL);
  }, []);

  // Aggregated data
  const {
    chartData,
    breakdownChartData,
    totalConsumedTokens,
    totalInputTokens,
    totalOutputTokens,
    requestCount,
    avgConsumedTokens,
    topModel,
  } = useTokenUsageData({ provider, model, range, granularity, records });

  // Clear data
  const handleClear = useCallback(() => {
    clearTokenUsageRecords();
    setRecords([]);
  }, []);

  return (
    <div
      data-testid="token-usage-page"
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
      }}
    >
      {/* ── Summary stats ───────────────────────────────────────────────── */}
      <SettingsSection title={t("token_usage.overview")}>
        <div
          data-testid="token-usage-overview-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
            padding: "14px 0",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          <StatCard
            label={t("token_usage.consumed_tokens")}
            value={formatTokenCount(totalConsumedTokens)}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label={t("token_usage.input_tokens")}
            value={formatTokenCount(totalInputTokens)}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label={t("token_usage.output_tokens")}
            value={formatTokenCount(totalOutputTokens)}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label={t("token_usage.requests")}
            value={requestCount.toLocaleString()}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label={t("token_usage.avg_consumed")}
            value={formatTokenCount(avgConsumedTokens)}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label={t("token_usage.top_model")}
            value={topModel}
            isDark={isDark}
            fontFamily={fontFamily}
          />
        </div>
      </SettingsSection>

      {/* ── Chart + inline filters ─────────────────────────────────────── */}
      <SettingsSection title={t("token_usage.usage")}>
        <div
          data-testid="token-usage-filters"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "10px 0 6px",
            flexWrap: "nowrap",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          <Select
            options={providerOptions}
            value={provider}
            set_value={handleProviderChange}
            filterable={false}
            show_trigger_icon={true}
            style={{
              ...COMPACT_STYLE,
              flex: "1 1 0",
              minWidth: provider !== ALL && PROVIDER_ICON[provider] ? 44 : 68,
            }}
            option_style={OPT_STYLE}
            dropdown_style={DD_STYLE}
          />
          <Select
            options={modelOptions}
            value={model}
            set_value={setModel}
            filterable={true}
            search_placeholder={t("token_usage.search_models")}
            style={{
              ...COMPACT_STYLE,
              flex: "2 1 0",
              minWidth: 0,
            }}
            option_style={OPT_STYLE}
            dropdown_style={{ ...DD_STYLE, padding: 6, maxHeight: 280 }}
          />
          <Select
            options={granularityOptions}
            value={granularity}
            set_value={setGranularity}
            filterable={false}
            style={{
              ...COMPACT_STYLE,
              flex: "1 1 0",
              minWidth: 0,
            }}
            option_style={OPT_STYLE}
            dropdown_style={DD_STYLE}
          />
          <Select
            options={rangeOptions}
            value={range}
            set_value={setRange}
            filterable={false}
            style={{
              ...COMPACT_STYLE,
              flex: "1 1 0",
              minWidth: 0,
            }}
            option_style={OPT_STYLE}
            dropdown_style={DD_STYLE}
          />
        </div>
        <div
          style={{
            padding: "24px 0 16px",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            overflow: "visible",
          }}
        >
          <ChartTitle
            title={t("token_usage.consumed_usage")}
            description={t("token_usage.consumed_usage_desc")}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <div style={{ marginTop: CHART_UNIT_HEADROOM }}>
            <BarChart
              data={chartData}
              height={220}
              emptyMessage={t("token_usage.no_data")}
            />
          </div>
        </div>
        <div
          style={{
            padding: "8px 0 16px",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
            overflow: "visible",
          }}
        >
          <ChartTitle
            title={t("token_usage.breakdown")}
            description={t("token_usage.breakdown_desc")}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <BreakdownLegend isDark={isDark} fontFamily={fontFamily} series={breakdownSeries} />
          <div style={{ marginTop: CHART_UNIT_HEADROOM }}>
            <TokenBreakdownChart
              data={breakdownChartData}
              isDark={isDark}
              fontFamily={fontFamily}
              emptyMessage={t("token_usage.no_data")}
              series={breakdownSeries}
            />
          </div>
        </div>
      </SettingsSection>

      {/* ── Danger zone ─────────────────────────────────────────────────── */}
      <SettingsSection title={t("token_usage.data")}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            padding: "14px 0",
            width: "100%",
            maxWidth: "100%",
            minWidth: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontFamily,
                color: isDark ? "#fff" : "#222",
                marginBottom: 2,
              }}
            >
              {t("token_usage.clear_usage")}
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily,
                color: isDark ? "#fff" : "#222",
                opacity: 0.45,
              }}
            >
              {t("token_usage.clear_usage_desc")}
            </div>
          </div>
          <Button
            label={t("token_usage.clear")}
            onClick={handleClear}
            style={{
              fontSize: 13,
              padding: "6px 16px",
              borderRadius: 7,
              color: "#ef4444",
              opacity: records.length === 0 ? 0.35 : 1,
            }}
            disabled={records.length === 0}
          />
        </div>
      </SettingsSection>
    </div>
  );
};
