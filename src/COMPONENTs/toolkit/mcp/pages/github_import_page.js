import { useCallback, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import {
  FormField,
  FormInput,
  PrimaryButton,
  SectionLabel,
  Badge,
} from "../components/shared";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";

const GitHubImportPage = ({ isDark }) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";

  const handleImport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await api.mcp.importGitHubRepo({ url: url.trim() });
      setResult(data);
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setLoading(false);
    }
  }, [url]);

  const isValidUrl =
    url.trim().startsWith("https://github.com/") ||
    url.trim().startsWith("github.com/");

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
        Import an MCP server directly from a GitHub repository. The repository
        should contain a valid MCP server configuration.
      </p>

      {/* ── URL input ── */}
      <FormField label="GitHub Repository URL" isDark={isDark}>
        <FormInput
          isDark={isDark}
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </FormField>

      <PrimaryButton
        isDark={isDark}
        label="Import Repository"
        onClick={handleImport}
        loading={loading}
        disabled={!isValidUrl}
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

      {/* ── Result ── */}
      {result && (
        <>
          <SectionLabel isDark={isDark}>Import Result</SectionLabel>

          {/* Warnings */}
          {result.warnings?.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "8px 12px",
                borderRadius: 8,
                background: isDark
                  ? "rgba(251,191,36,0.06)"
                  : "rgba(251,191,36,0.04)",
                border: "1px solid rgba(251,191,36,0.18)",
              }}
            >
              {result.warnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11.5,
                    fontFamily: "Jost",
                    color: "#fbbf24",
                  }}
                >
                  <Icon
                    src="warning"
                    style={{ width: 12, height: 12, flexShrink: 0 }}
                    color="#fbbf24"
                  />
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* Draft entries */}
          {result.entries?.length > 0 &&
            result.entries.map((draft, i) => {
              const firstProfile = draft.profile_candidates?.[0];
              return (
                <div
                  key={draft.entry_id || i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
                    background: isDark
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(0,0,0,0.01)",
                  }}
                >
                  <Icon
                    src="github"
                    style={{ width: 18, height: 18, flexShrink: 0 }}
                    color={
                      isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)"
                    }
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontFamily: "Jost",
                        fontWeight: 500,
                        color: textColor,
                      }}
                    >
                      {draft.display_name || `Server ${i + 1}`}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "Jost",
                        color: mutedColor,
                        marginTop: 2,
                      }}
                    >
                      {firstProfile?.runtime || "local"} ·{" "}
                      {firstProfile?.transport || "stdio"}
                    </div>
                  </div>
                  <Badge
                    isDark={isDark}
                    color="#60a5fa"
                    bg="rgba(96,165,250,0.12)"
                  >
                    Draft
                  </Badge>
                </div>
              );
            })}

          {/* Fallback to manual — no entries or all have warnings */}
          {result.entries?.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: 16,
                fontSize: 12,
                fontFamily: "Jost",
                color: mutedColor,
                lineHeight: 1.5,
              }}
            >
              Could not auto-detect configuration. Please use the Manual tab to
              configure this server.
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GitHubImportPage;
