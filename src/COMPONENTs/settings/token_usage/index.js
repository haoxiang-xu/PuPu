import { useContext, useState, useMemo, useCallback } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Select from "../../../BUILTIN_COMPONENTs/select/select";
import { BarChart } from "../../../BUILTIN_COMPONENTs/bar_chart";
import { SettingsSection } from "../appearance";
import { readTokenUsageRecords, clearTokenUsageRecords } from "./storage";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

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
  { value: "7d", label: "7 days", trigger_label: "7d" },
  { value: "30d", label: "30 days", trigger_label: "30d" },
  { value: "90d", label: "90 days", trigger_label: "90d" },
  { value: "all", label: "All time", trigger_label: "All" },
];

const GRANULARITY_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

const COMPACT_STYLE = {
  minWidth: 0,
  fontSize: 12,
  paddingVertical: 3,
  paddingHorizontal: 8,
};
const OPT_STYLE = { height: 28, padding: "4px 8px", fontSize: 12 };
const DD_STYLE = { padding: 4 };

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
    let totalTokens = 0;

    for (const r of filtered) {
      const k = keyFn(r.timestamp);
      bucketMap.set(k, (bucketMap.get(k) || 0) + r.consumed_tokens);
      totalTokens += r.consumed_tokens;
    }

    // Sort buckets chronologically
    const sortedKeys = [...bucketMap.keys()].sort();
    const chartData = sortedKeys.map((k) => ({
      label: formatBucketLabel(k, granularity),
      value: bucketMap.get(k),
    }));

    // Stats
    const requestCount = filtered.length;
    const avgTokens =
      requestCount > 0 ? Math.round(totalTokens / requestCount) : 0;

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

    return { chartData, totalTokens, requestCount, avgTokens, topModel };
  }, [provider, model, range, granularity, records]);
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Stat Card                                                                                                                  */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const StatCard = ({ label, value, isDark, fontFamily }) => (
  <div
    style={{
      flex: 1,
      minWidth: 110,
      padding: "14px 16px",
      borderRadius: 10,
      backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
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
        fontWeight: 600,
        color: isDark ? "#fff" : "#222",
        fontFamily,
      }}
    >
      {value}
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  TokenUsageSettings — main settings page component                                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const TokenUsageSettings = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "inherit";

  // State
  const [records, setRecords] = useState(() => readTokenUsageRecords());
  const [provider, setProvider] = useState(ALL);
  const [model, setModel] = useState(ALL);
  const [range, setRange] = useState("30d");
  const [granularity, setGranularity] = useState("day");

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
      { value: ALL, label: "All Providers", trigger_label: "All" },
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
      { value: ALL, label: "All Models", trigger_label: "All Models" },
      ...filteredModels
        .sort((a, b) => a.model_id.localeCompare(b.model_id))
        .map((m) => ({
          value: m.model_id,
          label: m.model_id,
          trigger_label: m.model,
        })),
    ];

    return { providerOptions: provOpts, modelOptions: modOpts };
  }, [records, provider]);

  // When provider changes, reset model to ALL
  const handleProviderChange = useCallback((val) => {
    setProvider(val);
    setModel(ALL);
  }, []);

  // Aggregated data
  const { chartData, totalTokens, requestCount, avgTokens, topModel } =
    useTokenUsageData({ provider, model, range, granularity, records });

  // Clear data
  const handleClear = useCallback(() => {
    clearTokenUsageRecords();
    setRecords([]);
  }, []);

  return (
    <div>
      {/* ── Summary stats ───────────────────────────────────────────────── */}
      <SettingsSection title="Overview">
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            padding: "14px 0",
          }}
        >
          <StatCard
            label="Total Tokens"
            value={formatTokenCount(totalTokens)}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label="Requests"
            value={requestCount.toLocaleString()}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label="Avg / Request"
            value={formatTokenCount(avgTokens)}
            isDark={isDark}
            fontFamily={fontFamily}
          />
          <StatCard
            label="Top Model"
            value={topModel}
            isDark={isDark}
            fontFamily={fontFamily}
          />
        </div>
      </SettingsSection>

      {/* ── Chart + inline filters ─────────────────────────────────────── */}
      <SettingsSection title="Usage">
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            padding: "10px 0 6px",
            flexWrap: "nowrap",
            overflow: "hidden",
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
              minWidth: provider !== ALL && PROVIDER_ICON[provider] ? 40 : 52,
            }}
            option_style={OPT_STYLE}
            dropdown_style={DD_STYLE}
          />
          <Select
            options={modelOptions}
            value={model}
            set_value={setModel}
            filterable={modelOptions.length > 6}
            search_placeholder="Search models…"
            style={{ ...COMPACT_STYLE, minWidth: 90, maxWidth: 160 }}
            option_style={OPT_STYLE}
            dropdown_style={DD_STYLE}
          />
          <div style={{ flex: 1 }} />
          <Select
            options={GRANULARITY_OPTIONS}
            value={granularity}
            set_value={setGranularity}
            filterable={false}
            style={{ ...COMPACT_STYLE, minWidth: 56 }}
            option_style={OPT_STYLE}
            dropdown_style={DD_STYLE}
          />
          <Select
            options={RANGE_OPTIONS}
            value={range}
            set_value={setRange}
            filterable={false}
            style={{ ...COMPACT_STYLE, minWidth: 48 }}
            option_style={OPT_STYLE}
            dropdown_style={DD_STYLE}
          />
        </div>
        <div style={{ padding: "24px 0 16px" }}>
          <BarChart
            data={chartData}
            height={220}
            emptyMessage="No token usage data yet"
          />
        </div>
      </SettingsSection>

      {/* ── Danger zone ─────────────────────────────────────────────────── */}
      <SettingsSection title="Data">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 0",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontFamily,
                color: isDark ? "#fff" : "#222",
                marginBottom: 2,
              }}
            >
              Clear usage data
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily,
                color: isDark ? "#fff" : "#222",
                opacity: 0.45,
              }}
            >
              Remove all stored token usage records
            </div>
          </div>
          <Button
            label="Clear"
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
