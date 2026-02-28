import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { Password } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import {
  readModelProviders,
  writeModelProviders,
} from "../../settings/model_providers/storage";

/* ── shared sub-components ──────────────────────────────────────────────────── */
const StatusBadge = ({ status, label }) => {
  const iconSrc =
    status === "ok" ? "check" : status === "error" ? "error" : "circle";
  const color =
    status === "ok"
      ? "rgba(10,186,181,1)"
      : status === "error"
        ? "#e05c5c"
        : "rgba(150,150,150,0.7)";
  const bg =
    status === "ok"
      ? "rgba(10,186,181,0.10)"
      : status === "error"
        ? "rgba(224,92,92,0.10)"
        : "rgba(150,150,150,0.07)";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 10px",
        borderRadius: 999,
        background: bg,
        color,
        fontSize: 12,
        fontFamily: "Jost",
        fontWeight: 500,
        border: `1px solid ${color}33`,
      }}
    >
      <Icon
        src={iconSrc}
        color={color}
        style={{ width: 14, height: 14, flexShrink: 0 }}
      />
      {label}
    </div>
  );
};

/* ── API Key sub-step ───────────────────────────────────────────────────────── */
const ApiKeySubStep = ({ providerKey, label, placeholder, isDark }) => {
  const storageKey = `${providerKey}_api_key`;
  const [value, setValue] = useState(
    () => readModelProviders()[storageKey] || "",
  );
  const [status, setStatus] = useState(() =>
    readModelProviders()[storageKey] ? "ok" : "idle",
  );
  const statusLabel =
    status === "ok" ? "Saved" : status === "error" ? "Invalid key" : "";

  const mutedColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";

  const handleSave = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    writeModelProviders({ [storageKey]: trimmed });
    setStatus("ok");
  }, [value, storageKey]);

  const canSave = value.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          fontSize: 14,
          fontFamily: "Jost",
          color: mutedColor,
          lineHeight: 1.5,
        }}
      >
        Paste your <strong style={{ fontWeight: 600 }}>{label}</strong> API key
        below. It's stored locally and never sent anywhere else.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1 }}>
          <Password
            value={value}
            set_value={(v) => {
              setValue(v);
              setStatus("idle");
            }}
            style={{
              boxShadow: "none",
              height: 24,
              fontSize: 13,
            }}
            placeholder={placeholder}
            prefix_icon="key"
          />
        </div>

        <Tooltip
          label="Save API key"
          position="top"
          style={{ "white-space": "nowrap" }}
        >
          <Button
            prefix_icon="check"
            label="Save"
            onClick={handleSave}
            disabled={!canSave}
            style={{
              root: {
                fontSize: 13,
                fontFamily: "Jost",
                fontWeight: 600,
              },
            }}
          />
        </Tooltip>
      </div>

      {status !== "idle" && <StatusBadge status={status} label={statusLabel} />}
    </div>
  );
};

/* ── Ollama sub-step ─────────────────────────────────────────────────────────── */
const OllamaSubStep = ({ isDark }) => {
  const [ollamaStatus, setOllamaStatus] = useState("checking");
  const [installProgress, setInstallProgress] = useState(null);
  const [installError, setInstallError] = useState(null);
  const [installDone, setInstallDone] = useState(false);

  const mutedColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";

  useEffect(() => {
    const check = async () => {
      try {
        const s = await window.ollamaAPI?.getStatus?.();
        setOllamaStatus(s || "not_found");
      } catch {
        setOllamaStatus("not_found");
      }
    };
    check();
  }, []);

  useEffect(() => {
    if (!window.ollamaAPI?.onInstallProgress) return;
    const unsub = window.ollamaAPI.onInstallProgress((pct) => {
      setInstallProgress(pct);
      if (pct >= 100) {
        setInstallDone(true);
        setInstallProgress(null);
      }
    });
    return () => typeof unsub === "function" && unsub();
  }, []);

  const handleInstall = async () => {
    setInstallError(null);
    setInstallProgress(0);
    try {
      await window.ollamaAPI?.install?.();
    } catch (e) {
      setInstallError(e?.message || "Download failed");
      setInstallProgress(null);
    }
  };

  const handleRecheck = async () => {
    setOllamaStatus("checking");
    try {
      const s = await window.ollamaAPI?.getStatus?.();
      setOllamaStatus(s || "not_found");
    } catch {
      setOllamaStatus("not_found");
    }
  };

  const isRunning =
    ollamaStatus === "already_running" || ollamaStatus === "started";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          fontSize: 14,
          fontFamily: "Jost",
          color: mutedColor,
          lineHeight: 1.5,
        }}
      >
        Ollama runs AI models locally on your machine. No API key required.
      </div>

      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontSize: 13,
            fontFamily: "Jost",
            color: mutedColor,
          }}
        >
          Status:
        </span>
        {ollamaStatus === "checking" ? (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArcSpinner size={14} stroke_width={2} />
            <span
              style={{ fontSize: 12, fontFamily: "Jost", color: mutedColor }}
            >
              Checking…
            </span>
          </div>
        ) : isRunning ? (
          <StatusBadge status="ok" label="Running" />
        ) : (
          <StatusBadge status="error" label="Not found" />
        )}
      </div>

      {/* Not found — offer installation */}
      {ollamaStatus === "not_found" && !installDone && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {installProgress === null && !installError && (
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                prefix_icon="skip_down"
                label="Download Ollama"
                onClick={handleInstall}
              />
              <Tooltip
                label="Check if Ollama is already installed"
                position="top"
              >
                <Button
                  prefix_icon="update"
                  label="Recheck"
                  onClick={handleRecheck}
                />
              </Tooltip>
            </div>
          )}

          {/* Progress bar */}
          {installProgress !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ArcSpinner size={14} stroke_width={2} />
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: "Jost",
                    color: mutedColor,
                  }}
                >
                  Downloading… {Math.round(installProgress)}%
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.07)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${installProgress}%`,
                    background: "rgba(10,186,181,1)",
                    borderRadius: 2,
                    transition: "width 0.2s linear",
                  }}
                />
              </div>
            </div>
          )}

          {installError && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon
                src="error"
                color="#e05c5c"
                style={{ width: 14, height: 14 }}
              />
              <span
                style={{
                  fontSize: 13,
                  fontFamily: "Jost",
                  color: "#e05c5c",
                }}
              >
                {installError}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Download done — prompt to install + recheck */}
      {installDone && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <StatusBadge
            status="ok"
            label="Download complete — open the installer"
          />
          <div
            style={{
              fontSize: 13,
              fontFamily: "Jost",
              color: mutedColor,
              lineHeight: 1.5,
            }}
          >
            Complete the Ollama installer, then click Recheck.
          </div>
          <Button
            prefix_icon="update"
            label="Recheck"
            onClick={handleRecheck}
          />
        </div>
      )}

      {/* Running */}
      {isRunning && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon
            src="check"
            color="rgba(10,186,181,1)"
            style={{ width: 14, height: 14 }}
          />
          <span
            style={{
              fontSize: 13,
              fontFamily: "Jost",
              color: mutedColor,
              lineHeight: 1.5,
            }}
          >
            Ollama is ready. You can pull models from the Model Providers
            settings after setup.
          </span>
        </div>
      )}
    </div>
  );
};

/* ── Provider label map ─────────────────────────────────────────────────────── */
const PROVIDER_META = {
  openai: { label: "OpenAI", placeholder: "sk-...", icon: "open_ai" },
  anthropic: {
    label: "Anthropic",
    placeholder: "sk-ant-...",
    icon: "Anthropic",
  },
  ollama: { label: "Ollama", placeholder: null, icon: "ollama" },
};

/* ── Main component ─────────────────────────────────────────────────────────── */
const ConfigureProvidersStep = ({
  selectedProviders,
  providerSubStep,
  setProviderSubStep,
  onNext,
}) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const headingColor = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.88)";
  const subColor = isDark ? "rgba(255,255,255,0.40)" : "rgba(0,0,0,0.38)";
  const dividerColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  const currentProvider = selectedProviders[providerSubStep];
  const meta = PROVIDER_META[currentProvider] || {};
  const isLast = providerSubStep === selectedProviders.length - 1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Heading with provider icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 6,
        }}
      >
        {meta.icon && (
          <Icon src={meta.icon} style={{ width: 22, height: 22 }} />
        )}
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "Jost",
            color: headingColor,
            letterSpacing: "-0.3px",
          }}
        >
          Configure {meta.label}
        </span>
      </div>
      <div
        style={{
          fontSize: 14,
          fontFamily: "Jost",
          color: subColor,
          marginBottom: 22,
          lineHeight: 1.5,
        }}
      >
        {selectedProviders.length > 1
          ? `Step ${providerSubStep + 1} of ${selectedProviders.length}`
          : `Set up your ${meta.label} connection`}
      </div>

      {/* Provider pills using Button + Icon */}
      {selectedProviders.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 22,
            flexWrap: "wrap",
          }}
        >
          {selectedProviders.map((pk, idx) => {
            const pmeta = PROVIDER_META[pk] || {};
            const isActive = idx === providerSubStep;
            return (
              <Button
                key={pk}
                prefix_icon={pmeta.icon}
                label={pmeta.label || pk}
                onClick={() => setProviderSubStep(idx)}
                style={{
                  root: {
                    fontSize: 12,
                    fontFamily: "Jost",
                    fontWeight: 500,
                    borderRadius: 999,
                    paddingVertical: 3,
                    paddingHorizontal: 12,
                    iconSize: 14,
                    gap: 5,
                    border: `1px solid ${
                      isActive ? "rgba(10,186,181,0.32)" : dividerColor
                    }`,
                    background: isActive
                      ? isDark
                        ? "rgba(10,186,181,0.14)"
                        : "rgba(10,186,181,0.10)"
                      : "transparent",
                    color: isActive
                      ? "rgba(10,186,181,1)"
                      : isDark
                        ? "rgba(255,255,255,0.40)"
                        : "rgba(0,0,0,0.35)",
                  },
                }}
              />
            );
          })}
        </div>
      )}

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: dividerColor,
          marginBottom: 22,
        }}
      />

      {/* Sub-step content */}
      <div style={{ marginBottom: 28 }}>
        {currentProvider === "openai" && (
          <ApiKeySubStep
            key="openai"
            providerKey="openai"
            label="OpenAI"
            placeholder="sk-..."
            isDark={isDark}
          />
        )}
        {currentProvider === "anthropic" && (
          <ApiKeySubStep
            key="anthropic"
            providerKey="anthropic"
            label="Anthropic"
            placeholder="sk-ant-..."
            isDark={isDark}
          />
        )}
        {currentProvider === "ollama" && (
          <OllamaSubStep key="ollama" isDark={isDark} />
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 8 }}>
        {providerSubStep > 0 && (
          <Button
            prefix_icon="arrow_left"
            label="Back"
            onClick={() => setProviderSubStep((s) => s - 1)}
            style={{
              fontSize: 13,
            }}
          />
        )}
        <Button
          label={
            isLast
              ? "Continue"
              : `Next: ${PROVIDER_META[selectedProviders[providerSubStep + 1]]?.label || ""}`
          }
          postfix_icon="arrow_right"
          style={{
            fontSize: 13,
          }}
          onClick={() => {
            if (isLast) {
              onNext();
            } else {
              setProviderSubStep((s) => s + 1);
            }
          }}
        />
      </div>
    </div>
  );
};

export default ConfigureProvidersStep;
