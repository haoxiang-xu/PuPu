import { useState, useCallback, useMemo } from "react";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import Timeline from "../../../../BUILTIN_COMPONENTs/timeline_v2/timeline";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import {
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

  const profiles = useMemo(() => entry?.install_profiles || [], [entry]);
  const activeProfile = selectedProfile || profiles[0];

  const buildProfileConfig = useCallback((profile) => {
    const defaults = profile?.default_values || {};
    const nextConfig = {};
    (profile?.fields || []).forEach((field) => {
      if (defaults[field.name] !== undefined) {
        nextConfig[field.name] = Array.isArray(defaults[field.name])
          ? defaults[field.name].join(" ")
          : defaults[field.name];
      }
    });
    return nextConfig;
  }, []);

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
    setConfig(buildProfileConfig(p));
    setSecrets({});
    setTestResult(null);
  }, [buildProfileConfig]);

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
  const activeAccent = "rgba(10,186,181,1)";
  const shellBorder = isDark
    ? "rgba(255,255,255,0.06)"
    : "rgba(0,0,0,0.05)";

  const canAdvanceFromConfig = useMemo(() => {
    if (!activeProfile) return false;
    const hasRequiredFields = (activeProfile.fields || []).every((field) => {
      if (!field.required) return true;
      return String(config[field.name] || "").trim().length > 0;
    });
    const hasRequiredSecrets = (activeProfile.requires_secrets || []).every(
      (secretName) => String(secrets[secretName] || "").trim().length > 0,
    );
    return hasRequiredFields && hasRequiredSecrets;
  }, [activeProfile, config, secrets]);

  const isBusy = testing || saving;
  const canGoNext =
    !isBusy &&
    ((step === 0 && Boolean(activeProfile)) ||
      (step === 1 && canAdvanceFromConfig));

  const handlePrev = useCallback(() => {
    if (isBusy) return;
    if (step === 0) {
      onClose?.();
      return;
    }
    setTestResult(null);
    setStep((current) => Math.max(0, current - 1));
  }, [isBusy, onClose, step]);

  const handleNext = useCallback(() => {
    if (!canGoNext) return;

    if (step === 0) {
      const profile = activeProfile || profiles[0];
      if (!profile) return;
      if (!selectedProfile || selectedProfile.id !== profile.id) {
        setSelectedProfile(profile);
        setConfig(buildProfileConfig(profile));
        setSecrets({});
      }
      setTestResult(null);
      setStep(1);
      return;
    }

    if (step === 1) {
      setTestResult(null);
      setStep(2);
    }
  }, [
    activeProfile,
    buildProfileConfig,
    canGoNext,
    profiles,
    selectedProfile,
    step,
  ]);

  const arrowButtonStyle = {
    fontSize: 12,
    fontWeight: 500,
    color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.68)",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 8,
    root: {
      background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    },
    hoverBackgroundColor: isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.07)",
    activeBackgroundColor: isDark
      ? "rgba(255,255,255,0.12)"
      : "rgba(0,0,0,0.1)",
    content: {
      icon: { width: 14, height: 14 },
      prefixIconWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
      },
    },
  };

  const ghostButtonStyle = {
    fontSize: 12,
    fontWeight: 500,
    color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.7)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
    root: {
      background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    },
    hoverBackgroundColor: isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.07)",
    activeBackgroundColor: isDark
      ? "rgba(255,255,255,0.12)"
      : "rgba(0,0,0,0.1)",
    content: { icon: { width: 14, height: 14 } },
  };

  const successButtonStyle = {
    ...ghostButtonStyle,
    color: "#34d399",
    root: {
      background: isDark ? "rgba(52,211,153,0.12)" : "rgba(52,211,153,0.1)",
    },
    hoverBackgroundColor: isDark
      ? "rgba(52,211,153,0.16)"
      : "rgba(52,211,153,0.14)",
    activeBackgroundColor: isDark
      ? "rgba(52,211,153,0.22)"
      : "rgba(52,211,153,0.18)",
    content: { icon: { width: 14, height: 14 } },
  };

  const topBackButtonStyle = {
    fontSize: 12,
    fontWeight: 500,
    color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.68)",
    paddingVertical: 5,
    paddingHorizontal: 5,
    borderRadius: 8,
    root: {
      background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    },
    hoverBackgroundColor: isDark
      ? "rgba(255,255,255,0.08)"
      : "rgba(0,0,0,0.07)",
    activeBackgroundColor: isDark
      ? "rgba(255,255,255,0.12)"
      : "rgba(0,0,0,0.1)",
    content: {
      icon: { width: 14, height: 14 },
      prefixIconWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
      },
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
          flexShrink: 0,
        }}
      >
        <Button
          prefix_icon="arrow_left"
          onClick={onClose}
          disabled={isBusy}
          style={topBackButtonStyle}
        />
        <span
          style={{
            fontSize: 14,
            fontFamily: "Jost",
            fontWeight: 600,
            color: textColor,
            flex: 1,
          }}
        >
          {entry?.name || "Install Server"}
        </span>
      </div>

      <Timeline
        items={timelineItems}
        mode="steps"
        direction="horizontal"
        current_step={step}
        compact
        inactive_hollow
        disconnect_line
        disconnect_gap={8}
        style={{ marginBottom: 16 }}
      />

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
                  border:
                    activeProfile?.id === p.id
                      ? `1px solid ${isDark ? "rgba(10,186,181,0.45)" : "rgba(10,186,181,0.28)"}`
                      : `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: isDark
                    ? activeProfile?.id === p.id
                      ? "rgba(10,186,181,0.08)"
                      : "rgba(255,255,255,0.02)"
                    : activeProfile?.id === p.id
                      ? "rgba(10,186,181,0.05)"
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
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          padding: "12px 0 16px",
          marginTop: 12,
          borderTop: `1px solid ${shellBorder}`,
          flexShrink: 0,
        }}
      >
        {step === 2 && (
          <>
            <Button
              prefix_icon="play"
              label={testing ? "Testing..." : "Test Connection"}
              onClick={handleTest}
              disabled={testing}
              style={ghostButtonStyle}
            />
            {testResult?.status === "success" && (
              <Button
                prefix_icon="check"
                label={saving ? "Saving..." : "Enable Server"}
                onClick={handleSave}
                disabled={saving || entry?.revoked}
                style={successButtonStyle}
              />
            )}
          </>
        )}

        <Button
          prefix_icon="arrow_left"
          onClick={handlePrev}
          disabled={isBusy}
          style={arrowButtonStyle}
        />
        <Button
          prefix_icon="arrow_right"
          onClick={handleNext}
          disabled={!canGoNext}
          style={{
            ...arrowButtonStyle,
            color: canGoNext
              ? activeAccent
              : arrowButtonStyle.color,
            root: {
              background: canGoNext
                ? isDark
                  ? "rgba(10,186,181,0.12)"
                  : "rgba(10,186,181,0.08)"
                : isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.04)",
            },
            hoverBackgroundColor: canGoNext
              ? isDark
                ? "rgba(10,186,181,0.16)"
                : "rgba(10,186,181,0.12)"
              : arrowButtonStyle.hoverBackgroundColor,
            activeBackgroundColor: canGoNext
              ? isDark
                ? "rgba(10,186,181,0.22)"
                : "rgba(10,186,181,0.16)"
              : arrowButtonStyle.activeBackgroundColor,
          }}
        />
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
