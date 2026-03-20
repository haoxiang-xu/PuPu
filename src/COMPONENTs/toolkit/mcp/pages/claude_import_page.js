import { useCallback, useRef, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import {
  FormField,
  FormTextarea,
  PrimaryButton,
  ActionButton,
  SectionLabel,
  Badge,
} from "../components/shared";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";

const ClaudeImportPage = ({ isDark }) => {
  const [mode, setMode] = useState("paste"); // paste | file
  const [jsonText, setJsonText] = useState("");
  const [importResult, setImportResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)";

  const handleImport = useCallback(
    async (text) => {
      setLoading(true);
      setError(null);
      setImportResult(null);
      try {
        const parsed = JSON.parse(text);
        const result = await api.mcp.importClaudeConfig(parsed);
        setImportResult(result);
      } catch (err) {
        setError(err.message || "Invalid JSON");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        setJsonText(text);
        handleImport(text);
      };
      reader.readAsText(file);
    },
    [handleImport],
  );

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
        Import MCP server configurations from Claude Desktop. Paste the JSON
        content of your <code style={{ fontFamily: "JetBrains Mono", fontSize: 11 }}>claude_desktop_config.json</code> or
        upload the file directly.
      </p>

      {/* ── Mode switcher ── */}
      <div style={{ display: "flex", gap: 6 }}>
        <ActionButton
          icon="code"
          label="Paste JSON"
          isDark={isDark}
          onClick={() => setMode("paste")}
          color={mode === "paste" ? "#5b9cf4" : undefined}
        />
        <ActionButton
          icon="upload_file"
          label="Upload File"
          isDark={isDark}
          onClick={() => {
            setMode("file");
            fileRef.current?.click();
          }}
          color={mode === "file" ? "#5b9cf4" : undefined}
        />
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={handleFileUpload}
        />
      </div>

      {/* ── Paste input ── */}
      {mode === "paste" && (
        <>
          <FormField label="Claude Desktop Config JSON" isDark={isDark}>
            <FormTextarea
              isDark={isDark}
              placeholder='{ "mcpServers": { ... } }'
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={8}
            />
          </FormField>
          <PrimaryButton
            isDark={isDark}
            label="Import"
            onClick={() => handleImport(jsonText)}
            loading={loading}
            disabled={!jsonText.trim()}
          />
        </>
      )}

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

      {/* ── Warnings ── */}
      {importResult?.warnings?.length > 0 && (
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
          {importResult.warnings.map((w, i) => (
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

      {/* ── Draft results ── */}
      {importResult?.entries?.length > 0 && (
        <>
          <SectionLabel isDark={isDark}>
            Found {importResult.entries.length} server{importResult.entries.length !== 1 ? "s" : ""}
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {importResult.entries.map((draft, i) => {
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
                    src="server"
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                    color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
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
                      {firstProfile?.runtime || "local"} · {firstProfile?.transport || "stdio"}
                    </div>
                  </div>
                  <Badge isDark={isDark} color="#60a5fa" bg="rgba(96,165,250,0.12)">
                    Draft
                  </Badge>
                </div>
              );
            })}
          </div>
        </>
      )}

      {importResult && importResult.entries?.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 20,
            fontSize: 12,
            fontFamily: "Jost",
            color: mutedColor,
          }}
        >
          No MCP server entries found in the config.
        </div>
      )}
    </div>
  );
};

export default ClaudeImportPage;
