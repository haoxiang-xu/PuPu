import { useCallback, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import {
  FormField,
  FormInput,
  FormTextarea,
  PrimaryButton,
  SectionLabel,
  ActionButton,
} from "../components/shared";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";

const RUNTIME_OPTIONS = [
  {
    key: "local",
    icon: "server",
    label: "Local",
    description: "Run a local process via stdio",
  },
  {
    key: "remote",
    icon: "globe",
    label: "Remote",
    description: "Connect to a remote server via SSE / HTTP",
  },
];

const ManualPage = ({ isDark }) => {
  const [runtime, setRuntime] = useState(null);
  const [form, setForm] = useState({
    display_name: "",
    command: "",
    args: "",
    cwd: "",
    env: "",
    url: "",
    transport: "sse",
    headers: "",
    auth_token: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";

  const set = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload = { display_name: form.display_name, runtime };
      if (runtime === "local") {
        payload.command = form.command;
        payload.args = form.args ? form.args.split(/\s+/) : [];
        payload.cwd = form.cwd || undefined;
        payload.env = form.env
          ? Object.fromEntries(
              form.env
                .split("\n")
                .filter(Boolean)
                .map((l) => {
                  const idx = l.indexOf("=");
                  return idx > 0 ? [l.slice(0, idx), l.slice(idx + 1)] : null;
                })
                .filter(Boolean),
            )
          : undefined;
        payload.transport = "stdio";
      } else {
        payload.url = form.url;
        payload.transport = form.transport;
        payload.headers = form.headers
          ? Object.fromEntries(
              form.headers
                .split("\n")
                .filter(Boolean)
                .map((l) => {
                  const idx = l.indexOf(":");
                  return idx > 0
                    ? [l.slice(0, idx).trim(), l.slice(idx + 1).trim()]
                    : null;
                })
                .filter(Boolean),
            )
          : undefined;
        if (form.auth_token) {
          payload.requires_secrets = [
            { key: "AUTH_TOKEN", hint: "Authentication token" },
          ];
        }
      }
      const data = await api.mcp.createManualDraft(payload);
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to create draft");
    } finally {
      setLoading(false);
    }
  }, [form, runtime]);

  const canSubmit =
    form.display_name.trim() &&
    ((runtime === "local" && form.command.trim()) ||
      (runtime === "remote" && form.url.trim()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Description ── */}
      <p
        style={{
          fontSize: 12,
          fontFamily: "Jost",
          color: mutedColor,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Manually configure a new MCP server connection. Choose the runtime type
        to begin.
      </p>

      {/* ── Runtime selection ── */}
      {!runtime && (
        <>
          <SectionLabel isDark={isDark}>Select Runtime</SectionLabel>
          <div style={{ display: "flex", gap: 10 }}>
            {RUNTIME_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRuntime(opt.key)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "20px 16px",
                  borderRadius: 12,
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                  background: isDark
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.01)",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "rgba(91,156,244,0.35)";
                  e.currentTarget.style.background = isDark
                    ? "rgba(91,156,244,0.06)"
                    : "rgba(91,156,244,0.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.06)";
                  e.currentTarget.style.background = isDark
                    ? "rgba(255,255,255,0.02)"
                    : "rgba(0,0,0,0.01)";
                }}
              >
                <Icon
                  src={opt.icon}
                  style={{ width: 24, height: 24 }}
                  color={isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: "Jost",
                    fontWeight: 500,
                    color: textColor,
                  }}
                >
                  {opt.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "Jost",
                    color: mutedColor,
                    textAlign: "center",
                  }}
                >
                  {opt.description}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Form ── */}
      {runtime && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <ActionButton
              icon="arrow_left"
              label="Back"
              isDark={isDark}
              onClick={() => {
                setRuntime(null);
                setResult(null);
                setError(null);
              }}
            />
            <SectionLabel isDark={isDark}>
              {runtime === "local" ? "Local Server" : "Remote Server"}
            </SectionLabel>
          </div>

          <FormField label="Display Name" isDark={isDark} required>
            <FormInput
              isDark={isDark}
              placeholder="My MCP Server"
              value={form.display_name}
              onChange={set("display_name")}
            />
          </FormField>

          {runtime === "local" ? (
            <>
              <FormField
                label="Command"
                isDark={isDark}
                required
                hint="The executable to run (e.g., npx, python, node)"
              >
                <FormInput
                  isDark={isDark}
                  placeholder="npx"
                  value={form.command}
                  onChange={set("command")}
                />
              </FormField>

              <FormField
                label="Arguments"
                isDark={isDark}
                hint="Space-separated arguments"
              >
                <FormInput
                  isDark={isDark}
                  placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
                  value={form.args}
                  onChange={set("args")}
                />
              </FormField>

              <FormField label="Working Directory" isDark={isDark}>
                <FormInput
                  isDark={isDark}
                  placeholder="/path/to/project"
                  value={form.cwd}
                  onChange={set("cwd")}
                />
              </FormField>

              <FormField
                label="Environment Variables"
                isDark={isDark}
                hint="One per line: KEY=VALUE"
              >
                <FormTextarea
                  isDark={isDark}
                  placeholder={"NODE_ENV=production\nAPI_KEY=xxx"}
                  value={form.env}
                  onChange={set("env")}
                  rows={3}
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField label="Server URL" isDark={isDark} required>
                <FormInput
                  isDark={isDark}
                  placeholder="https://mcp.example.com/sse"
                  value={form.url}
                  onChange={set("url")}
                />
              </FormField>

              <FormField label="Transport" isDark={isDark}>
                <div style={{ display: "flex", gap: 6 }}>
                  {["sse", "streamable_http"].map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        setForm((prev) => ({ ...prev, transport: t }))
                      }
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        fontFamily: "JetBrains Mono",
                        color: form.transport === t ? "#5b9cf4" : mutedColor,
                        background:
                          form.transport === t
                            ? isDark
                              ? "rgba(91,156,244,0.1)"
                              : "rgba(91,156,244,0.06)"
                            : "transparent",
                        border: `1px solid ${
                          form.transport === t
                            ? "rgba(91,156,244,0.25)"
                            : isDark
                              ? "rgba(255,255,255,0.06)"
                              : "rgba(0,0,0,0.06)"
                        }`,
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField
                label="Custom Headers"
                isDark={isDark}
                hint="One per line: Header-Name: value"
              >
                <FormTextarea
                  isDark={isDark}
                  placeholder={"Authorization: Bearer xxx\nX-Custom: value"}
                  value={form.headers}
                  onChange={set("headers")}
                  rows={3}
                />
              </FormField>

              <FormField label="Auth Token" isDark={isDark}>
                <FormInput
                  isDark={isDark}
                  type="password"
                  placeholder="••••••••"
                  value={form.auth_token}
                  onChange={set("auth_token")}
                />
              </FormField>
            </>
          )}

          <PrimaryButton
            isDark={isDark}
            label="Create Draft"
            onClick={handleSubmit}
            loading={loading}
            disabled={!canSubmit}
          />

          {/* ── Error ── */}
          {error && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                background: isDark
                  ? "rgba(248,113,113,0.08)"
                  : "rgba(248,113,113,0.06)",
                border: "1px solid rgba(248,113,113,0.2)",
                fontSize: 12,
                fontFamily: "Jost",
                color: "#f87171",
              }}
            >
              {error}
            </div>
          )}

          {/* ── Success ── */}
          {result && (
            <div
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                background: isDark
                  ? "rgba(52,211,153,0.06)"
                  : "rgba(52,211,153,0.04)",
                border: "1px solid rgba(52,211,153,0.18)",
                fontSize: 12,
                fontFamily: "Jost",
                color: "#34d399",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Icon
                src="check"
                style={{ width: 14, height: 14, flexShrink: 0 }}
                color="#34d399"
              />
              Draft created. You can find it in the Installed tab.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ManualPage;
