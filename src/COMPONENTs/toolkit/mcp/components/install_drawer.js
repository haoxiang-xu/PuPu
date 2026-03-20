import { useState, useCallback, useMemo } from "react";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import Timeline from "../../../../BUILTIN_COMPONENTs/timeline/timeline";
import {
  PrimaryButton,
  FormField,
  FormInput,
  SectionLabel,
  Badge,
  RuntimeBadge,
} from "./shared";
import TestResult from "./test_result";
import { api } from "../../../../SERVICEs/api";

const STEPS = [
  { key: "profile", label: "Select Profile" },
  { key: "config", label: "Configure" },
  { key: "review", label: "Review & Test" },
];

/* ══════════════════════════════════════════════
   Install Drawer — 3-step flow
   ══════════════════════════════════════════════ */
const InstallDrawer = ({
  catalogEntry: entry,
  isDark,
  onBack: onClose,
  onComplete: onInstalled,
}) => {
  const [step, setStep] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [config, setConfig] = useState({});
  const [secrets, setSecrets] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const profiles = entry?.install_profiles || [];
  const activeProfile = selectedProfile || profiles[0];

  const timelineItems = useMemo(
    () =>
      STEPS.map((s, i) => ({
        title: s.label,
        status: i < step ? "done" : i === step ? "active" : "pending",
        point: i === 0 ? "start" : i === STEPS.length - 1 ? "end" : undefined,
      })),
    [step],
  );

  /* ── Handlers ── */
  const handleSelectProfile = useCallback((p) => {
    setSelectedProfile(p);
    // Pre-fill defaults
    const defaults = p.default_values || {};
    const newConfig = {};
    (p.fields || []).forEach((f) => {
      if (defaults[f.name] !== undefined) {
        newConfig[f.name] = Array.isArray(defaults[f.name])
          ? defaults[f.name].join(" ")
          : defaults[f.name];
      }
    });
    setConfig(newConfig);
    setSecrets({});
    setTestResult(null);
    setStep(1);
  }, []);

  const handleConfigChange = useCallback((fieldName, value) => {
    setConfig((prev) => ({ ...prev, [fieldName]: value }));
  }, []);

  const handleSecretChange = useCallback((secretName, value) => {
    setSecrets((prev) => ({ ...prev, [secretName]: value }));
  }, []);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const result = await api.mcp.testInstalledServer({
      instance_id: "test-draft",
    });
    setTestResult(result);
    setTesting(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const result = await api.mcp.saveInstalledServer({
      draft_entry_id: entry?.id,
      profile_id: activeProfile?.id,
      config: { ...config, name: entry?.name },
      secrets,
    });
    setSaving(false);
    onInstalled?.(result);
  }, [entry, activeProfile, config, secrets, onInstalled]);

  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        {step > 0 && (
          <button
            onClick={() => {
              setStep((s) => s - 1);
              setTestResult(null);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              border: "none",
              background: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.04)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Icon
              src="arrow_left"
              style={{ width: 16, height: 16 }}
              color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)"}
            />
          </button>
        )}
        <span
          style={{
            fontSize: 14,
            fontFamily: "Jost",
            fontWeight: 600,
            color: textColor,
          }}
        >
          {entry?.name || "Install Server"}
        </span>
      </div>

      <Timeline items={timelineItems} style={{ marginBottom: 16 }} />

      {/* ── Content ── */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* ══ Step 0: Select Profile ══ */}
        {step === 0 && (
          <>
            <SectionLabel isDark={isDark}>
              Choose an install profile
            </SectionLabel>
            {profiles.map((p) => (
              <div
                key={p.id}
                onClick={() => handleSelectProfile(p)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                  background: isDark
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.01)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  transition: "border-color 0.15s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: "Jost",
                      fontWeight: 500,
                      color: textColor,
                    }}
                  >
                    {p.label}
                  </span>
                  <RuntimeBadge runtime={p.runtime} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <Badge
                    label={p.transport}
                    color={
                      isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)"
                    }
                    bg={isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}
                  />
                  {p.platforms?.length > 0 && (
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "Jost",
                        color: mutedColor,
                      }}
                    >
                      {p.platforms.join(", ")}
                    </span>
                  )}
                </div>
                {p.requires_secrets?.length > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "Jost",
                      color: "#fb923c",
                    }}
                  >
                    Requires: {p.requires_secrets.join(", ")}
                  </span>
                )}
              </div>
            ))}
            {profiles.length === 0 && (
              <div
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: mutedColor,
                  fontSize: 13,
                  fontFamily: "Jost",
                }}
              >
                No install profiles available for this server.
              </div>
            )}
          </>
        )}

        {/* ══ Step 1: Configure ══ */}
        {step === 1 && activeProfile && (
          <>
            <SectionLabel isDark={isDark}>Configuration</SectionLabel>
            {(activeProfile.fields || []).map((field) => (
              <FormField
                key={field.name}
                label={field.label || field.name}
                required={field.required}
                isDark={isDark}
              >
                <FormInput
                  value={config[field.name] || ""}
                  onChange={(val) => handleConfigChange(field.name, val)}
                  placeholder={
                    activeProfile.default_values?.[field.name]
                      ? String(
                          Array.isArray(
                            activeProfile.default_values[field.name],
                          )
                            ? activeProfile.default_values[field.name].join(" ")
                            : activeProfile.default_values[field.name],
                        )
                      : `Enter ${field.label || field.name}`
                  }
                  isDark={isDark}
                />
              </FormField>
            ))}

            {activeProfile.requires_secrets?.length > 0 && (
              <>
                <SectionLabel isDark={isDark} style={{ marginTop: 8 }}>
                  Secrets
                </SectionLabel>
                {activeProfile.requires_secrets.map((secretName) => (
                  <FormField
                    key={secretName}
                    label={secretName}
                    required
                    hint="Stored securely. Never synced."
                    isDark={isDark}
                  >
                    <FormInput
                      value={secrets[secretName] || ""}
                      onChange={(val) => handleSecretChange(secretName, val)}
                      placeholder={`Enter ${secretName}`}
                      type="password"
                      isDark={isDark}
                    />
                  </FormField>
                ))}
              </>
            )}

            <div style={{ marginTop: 8 }}>
              <PrimaryButton
                label="Continue to Review"
                icon="arrow_right"
                onClick={() => setStep(2)}
              />
            </div>
          </>
        )}

        {/* ══ Step 2: Review & Test ══ */}
        {step === 2 && activeProfile && (
          <>
            <SectionLabel isDark={isDark}>Review</SectionLabel>
            {/* Source info */}
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: isDark
                  ? "rgba(255,255,255,0.03)"
                  : "rgba(0,0,0,0.02)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <ReviewRow label="Server" value={entry?.name} isDark={isDark} />
              <ReviewRow
                label="Runtime"
                value={activeProfile.runtime}
                isDark={isDark}
              />
              <ReviewRow
                label="Transport"
                value={activeProfile.transport}
                isDark={isDark}
              />
              {config.command && (
                <ReviewRow
                  label="Command"
                  value={[config.command, config.args]
                    .filter(Boolean)
                    .join(" ")}
                  isDark={isDark}
                  mono
                />
              )}
              {config.url && (
                <ReviewRow
                  label="URL"
                  value={config.url}
                  isDark={isDark}
                  mono
                />
              )}
              {config.cwd && (
                <ReviewRow
                  label="Working Dir"
                  value={config.cwd}
                  isDark={isDark}
                  mono
                />
              )}
              {activeProfile.requires_secrets?.length > 0 && (
                <ReviewRow
                  label="Secrets"
                  value={activeProfile.requires_secrets
                    .map((s) =>
                      secrets[s] ? `${s}: configured` : `${s}: not set`,
                    )
                    .join(", ")}
                  isDark={isDark}
                />
              )}
            </div>

            {/* Warnings */}
            {entry?.revoked && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(239,68,68,0.08)",
                }}
              >
                <Icon
                  src="warning"
                  style={{ width: 14, height: 14 }}
                  color="#ef4444"
                />
                <span
                  style={{ fontSize: 12, fontFamily: "Jost", color: "#ef4444" }}
                >
                  This server has been revoked. It cannot be enabled.
                </span>
              </div>
            )}

            {/* Test section */}
            <SectionLabel isDark={isDark} style={{ marginTop: 4 }}>
              Connection Test
            </SectionLabel>
            <TestResult result={testResult} testing={testing} isDark={isDark} />

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <PrimaryButton
                label={testing ? "Testing..." : "Test Connection"}
                icon="play"
                onClick={handleTest}
                loading={testing}
                disabled={testing}
              />
              {testResult?.status === "success" && (
                <PrimaryButton
                  label={saving ? "Saving..." : "Enable Server"}
                  icon="check"
                  onClick={handleSave}
                  loading={saving}
                  disabled={saving || entry?.revoked}
                  style={{ background: "rgba(52,211,153,0.8)" }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ── Inline helper ── */
const ReviewRow = ({ label, value, isDark, mono }) => (
  <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
    <span
      style={{
        fontSize: 11,
        fontFamily: "Jost",
        fontWeight: 500,
        minWidth: 72,
        flexShrink: 0,
        color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)",
      }}
    >
      {label}
    </span>
    <span
      style={{
        fontSize: 11.5,
        fontFamily: mono ? "JetBrains Mono, monospace" : "Jost",
        color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.7)",
        wordBreak: "break-all",
      }}
    >
      {value || "—"}
    </span>
  </div>
);

export default InstallDrawer;
