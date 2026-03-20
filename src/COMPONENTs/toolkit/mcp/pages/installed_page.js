import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import InstalledRow from "../components/installed_row";
import { PrimaryButton } from "../components/shared";
import TestResult from "../components/test_result";

const InstalledPage = ({ isDark }) => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ── Detail / test state ── */
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const fetchServers = useCallback(() => {
    setLoading(true);
    api.mcp.listInstalledServers().then((data) => {
      setServers(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleRetest = useCallback(
    async (server) => {
      setTestingId(server.instance_id);
      setTestResult(null);
      const result = await api.mcp.testInstalledServer({
        instance_id: server.instance_id,
      });
      setTestResult({ ...result, instance_id: server.instance_id });
      setTestingId(null);
      fetchServers();
    },
    [fetchServers],
  );

  const handleToggle = useCallback(
    async (server) => {
      if (server.status === "enabled") {
        await api.mcp.disableInstalledServer({
          instance_id: server.instance_id,
        });
      } else {
        await api.mcp.enableInstalledServer({
          instance_id: server.instance_id,
        });
      }
      fetchServers();
    },
    [fetchServers],
  );

  const handleViewDetail = useCallback(
    (server) => {
      /* For now, trigger a re-test to show detail */
      handleRetest(server);
    },
    [handleRetest],
  );

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontFamily: "Jost",
            fontWeight: 500,
            color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)",
          }}
        >
          {servers.length} server{servers.length !== 1 ? "s" : ""} installed
        </span>
        <PrimaryButton
          isDark={isDark}
          label="Refresh"
          onClick={fetchServers}
          loading={loading}
          style={{ padding: "5px 12px", fontSize: 11 }}
        />
      </div>

      {/* ── Loading ── */}
      {loading && servers.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontSize: 12,
            fontFamily: "Jost",
            color: mutedColor,
          }}
        >
          Loading installed servers...
        </div>
      )}

      {/* ── Server list ── */}
      {servers.map((s) => (
        <div
          key={s.instance_id}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <InstalledRow
            server={s}
            isDark={isDark}
            onViewDetail={handleViewDetail}
            onRetest={handleRetest}
            onToggleEnable={handleToggle}
          />
          {/* Inline test result when testing this server */}
          {testingId === s.instance_id && (
            <div style={{ padding: "0 8px" }}>
              <TestResult result={null} isDark={isDark} />
            </div>
          )}
          {testResult &&
            testResult.instance_id === s.instance_id &&
            !testingId && (
              <div style={{ padding: "0 8px" }}>
                <TestResult result={testResult} isDark={isDark} />
              </div>
            )}
        </div>
      ))}

      {/* ── Empty state ── */}
      {!loading && servers.length === 0 && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontSize: 12,
            fontFamily: "Jost",
            color: mutedColor,
          }}
        >
          No servers installed yet. Browse the catalog to get started.
        </div>
      )}
    </div>
  );
};

export default InstalledPage;
